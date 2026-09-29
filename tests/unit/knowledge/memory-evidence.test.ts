import { reviewFixture } from './review-fixture'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureObservationInput, MemoryFact, Observation } from '../../../src/shared/knowledge'
import { knowledgeObservationService, resetObservationServiceEphemeralState } from '../../../src/main/knowledge/observation-service'
import { deriveHabitPromotions, mergeHabitEvidence, proposeHabitCandidates } from '../../../src/main/knowledge/habit-aggregator'
import { runDeterministicStage } from '../../../src/main/knowledge/deterministic-extractor'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeRecallService } from '../../../src/main/knowledge/recall-service'
import { searchUserMemoryDefault } from '../../../src/main/knowledge/user-recall-service'
import { sourceEvidence } from '../../../src/main/knowledge/memory-evidence'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import { personalObservation } from './memory-observation.fixture'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({
  knowledgeProcessingQueue: { schedule: vi.fn() },
}))

const preference = '我习惯用 pnpm 而不用 npm'
const now = '2026-09-28T00:00:00.000Z'
const input: CaptureObservationInput = {
  workspaceId: 'user', workspacePath: 'user', source: 'janus-chat',
  type: 'conversation-turn', actor: 'user', content: preference, sessionId: 'chat-session',
}

describe('host memory evidence boundary', () => {
  let root: string
  const previousRoot = process.env.JANUSX_KNOWLEDGE_ROOT
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-memory-evidence-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = root
    resetObservationServiceEphemeralState()
  })
  afterEach(async () => {
    vi.useRealTimers()
    await rm(root, { recursive: true, force: true })
    if (previousRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousRoot
  })

  it('ignores forged scope and trusted source fields in capture payloads', async () => {
    const forged = {
      ...input, workspaceId: 'project-a', workspacePath: 'C:/project-a',
      scope: 'global', sourceEvidence: { speaker: 'user', authority: 'user-stated' },
    }
    const observation = await knowledgeObservationService.capture(forged)
    expect(observation.scope).toBe('project')
    expect(observation.sourceEvidence).toMatchObject({ speaker: 'unknown', authority: 'unverified' })
    const manual = await knowledgeObservationService.capture({ ...input, source: 'manual', type: 'user-note' })
    expect(sourceEvidence(manual).authority).toBe('unverified')
    expect(await deriveHabitPromotions([manual, manual, manual])).toEqual([])
  })

  it.each(['agent-stream', 'checkpoint', 'git-analyzer', 'tool', 'blueprint-maintenance'] as const)('preserves %s engineering evidence through review and truth reading', async source => {
    const observation = await knowledgeObservationService.capture({ workspaceId: 'project-a', workspacePath: 'C:/project-a', source,
      type: 'analysis-result', content: '决定：采用软删除方案', actor: 'engineering-host', fileRefs: ['src/item.ts'] }, { speaker: 'tool', sourceEventId: 'engineering-event' })
    expect((await knowledgeObservationService.listAll(true)).some(row => row.id === observation.id)).toBe(true)
    await runDeterministicStage({ workspaceId: 'project-a', observations: [observation] })
    const candidate = (await knowledgeExtractService.listFactCandidates()).find(item => item.fact.content.includes('软删除'))!
    expect(candidate).toBeDefined()
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))
    const fact = (await knowledgeTruthService.list()).facts.find(item => item.id === candidate.fact.id)!
    expect(fact.provenance.sourceObservationIds).toContain(observation.id)
    expect(fact.provenance.sourceEvidence?.[0]).toMatchObject({ source, authority: 'tool-observed', workspaceId: 'project-a' })
    expect(await deriveHabitPromotions([observation, observation, observation])).toEqual([])
  })

  it('reserves global assignment for host context and carries it into truth', async () => {
    const globalInput = { ...input, workspaceId: 'global', workspacePath: 'global', content: 'we decided to share a convention' }
    expect((await knowledgeObservationService.capture(globalInput)).scope).toBe('project')
    const observation = await knowledgeObservationService.capture(globalInput, { scope: 'global', speaker: 'user', sourceEventId: 'global-note' })
    await runDeterministicStage({ workspaceId: 'global', observations: [observation] })
    const [candidate] = await knowledgeExtractService.listFactCandidates()
    expect(candidate.fact.scope).toBe('global')
    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))
    expect(result.applied?.fact?.scope).toBe('global')
    expect(result.applied?.fact?.provenance.sourceEvidence).toEqual(candidate.evidence.sources)
  })

  it('deduplicates concurrent retries while keeping separate speakers and real turns', async () => {
    const retries = await Promise.all(Array.from({ length: 3 }, () =>
      knowledgeObservationService.capture(input, { speaker: 'user', sourceEventId: 'turn-1' })))
    expect(new Set(retries.map((record) => record.id)).size).toBe(1)
    const assistant = await knowledgeObservationService.capture({ ...input, actor: 'assistant' }, { speaker: 'assistant', sourceEventId: 'turn-1' })
    expect(assistant.id).not.toBe(retries[0].id)
    expect(assistant.sourceEvidence?.authority).toBe('model-generated')
    const second = await knowledgeObservationService.capture(input, { speaker: 'user', sourceEventId: 'turn-2' })
    const third = await knowledgeObservationService.capture(input, { speaker: 'user', sourceEventId: 'turn-3' })
    expect(new Set([retries[0].id, second.id, third.id]).size).toBe(3)
    const [promotion] = await deriveHabitPromotions([...retries, assistant, second, third])
    expect(promotion.frequency).toBe(3)
    expect(promotion.sources?.every((source) => source.speaker === 'user')).toBe(true)
  })

  it('finds event retries after restart and monthly shard rollover', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-31T23:59:59Z'))
    const first = await knowledgeObservationService.capture(input, { speaker: 'user', sourceEventId: 'turn' })
    resetObservationServiceEphemeralState()
    vi.setSystemTime(new Date('2026-09-01T00:00:01Z'))
    const retry = await knowledgeObservationService.capture(input, { speaker: 'user', sourceEventId: 'turn' })
    expect(retry.id).toBe(first.id)
    expect(await knowledgeObservationService.listAll()).toHaveLength(1)
  })

  it('excludes assistant, tools, unattributed engineering, and legacy statements from habit frequency', async () => {
    const user = personalObservation({ id: 'real', content: preference, createdAt: now })
    const excluded: Observation[] = [
      { ...user, id: 'engineering', workspaceId: 'project-a', scope: 'project', sourceEvidence: undefined },
      { ...user, id: 'assistant', actor: 'assistant', sourceEvidence: { ...user.sourceEvidence!, speaker: 'assistant', authority: 'model-generated' } },
      { ...user, id: 'tool', source: 'tool', type: 'tool-result' },
      { ...user, id: 'legacy', sourceEvidence: undefined },
    ]
    expect(await deriveHabitPromotions([user, ...excluded, ...excluded])).toEqual([])
    const duplicateRows = [1, 2, 3].map((index) => ({ ...user, id: `copy-${index}`,
      sourceEvidence: { ...user.sourceEvidence!, observationId: `copy-${index}` } }))
    expect(await deriveHabitPromotions(duplicateRows)).toEqual([])
  })

  it('learns attributable development habits across projects without changing project facts', async () => {
    for (const [index, workspaceId] of ['project-a', 'project-b', 'project-a'].entries()) {
      const observation = await knowledgeObservationService.capture({ ...input, workspaceId, workspacePath: `C:/${workspaceId}` },
        { speaker: 'user', sourceEventId: `engineering-turn-${index}` })
      await runDeterministicStage({ workspaceId, observations: [observation] })
    }
    const candidates = await knowledgeExtractService.listFactCandidates()
    const habits = candidates.filter((candidate) => candidate.fact.tags.includes('habit'))
    expect(habits).toHaveLength(1)
    expect(habits[0].fact.scope).toBe('user')
    expect(new Set(habits[0].evidence.sources?.map((evidence) => evidence.workspaceId))).toEqual(new Set(['project-a', 'project-b']))
    expect(habits[0].evidence.sources?.every((evidence) => evidence.scope === 'project' && evidence.speaker === 'user')).toBe(true)
    const engineering = candidates.filter((candidate) => !candidate.fact.tags.includes('habit'))
    expect(engineering).toHaveLength(3)
    expect(engineering.every((candidate) => candidate.fact.scope === 'project')).toBe(true)
    const approvedProject = await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: engineering[0].id }))
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: habits[0].id }))
    const shared = await knowledgeRecallService.recall({ query: 'pnpm', layer: 'truth', allowGlobal: true })
    expect(shared.documents.map((document) => document.hit.id)).toEqual([approvedProject.applied!.fact!.id])
  })

  it('counts one user turn attached to multiple projects as one occurrence', async () => {
    const observations: Observation[] = []
    for (const workspaceId of ['project-a', 'project-b', 'project-c']) {
      observations.push(await knowledgeObservationService.capture({ ...input, workspaceId, workspacePath: `C:/${workspaceId}` },
        { speaker: 'user', sourceEventId: 'one-shared-turn' }))
    }
    expect(await deriveHabitPromotions(observations)).toEqual([])
  })

  it('does not reinforce frequency or strength when merging the same evidence again', () => {
    const [promotion] = proposeHabitCandidates([1, 2, 3].map((index) => ({ id: `e-${index}`, content: preference, createdAt: now })))
    expect(mergeHabitEvidence(promotion, promotion)).toEqual(promotion)
    const incoming = { ...promotion, evidenceObservationIds: ['e-2', 'e-3', 'e-4'], evidenceEventKeys: ['e-2', 'e-3', 'e-4'] }
    expect(mergeHabitEvidence(promotion, incoming).frequency).toBe(4)
    const aliases = { ...promotion, evidenceObservationIds: ['alias-1', 'alias-2', 'alias-3'] }
    expect(mergeHabitEvidence(promotion, aliases)).toEqual(promotion)
  })

  it('accumulates real turns across batches, preserves evidence through approval, and replays idempotently', async () => {
    let last!: Observation
    for (let turn = 1; turn <= 3; turn++) {
      last = await knowledgeObservationService.capture(input, { speaker: 'user', sourceEventId: `turn-${turn}` })
      await runDeterministicStage({ workspaceId: 'user', observations: [last] })
    }
    const before = await knowledgeExtractService.listFactCandidates()
    const habits = before.filter((candidate) => candidate.fact.tags.includes('habit'))
    expect(habits).toHaveLength(1)
    expect(habits[0].evidence.sources).toHaveLength(3)
    expect(habits[0].evidence.sources?.every((evidence) => evidence.sessionId === 'chat-session' && evidence.excerpt === preference)).toBe(true)
    const approved = await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: habits[0].id }))
    expect(approved.applied?.fact?.provenance.sourceEvidence).toEqual(habits[0].evidence.sources)
    const replay = await runDeterministicStage({ workspaceId: 'user', observations: [last] })
    expect(replay.proposals).toBe(0)
    expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(before.length)
    expect((await searchUserMemoryDefault('pnpm')).items.map((item) => item.id)).toContain(habits[0].fact.id)
    const shared = await knowledgeRecallService.recall({ query: 'pnpm', layer: 'truth', allowGlobal: true })
    expect(shared.documents).toEqual([])
  })

  it('does not recreate a rejected deterministic candidate on replay', async () => {
    const observation = await knowledgeObservationService.capture({ ...input, workspaceId: 'project-a', workspacePath: 'C:/project-a' })
    const batch = { workspaceId: 'project-a', observations: [observation] }
    await runDeterministicStage(batch)
    const [candidate] = await knowledgeExtractService.listFactCandidates()
    await knowledgeReviewService.rejectCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))
    expect((await runDeterministicStage(batch)).proposals).toBe(0)
    expect((await knowledgeExtractService.listFactCandidates())[0].status).toBe('rejected')
  })

  it('rejects malformed new source evidence while keeping valid rows readable', async () => {
    const observation = await knowledgeObservationService.capture(input, { speaker: 'user', sourceEventId: 'original' })
    const shard = join(root, 'observations', 'active', `${observation.createdAt.slice(0, 7)}.jsonl`)
    await writeFile(shard, [
      observation,
      { ...observation, id: 'invalid-scope', scope: 'everyone' },
      { ...observation, id: 'invalid-authority', sourceEvidence: {
        ...observation.sourceEvidence, observationId: 'invalid-authority', authority: 'server-verified',
      } },
    ].map((record) => JSON.stringify(record)).join('\n') + '\n')
    expect((await knowledgeObservationService.listAll()).map((record) => record.id)).toEqual([observation.id])
    await vi.waitFor(async () => expect((await knowledgeAuditService.list()).some((event) => event.action === 'schema_violation')).toBe(true))
  })

  it('rejects mixed-workspace extraction before any candidates are written', async () => {
    const personal = personalObservation({ id: 'user-source', content: preference, createdAt: now })
    const engineering = await knowledgeObservationService.capture({ ...input, workspaceId: 'project-a', workspacePath: 'C:/project-a' })
    await expect(runDeterministicStage({ workspaceId: 'project-a', observations: [engineering, personal] })).rejects.toThrow('workspace and memory scope')
    await expect(knowledgeExtractService.extract({ observations: [engineering, personal], workspaceId: 'user' })).rejects.toThrow('workspace and memory scope')
    expect(await knowledgeExtractService.listFactCandidates()).toEqual([])
  })

  it('keeps legacy records readable without promoting unverified personal facts into stable recall', async () => {
    const observation = await knowledgeObservationService.capture(input)
    const shard = join(root, 'observations', 'active', `${observation.createdAt.slice(0, 7)}.jsonl`)
    const { scope: _scope, sourceEvidence: _evidence, ...legacy } = observation
    await writeFile(shard, JSON.stringify(legacy) + '\n')
    const [restored] = await knowledgeObservationService.listAll()
    expect(restored.id).toBe(observation.id)
    expect(sourceEvidence(restored).authority).toBe('unverified')
    const fact = (workspaceId: string): MemoryFact => ({
      id: `legacy-${workspaceId}`, content: 'pnpm workspace convention', kind: 'preference', concepts: [], files: [], tags: [],
      confidence: 0.8, version: 1, status: 'active',
      provenance: { workspaceId, workspaceName: workspaceId, workspacePath: '', source: 'manual',
        sourceObservationIds: [], fileRefs: [], actor: 'legacy', createdAt: now },
    })
    await mkdir(join(root, 'facts'), { recursive: true })
    await writeFile(join(root, 'facts', 'facts.jsonl'), [fact('user'), fact('project-a')].map((value) => JSON.stringify(value)).join('\n') + '\n')
    expect((await knowledgeTruthService.list()).facts).toHaveLength(2)
    expect((await searchUserMemoryDefault('pnpm')).items.map((item) => item.id)).not.toContain('legacy-user')
    const shared = await knowledgeRecallService.recall({ query: 'pnpm', layer: 'truth', allowGlobal: true })
    expect(shared.documents.map((document) => document.hit.id)).toEqual(['legacy-project-a'])
    expect(await readFile(shard, 'utf8')).not.toContain('sourceEvidence')
  })
})
