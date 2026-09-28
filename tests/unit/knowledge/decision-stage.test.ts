import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CandidateFact, Observation } from '../../../src/shared/knowledge'
import { MemoryDecisionStage, REFINEMENT_CHAR_BUDGET } from '../../../src/main/knowledge/decision-stage'
import { DECISION_TEMPLATE_VERSION, type DecisionScorer, type MemoryDecisionInput } from '../../../src/main/knowledge/decision-scorer'
import { knowledgeObservationService, resetObservationServiceEphemeralState } from '../../../src/main/knowledge/observation-service'
import { knowledgeProcessingQueue, KnowledgeProcessingQueue } from '../../../src/main/knowledge/processing-queue'
import { runDeterministicStage } from '../../../src/main/knowledge/deterministic-extractor'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { runLlmStage } from '../../../src/main/knowledge/llm-stage'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

function output(input: MemoryDecisionInput, uncertain = true) {
  return { status: 'ready', answers: ['retention', 'kind', 'support', 'duplicate', 'supersede', 'conflict'].map((question) => {
    if (question === 'kind') return { question, answer: input.kind, answer_confidence: 0.97,
      distribution: Object.fromEntries(['fact', 'decision', 'preference', 'procedure'].map((kind) => [kind, kind === input.kind ? 0.97 : 0.01])) }
    const answer = question === 'retention' || question === 'support'
    const selected = uncertain && question === 'support' ? 0.6 : 0.98
    const noul = answer ? selected : 1 - selected
    return { question, answer, answer_confidence: selected, noul, distribution: { true: noul, false: 1 - noul } }
  }) }
}

function model(score: DecisionScorer['score'] = async (input) => output(input)): DecisionScorer {
  return { identity: { provider: 'test-laya', modelRevision: 'pinned', templateVersion: DECISION_TEMPLATE_VERSION, calibrationId: null }, score }
}

describe('queue-owned memory decision gate', () => {
  let root: string
  const previousRoot = process.env.JANUSX_KNOWLEDGE_ROOT
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-decisions-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = root
    resetObservationServiceEphemeralState()
    vi.spyOn(knowledgeProcessingQueue, 'schedule').mockImplementation(() => undefined)
    vi.spyOn(knowledgeProcessingQueue, 'scheduleImmediate').mockImplementation(() => undefined)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
    if (previousRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousRoot
  })

  async function capture(workspaceId = 'project', content = 'Decided to use Postgres for durable storage.'): Promise<Observation> {
    return knowledgeObservationService.capture({ workspaceId, workspaceName: workspaceId, workspacePath: `C:/work/${workspaceId}`,
      source: 'manual', type: 'user-note', actor: 'user', content }, { speaker: 'user' })
  }
  async function seed() {
    const observation = await capture()
    const batch = { workspaceId: observation.workspaceId, observations: [observation] }
    await runDeterministicStage(batch)
    const [candidate] = await knowledgeExtractService.listFactCandidates()
    expect(candidate).toBeDefined()
    return { observation, batch, candidate: candidate! }
  }

  it('runs the real offline queue without automatic LLM even under legacy auto mode', async () => {
    await capture()
    const queue = new KnowledgeProcessingQueue()
    const extractChunk = vi.fn()
    queue.configureDeterministicHandler(async (batch) => { await runDeterministicStage(batch) })
    queue.configureLlmHandler((batch) => runLlmStage(batch, { getMode: async () => 'auto', hasDefaultModel: async () => true, extractChunk }))
    try {
      expect((await queue.processNow()).processed).toBe(1)
      expect(await queue.listFailures()).toEqual([])
      expect(extractChunk).not.toHaveBeenCalled()
      const [candidate] = await knowledgeExtractService.listFactCandidates()
      expect(candidate).toMatchObject({ status: 'proposed', decision: { scorer: { provider: 'noop' }, route: 'review' } })
      await knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate!.id })
    } finally { queue.dispose() }
  })

  it('only refines selected evidence when settings and the model permit it', async () => {
    const { batch, candidate } = await seed()
    const stage = new MemoryDecisionStage()
    stage.configureScorer(model())
    const extractChunk = vi.fn(async () => ({ proposed: 0, merged: 1 }))
    const deps = { selectRefinement: (input: typeof batch) => stage.run(input), hasDefaultModel: async () => true, extractChunk }
    expect(await runLlmStage(batch, { ...deps, getMode: async () => 'deterministic-only' })).toMatchObject({ skippedReason: 'deterministic-only' })
    expect(extractChunk).not.toHaveBeenCalled()
    expect(await runLlmStage(batch, { ...deps, getMode: async () => 'auto' })).toMatchObject({ processed: 1, merged: 1 })
    expect(extractChunk.mock.calls[0]?.[0]).toEqual(batch.observations)
    const [stored] = await knowledgeExtractService.listFactCandidates()
    expect(stored?.fact).toEqual(candidate.fact)
    expect(stored?.decision).toMatchObject({ status: 'ready', route: 'refine' })
  })

  it('filters cross-project and private truth before giving related records to the scorer', async () => {
    const { batch, candidate } = await seed()
    const own = { ...candidate.fact, id: 'own', status: 'active' }
    const other = { ...own, id: 'other', provenance: { ...own.provenance, workspaceId: 'other' } }
    const privateFact = { ...own, id: 'private', scope: 'user', provenance: { ...own.provenance, workspaceId: 'user' } }
    await writeFile(join(root, 'facts', 'facts.jsonl'), [own, other, privateFact].map((fact) => JSON.stringify(fact)).join('\n') + '\n')
    const score = vi.fn(async (input: MemoryDecisionInput) => {
      expect(input.relatedFacts.map((fact) => fact.id)).toEqual(['own'])
      expect(input.evidence.every((evidence) => evidence.source.workspaceId === batch.workspaceId)).toBe(true)
      return output(input, false)
    })
    const stage = new MemoryDecisionStage()
    stage.configureScorer(model(score))
    expect((await stage.run(batch)).observations).toEqual([])
    expect(score).toHaveBeenCalledOnce()
  })

  it('does not overwrite review completed while scoring was running', async () => {
    const { batch, candidate } = await seed()
    const stage = new MemoryDecisionStage()
    stage.configureScorer(model(async (input) => {
      await knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })
      return output(input)
    }))
    expect((await stage.run(batch)).observations).toEqual([])
    const [stored] = await knowledgeExtractService.listFactCandidates()
    expect(stored).toMatchObject({ status: 'applied' })
    expect(stored?.decision).toBeUndefined()
  })

  it('ignores advice when candidate content changed during scoring', async () => {
    const { batch, candidate } = await seed()
    const stage = new MemoryDecisionStage()
    stage.configureScorer(model(async (input) => {
      await writeFile(join(root, 'facts', 'candidates.jsonl'), JSON.stringify({ ...candidate, fact: { ...candidate.fact, content: 'Corrected content.' } }) + '\n')
      return output(input)
    }))
    expect((await stage.run(batch)).observations).toEqual([])
    expect((await knowledgeExtractService.listFactCandidates())[0]?.decision).toBeUndefined()
  })

  it('keeps truncated evidence on the manual path without calling the scorer', async () => {
    const observation = await capture('project', 'Decided to use Postgres. ' + 'long evidence '.repeat(600))
    const batch = { workspaceId: observation.workspaceId, observations: [observation] }
    await runDeterministicStage(batch)
    const score = vi.fn(async (input: MemoryDecisionInput) => output(input))
    const stage = new MemoryDecisionStage()
    stage.configureScorer(model(score))
    expect((await stage.run(batch)).observations).toEqual([])
    expect(score).not.toHaveBeenCalled()
    expect((await knowledgeExtractService.listFactCandidates())[0]?.decision).toMatchObject({ truncated: true, route: 'review' })
  })

  it.each(['evidence', 'truth', 'model'] as const)('invalidates scoring when %s changes in flight', async (change) => {
    const { observation, candidate } = await seed()
    let observations = [observation]
    let truths: typeof candidate.fact[] = []
    const annotate = vi.fn(async (updates: Map<string, unknown>) => [...updates.keys()])
    const stage = new MemoryDecisionStage({ listCandidates: async () => [candidate], listObservations: async () => observations,
      listTruth: async () => truths, resolveContent: async (record) => record.content, annotate })
    stage.configureScorer(model(async (input) => {
      if (change === 'evidence') observations = [{ ...observation, episodeStatus: 'expired' }]
      if (change === 'truth') truths = [{ ...candidate.fact, id: 'new-truth', status: 'active' }]
      if (change === 'model') stage.configureScorer(model())
      return output(input)
    }))
    expect((await stage.run({ workspaceId: observation.workspaceId, observations: [observation] })).observations).toEqual([])
    expect(annotate.mock.calls[0]?.[0].get(candidate.id)).toMatchObject({ status: 'unavailable', route: 'review', reason: 'context-changed' })
  })

  it('does not refine user candidates using unverified project evidence', async () => {
    const { observation, candidate } = await seed()
    const unverified: Observation = { ...observation, sourceEvidence: undefined }
    const personal: CandidateFact = { ...candidate, fact: { ...candidate.fact, scope: 'user',
      provenance: { ...candidate.fact.provenance, workspaceId: 'user' } } }
    const score = vi.fn(async (input: MemoryDecisionInput) => output(input))
    const stage = new MemoryDecisionStage({ listCandidates: async () => [personal], listObservations: async () => [unverified],
      listTruth: async () => [], resolveContent: async (record) => record.content, annotate: async (updates) => [...updates.keys()] })
    stage.configureScorer(model(score))
    expect((await stage.run({ workspaceId: observation.workspaceId, observations: [unverified] })).observations).toEqual([])
    expect(score).not.toHaveBeenCalled()
  })

  it('preserves damaged candidate files when recording annotations fails', async () => {
    const { batch } = await seed()
    const stage = new MemoryDecisionStage()
    stage.configureScorer(model(async (input) => {
      await writeFile(join(root, 'facts', 'candidates.jsonl'), '{broken')
      return output(input)
    }))
    await expect(stage.run(batch)).rejects.toThrow()
    expect(await readFile(join(root, 'facts', 'candidates.jsonl'), 'utf8')).toBe('{broken')
  })

  it('bounds total refinement characters and preserves whole evidence records', async () => {
    const { observation, candidate } = await seed()
    const observations = Array.from({ length: 15 }, (_, i) => ({ ...observation, id: `observation-${i}`, content: 'x'.repeat(5000) }))
    const candidates: CandidateFact[] = observations.map((record, i) => ({ ...candidate, id: `candidate-${i}`,
      evidence: { observationIds: [record.id] }, fact: { ...candidate.fact, id: `fact-${i}` } }))
    const stage = new MemoryDecisionStage({ listCandidates: async () => candidates, listObservations: async () => observations,
      listTruth: async () => [], resolveContent: async (record) => record.content, annotate: async (updates) => [...updates.keys()] })
    stage.configureScorer(model())
    const { observations: selected } = await stage.run({ workspaceId: observation.workspaceId, observations })
    expect(selected.reduce((sum, record) => sum + record.content.length, 0)).toBe(REFINEMENT_CHAR_BUDGET)
    expect(selected).toHaveLength(12)
    expect(selected.every((record) => record.content.length === 5000)).toBe(true)
  })
})
