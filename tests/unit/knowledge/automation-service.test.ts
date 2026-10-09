import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeAutomationService, type AutomationDeps } from '../../../src/main/knowledge/automation-service'
import { defaultKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
import type { CandidateFact, CandidateWikiPatch, MemoryFact } from '../../../src/shared/knowledge'
import { wikiPageUri } from '../../../src/shared/wiki-relations'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeReviewService, proposeFactCandidates, proposeDerivedCandidates } from '../../../src/main/knowledge/review-service'
import { sourceEvidence } from '../../../src/main/knowledge/memory-evidence'
import { listWikiHistory } from '../../../src/main/knowledge/wiki-history'
import { reviewCandidateInput } from '../../../src/shared/review-candidate-snapshot'
import { COVERAGE_SYSTEM } from '../../../src/main/knowledge/extraction-context'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/contract-service', () => ({ knowledgeContractService: { bootstrapWorkspace: vi.fn() } }))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({ knowledgeProcessingQueue: { schedule: vi.fn() } }))
let root: string, now: number, allowed: boolean
let config: ReturnType<typeof defaultKnowledgeAutomation>, deps: AutomationDeps, service: KnowledgeAutomationService
const json = vi.fn(), review = vi.fn(), curate = vi.fn(), coverage = vi.fn()
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'automation-')); vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root)
  now = Date.now(); allowed = true; config = defaultKnowledgeAutomation(); config.enabled = true; config.enabledSince = '2020-01-01T00:00:00.000Z'
  config.local.enabled = true
  for (const stage of ['entryReview', 'wikiGeneration', 'wikiReview'] as const) config.stages[stage].provider = 'local'
  json.mockReset(); review.mockReset()
  coverage.mockReset().mockImplementation(input => ({ complete: true, coveredEvidenceIds: input.evidence.map(part => part.key), missing: [], invalidCandidateIds: [], reason: 'All supplied evidence and retained conditions checked.' }))
  curate.mockReset().mockImplementation(input => ({ complete: true, selections: input.candidates.map((_item, index) => ({ index, action: 'keep', equivalentTo: null, duplicateOf: null })) }))
  review.mockImplementation(async (_request, required) => ({ verdict: 'supported', reason: 'evidence supported', complete: true, conflict: false, coveredIds: required.map(item => item.id) }))
  json.mockImplementation(async request => ({ markdown: request.input.knowledge.map(item => item.content).join('\n\n') }))
  deps = { settings: async () => ({ allowed, config: structuredClone(config) }), snapshot: async () => {
    const truth = await knowledgeTruthService.list({ includeStaleWiki: true })
    return { observations: await knowledgeObservationService.listAll(true), candidates: await knowledgeExtractService.listFactCandidates(),
      patches: await knowledgeExtractService.listWikiPatchCandidates(), facts: truth.facts, pages: truth.wikiPages }
  }, content: observation => knowledgeObservationService.resolveContent(observation), json: request => {
    const input = request.input as { candidates?: unknown[] }
    if (request.system === COVERAGE_SYSTEM) return Promise.resolve(coverage(input))
    if (input.candidates) {
      const result = curate(input)
      return Promise.resolve({ ...result, selections: result.selections.map(item => ({ reason: 'Fixture curation rationale.', ...item })) })
    }
    return json(request)
  }, review, now: () => now }
  service = new KnowledgeAutomationService(deps)
})
afterEach(async () => { service.stop(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })
async function candidate(index: number, concept = 'workflow'): Promise<CandidateFact> {
  const observation = await knowledgeObservationService.capture({ workspaceId: 'project', workspaceName: 'Project', workspacePath: root,
    source: 'manual', type: 'user-note', content: `Module ${index} uses the documented backup workflow.`, tags: [] }, { speaker: 'user', createdAt: new Date(now - 60000).toISOString() })
  const evidence = sourceEvidence(observation)
  const item: CandidateFact = { id: `candidate-${index}`, type: 'fact', status: 'proposed', derivation: 'llm', evidence: { observationIds: [observation.id], sources: [evidence] },
    fact: { id: `fact-${index}`, content: observation.content, kind: 'procedure', scope: 'project', status: 'proposed', confidence: 0, concepts: [concept], files: [], tags: [], version: 1,
      provenance: { workspaceId: 'project', workspaceName: 'Project', workspacePath: root, source: 'manual', actor: 'tester', createdAt: observation.createdAt,
        sourceObservationIds: [observation.id], sourceEvidence: [evidence], fileRefs: [] } } }
  await proposeFactCandidates([item]); return item
}
async function facts(items: MemoryFact[]) { await mkdir(join(root, 'facts'), { recursive: true }); await writeFile(join(root, 'facts/facts.jsonl'), items.map(item => JSON.stringify(item)).join('\n') + '\n') }
describe('durable knowledge automation', () => {
  it('projects resolved candidates beside immutable failures and removes them from current work without running automation', async () => {
    const item = await candidate(1)
    review.mockResolvedValue({ verdict: 'uncertain', reason: 'evidence-coverage-or-conflict-needs-review', complete: false, conflict: false, coveredIds: [] })
    await service.run()
    const path = join(root, 'processing/automation-tasks.json')
    const persisted = await readFile(path, 'utf8')
    const snapshot = await deps.snapshot()
    deps.snapshot = vi.fn(async () => snapshot)
    const current = (await service.status()).queue.find(task => task.subject === item.id)!
    expect(current.subjectState).toEqual({ kind: 'candidate', target: { id: item.id, type: 'fact', workspaceId: 'project', status: 'proposed' } })
    for (const state of ['approved', 'applied', 'rejected'] as const) {
      snapshot.candidates[0].status = state
      const status = await service.status()
      expect(status.queue.some(task => task.subject === item.id)).toBe(false)
      expect(status.tasks.find(task => task.id === current.id)).toMatchObject({ status: 'needs-review', subjectState: { kind: 'candidate', target: { status: state } } })
    }
    snapshot.candidates[0].fact.provenance.workspaceId = 'different-workspace'
    expect((await service.status()).tasks.find(task => task.id === current.id)?.subjectState).toEqual({ kind: 'unavailable' })
    snapshot.candidates = []
    expect((await service.status()).tasks.find(task => task.id === current.id)?.subjectState).toEqual({ kind: 'unavailable' })
    expect(await readFile(path, 'utf8')).toBe(persisted)
  })

  it('distinguishes missing generation output from exact wiki candidates and hides object state when review closes', async () => {
    await candidate(1)
    review.mockResolvedValue({ verdict: 'uncertain', reason: 'source-needs-human-review', complete: false, conflict: false, coveredIds: [] })
    await service.run()
    const path = join(root, 'processing/automation-tasks.json')
    const ledger = JSON.parse(await readFile(path, 'utf8'))
    ledger.tasks.push({ ...ledger.tasks[0], id: 'generation', stage: 'wikiGeneration', subject: 'topic' },
      { ...ledger.tasks[0], id: 'extraction', stage: 'extraction', subject: 'source' },
      { ...ledger.tasks[0], id: 'wiki-review', stage: 'wikiReview', subject: 'draft' })
    await writeFile(path, JSON.stringify(ledger))
    const snapshot = await deps.snapshot()
    deps.snapshot = vi.fn(async () => snapshot)
    const state = await service.status()
    expect(state.tasks.find(task => task.id === 'generation')?.subjectState).toEqual({ kind: 'no-candidate' })
    expect(state.tasks.find(task => task.id === 'extraction')?.subjectState).toEqual({ kind: 'no-candidate' })
    expect(state.tasks.find(task => task.id === 'wiki-review')?.subjectState).toEqual({ kind: 'unavailable' })
    const patch = { id: 'auto-wiki:generation', type: 'wiki-patch', status: 'rejected', provenance: { workspaceId: 'project' } } as CandidateWikiPatch
    snapshot.patches.push(patch, { ...patch, id: 'draft' })
    for (const id of ['generation', 'wiki-review']) expect((await service.status()).tasks.find(task => task.id === id)?.subjectState)
      .toMatchObject({ kind: 'candidate', target: { type: 'wiki-patch', workspaceId: 'project', status: 'rejected' } })
    allowed = false
    expect((await service.status()).tasks.find(task => task.id === 'generation')?.subjectState?.kind).toBe('candidate')
    deps.settings = async () => ({ allowed: false, reviewEnabled: false, config })
    vi.mocked(deps.snapshot).mockClear()
    expect((await service.status()).tasks.every(task => task.subjectState === undefined)).toBe(true)
    expect(deps.snapshot).not.toHaveBeenCalled()
  })

  it('recovers a missing OpenCode turn from its database before extracting with the real capture pipeline', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const path = join(root, 'opencode.db')
    const db = new DatabaseSync(path)
    try {
      db.exec('CREATE TABLE session (id TEXT, directory TEXT); CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT); CREATE TABLE part (id TEXT, message_id TEXT, time_created INTEGER, data TEXT)')
      db.prepare('INSERT INTO session VALUES (?, ?)').run('session', root)
      for (const [id, time, role, text] of [['u', now - 2000, 'user', 'Check the cache'], ['a', now - 1000, 'assistant', 'The cache check is complete.']] as const) {
        db.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run(id, 'session', time, JSON.stringify({ role }))
        db.prepare('INSERT INTO part VALUES (?, ?, ?, ?)').run(id, id, time, JSON.stringify({ type: 'text', text }))
      }
    } finally { db.close() }
    const observation = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'agent-stream',
      type: 'system-event', content: 'opencode terminal task completed', sessionId: 'session', correlationId: 'turn', agentId: 'opencode',
      tags: ['turn-completed'], metadata: { evidenceStatus: 'transcript-path-unavailable', transcriptPath: path } }, { speaker: 'unknown', createdAt: new Date(now).toISOString() })
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    json.mockResolvedValue({ complete: true, facts: [] })
    const id = (await service.status()).queue.find(task => task.subject === observation.id)!.id!
    await service.run(id)
    const state = await service.status()
    expect(state.tasks.find(task => task.id === id)).toMatchObject({ status: 'succeeded' })
    expect((await deps.snapshot()).observations.some(row => row.metadata?.evidenceStatus === 'complete')).toBe(true)
    expect(json).toHaveBeenCalled()
  })
  it('never bypasses assistant-only evidence after lowering the Jev threshold', async () => {
    const item = await candidate(1)
    const snapshot = await deps.snapshot()
    deps.snapshot = async () => ({ ...snapshot, observations: snapshot.observations.map(row => ({ ...row, sourceEvidence: { ...sourceEvidence(row), authority: 'model-generated', speaker: 'assistant' } })) })
    config.jev.threshold = 0.5
    await service.run()
    const state = await service.status()
    expect(state.queue.find(task => task.subject === item.id)).toMatchObject({ status: 'needs-review' })
    expect(review).not.toHaveBeenCalled()
  })
  it('runs only the requested task and records previous scores without rerunning failures on threshold save', async () => {
    config.stages.entryReview = { provider: 'jev', model: 'jev-1.13.0', providerId: '', thinking: false }
    const first = await candidate(1); await candidate(2)
    const scores = { threshold: 0.9, support: 0.85, consistent: 0.99, coverage: [0.99] }
    review.mockResolvedValue({ verdict: 'uncertain', reason: 'evidence-coverage-or-conflict-needs-review', complete: true, conflict: false, coveredIds: [first.id], scores })
    const id = (await service.status()).queue.find(task => task.subject === first.id)!.id!
    await service.run(id)
    expect(review).toHaveBeenCalledTimes(1)
    expect((await service.status()).queue.find(task => task.subject === 'candidate-2')?.status).toBe('pending')
    config.jev.threshold = 0.8
    expect((await service.status()).queue.find(task => task.subject === first.id)).toMatchObject({ id, status: 'needs-review', scores })
    await service.retry(id)
    review.mockResolvedValue({ verdict: 'supported', reason: 'supported', complete: true, conflict: false, coveredIds: [first.id], scores: { ...scores, threshold: 0.8 } })
    await service.run(id)
    const state = await service.status()
    expect(state.tasks.find(task => task.id === id)).toMatchObject({ status: 'succeeded', scores: { threshold: 0.8 }, history: [{ reason: 'evidence-coverage-or-conflict-needs-review', scores }] })
    expect(state.queue.find(task => task.subject === 'candidate-2')?.status).toBe('pending')
  })
  it('admits only an explicitly selected historical candidate with the matching workspace and hash', async () => {
    const first = await candidate(1); await candidate(2)
    config.enabledSince = new Date(now).toISOString()
    expect((await service.status()).queue).toHaveLength(0)
    const input = { candidateId: first.id, workspaceId: 'project', candidateHash: (await reviewCandidateInput(first)).candidateHash }
    await expect(service.retry({ ...input, workspaceId: 'other' })).rejects.toThrow('task-no-longer-current')
    await expect(service.retry({ ...input, candidateHash: 'stale' })).rejects.toThrow('task-no-longer-current')
    const id = await service.retry(input)
    await service.run(id)
    expect(review).toHaveBeenCalledTimes(1)
    expect((await service.status()).queue.some(task => task.subject === 'candidate-2')).toBe(false)
  })
  it('projects bounded subject labels from the current plan without extra snapshots or content reads', async () => {
    const item = await candidate(1)
    item.fact.content = 'Backup policy\n' + 'long-title '.repeat(50)
    await writeFile(join(root, 'facts/candidates.jsonl'), JSON.stringify(item) + '\n')
    const snapshot = vi.spyOn(deps, 'snapshot')
    const content = vi.spyOn(deps, 'content')
    const state = await service.status()
    const task = state.queue.find(task => task.subject === item.id)!
    expect(task.displayTitle).toBe(item.fact.content.replace(/\n/g, ' ').slice(0, 96))
    expect(task.displayTitle).not.toContain(item.id)
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(content).not.toHaveBeenCalled()
    expect(state.lastCompletedAt).toBeUndefined()
  })

  it('reports only actual successful update times, even when other tasks fail later', async () => {
    await candidate(1)
    await service.run()
    const completed = (await service.status()).lastCompletedAt
    expect(completed).toBe(new Date(now).toISOString())
    const ledgerPath = join(root, 'processing/automation-tasks.json')
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))
    ledger.tasks.push(...Array.from({ length: 201 }, (_, index) => ({ ...ledger.tasks[0], id: 'later-failure-' + index, subject: 'missing-source', status: 'failed', updatedAt: new Date(now + 1000 + index).toISOString() })))
    ledger.tasks.push({ ...ledger.tasks[0], id: 'private-history', workspaceId: 'user', status: 'succeeded', updatedAt: new Date(now + 10000).toISOString() })
    await writeFile(ledgerPath, JSON.stringify(ledger))
    const status = await service.status()
    expect(status.counts.failed).toBeGreaterThan(0)
    expect(status.lastCompletedAt).toBe(completed)
    expect(status.tasks).toHaveLength(200)
    expect(status.tasks.some(task => task.workspaceId === 'user')).toBe(false)
    expect(status.counts.succeeded).toBe(1)
  })

  it('redacts labels and keeps same-ID candidates bound to their workspace', async () => {
    const item = await candidate(1)
    const snapshot = await deps.snapshot()
    const secret = 'sk-' + 'a'.repeat(48)
    deps.snapshot = async () => ({ ...snapshot, candidates: [
      { ...item, fact: { ...item.fact, content: `Backup API_KEY=${secret}` } },
      { ...item, fact: { ...item.fact, content: 'Other project policy', provenance: { ...item.fact.provenance, workspaceId: 'other' } } },
      { ...item, fact: { ...item.fact, content: 'Private preference', scope: 'user', provenance: { ...item.fact.provenance, workspaceId: 'user' } } },
    ] })
    const state = await service.status()
    expect(state.queue.find(task => task.workspaceId === 'project')?.displayTitle).toBe('Backup API_KEY=[REDACTED]')
    expect(state.queue.find(task => task.workspaceId === 'other')?.displayTitle).toBe('Other project policy')
    expect(JSON.stringify(state)).not.toContain(secret)
    expect(state.queue.some(task => task.workspaceId === 'user')).toBe(false)
  })

  it('binds current review status to the proposal and rejects retries after it changes', async () => {
    const item = await candidate(1)
    review.mockResolvedValue({ verdict: 'uncertain', reason: 'Need source context', complete: false, conflict: false, coveredIds: [] })
    await service.run()
    const status = await service.status()
    const current = status.queue.find(task => task.subject === item.id)!
    expect(status.reviewStateVersion).toBe(1)
    expect(current).toMatchObject({ candidateHash: (await reviewCandidateInput(item)).candidateHash, workspaceId: 'project', status: 'needs-review', canRetry: true, reason: 'Need source context' })
    item.fact.content = 'The proposal has changed.'
    await writeFile(join(root, 'facts/candidates.jsonl'), JSON.stringify(item) + '\n')
    const changed = (await service.status()).queue.find(task => task.subject === item.id)!
    expect(changed.candidateHash).not.toBe(current.candidateHash)
    expect(changed).toMatchObject({ status: 'pending', canRetry: false })
    expect(changed.reason).toBeUndefined()
    await expect(service.retry(current.id!)).rejects.toThrow('task-no-longer-current')
  })
  it.each(['extraction', 'curation'])('blocks raw tool content returned by %s without partial admission', async stage => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    config.stages.entryReview.provider = 'off'
    const raw = JSON.stringify({ chunk_id: 'fixture', wall_time_seconds: 0.5, exit_code: 0, output: 'Keep backups for 7 days.' })
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'agent-stream', type: 'tool-result', content: raw }, { speaker: 'tool' })
    json.mockResolvedValue({ complete: true, facts: ['Keep backups for 7 days.', stage === 'extraction' ? raw : 'Backup retention is seven days.'].map(content => ({
      content, kind: 'procedure', concepts: ['backup'], citations: [{ observationId: source.id, quote: raw }],
    })) })
    if (stage === 'curation') curate.mockReturnValue({ complete: true, selections: [
      { index: 0, action: 'keep', equivalentTo: null, duplicateOf: null },
      { index: 1, action: 'keep', content: raw, equivalentTo: null, duplicateOf: null },
    ] })
    await service.run()
    expect(await knowledgeExtractService.listFactCandidates()).toEqual([])
    expect((await knowledgeTruthService.list()).facts).toEqual([])
    expect((await service.status()).tasks[0].reason).toBe('processing-failed')
    expect(await knowledgeObservationService.resolveContent(source)).toBe(raw)
  })

  it('extracts a supported durable statement from an intact raw tool envelope', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    config.stages.entryReview.provider = 'off'
    const raw = JSON.stringify({ chunk_id: 'fixture', wall_time_seconds: 0.5, exit_code: 0, output: 'Backup policy: keep backups for 7 days.' })
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'agent-stream', type: 'tool-result', content: raw }, { speaker: 'tool' })
    json.mockImplementation(async request => {
      expect(request.input.evidence[0]).toMatchObject({ content: raw, authority: 'tool-observed' })
      return { complete: true, facts: [{ content: 'Keep backups for 7 days.', kind: 'procedure', concepts: ['backup'], citations: [{ observationId: source.id, quote: 'Backup policy: keep backups for 7 days.' }] }] }
    })
    await service.run()
    const candidates = await knowledgeExtractService.listFactCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].fact.content).toBe('Keep backups for 7 days.')
    expect(candidates[0].evidence.quotes).toEqual([{ observationId: source.id, quote: 'Backup policy: keep backups for 7 days.' }])
    expect(await knowledgeObservationService.resolveContent(source)).toBe(raw)
  })

  it('curates mixed status, merges duplicate evidence and discards temporary statements', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    config.stages.entryReview.provider = 'off'
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Keep backups for 7 days. Retention is one week. 12 tests passed.' }, { speaker: 'user' })
    json.mockResolvedValue({ complete: true, facts: ['Keep backups for 7 days. 12 tests passed.', 'Retention is one week.', '12 tests passed.'].map(content => ({ content, kind: 'decision', concepts: ['backup'], citations: [{ observationId: source.id, quote: content.startsWith('Keep') ? 'Keep backups for 7 days.' : content }] })) })
    curate.mockReturnValue({ complete: true, selections: [
      { index: 0, action: 'keep', content: 'Keep backups for 7 days.', equivalentTo: null, duplicateOf: null },
      { index: 1, action: 'duplicate', equivalentTo: null, duplicateOf: 0 },
      { index: 2, action: 'ephemeral', equivalentTo: null, duplicateOf: null },
    ] })
    await service.run()
    const candidates = await knowledgeExtractService.listFactCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].fact.content).toBe('Keep backups for 7 days.')
    expect(candidates[0].evidence.quotes).toHaveLength(2)
  })
  it.each([
    [{ index: 1, action: 'keep', equivalentTo: null, duplicateOf: null }, 'extraction-incomplete-selection'],
    [{ index: 0, action: 'keep', equivalentTo: 'invented', duplicateOf: null }, 'extraction-invalid-equivalence'],
    [{ index: 0, action: 'duplicate', equivalentTo: null, duplicateOf: 0 }, 'extraction-invalid-duplicate'],
    [{ index: 0, action: 'ephemeral', content: 'Replacement', equivalentTo: null, duplicateOf: null }, 'extraction-invalid-curation'],
  ])('rejects invalid curation %j without publishing a partial batch', async (selection, reason) => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Keep backups.' }, { speaker: 'user' })
    json.mockResolvedValue({ complete: true, facts: [{ content: source.content, kind: 'decision', concepts: [], citations: [{ observationId: source.id, quote: source.content }] }] })
    curate.mockReturnValue({ complete: true, selections: [selection] })
    await service.run()
    expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(0)
    expect((await service.status()).tasks[0].reason).toBe(reason)
  })
  it('rejects an entire extraction containing an invented source quote', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Use SQLite locally.' }, { speaker: 'user' })
    json.mockResolvedValue({ complete: true, facts: ['Use SQLite', 'Use Redis'].map(quote => ({ content: quote, kind: 'decision', concepts: ['database'], citations: [{ observationId: source.id, quote }] })) })
    await service.run()
    expect(await knowledgeExtractService.listFactCandidates()).toEqual([])
    expect((await service.status()).tasks[0].reason).toBe('extraction-invalid-citation')
  })
  it('does not duplicate extraction after restart, response reordering or model replacement', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'first', thinking: false }
    config.stages.entryReview.provider = 'off'
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Keep backups. Validate restores.' }, { speaker: 'user' })
    const output = ['Keep backups.', 'Validate restores.'].map(content => ({ content, kind: 'procedure', concepts: ['backup'], citations: [{ observationId: source.id, quote: content }] }))
    json.mockResolvedValue({ complete: true, facts: output })
    await service.run(); expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(2)
    service = new KnowledgeAutomationService(deps); await service.run(); expect(json).toHaveBeenCalledTimes(1)
    config.stages.extraction.model = 'second'; json.mockResolvedValue({ complete: true, facts: [...output].reverse() })
    await service.run(); expect(json).toHaveBeenCalledTimes(2)
    expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(2)
  })
  it('reuses a semantically equivalent pending statement across model replacement', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'first', thinking: false }
    config.stages.entryReview.provider = 'off'
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Retain backups for 7 days.' }, { speaker: 'user' })
    const fact = { content: source.content, kind: 'procedure', concepts: ['backup'], citations: [{ observationId: source.id, quote: source.content }] }
    json.mockResolvedValue({ complete: true, facts: [fact] })
    await service.run()
    const original = (await knowledgeExtractService.listFactCandidates())[0]
    config.stages.extraction.model = 'second'
    json.mockResolvedValue({ complete: true, facts: [{ ...fact, content: 'Keep database backups for one week.' }] })
    curate.mockImplementation(input => ({ complete: true, selections: [{ index: 0, action: 'keep', equivalentTo: input.existingKnowledge[0].id, duplicateOf: null }] }))
    await service.run()
    expect(await knowledgeExtractService.listFactCandidates()).toEqual([original])
  })
  it('includes prior context, role attribution and later corrections in a task window', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    config.stages.entryReview.provider = 'off'
    const capture = async (content: string, speaker: 'user' | 'assistant' | 'tool', correlationId: string, tags: string[], at: number) =>
      knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'agent-stream', type: 'conversation-turn', content,
        sessionId: 'session', correlationId, agentId: 'claude', tags }, { speaker, sourceEventId: content, createdAt: new Date(now + at).toISOString() })
    await capture('Use Redis.', 'user', 'turn-1', ['turn-started'], -4000)
    await capture('Redis suggested.', 'assistant', 'turn-1', ['terminal-transcript'], -3000)
    const correction = await capture('Avoid an external service; use in-process cache.', 'user', 'turn-2', ['turn-started'], -2000)
    await capture('Cache tests passed.', 'tool', 'turn-2', ['terminal-transcript'], -1000)
    await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'agent-stream', type: 'system-event', content: 'complete',
      sessionId: 'session', correlationId: 'turn-2', agentId: 'claude', tags: ['turn-completed'], metadata: { evidenceStatus: 'complete' } }, { speaker: 'system', sourceEventId: 'end', createdAt: new Date(now).toISOString() })
    json.mockImplementation(async request => {
      expect(request.input.evidence.map(row => row.speaker)).toEqual(['user', 'assistant', 'user', 'tool'])
      return { complete: true, facts: [{ content: 'Use in-process cache to avoid an external service.', kind: 'decision', concepts: ['cache'], citations: [{ observationId: correction.id, quote: correction.content }] }] }
    })
    await service.run()
    const candidates = await knowledgeExtractService.listFactCandidates()
    expect(candidates).toHaveLength(1); expect(candidates[0].evidence.observationIds).toEqual([correction.id])
  })
  it('chunks long evidence and reconciles before committing any candidate', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    config.stages.entryReview.provider = 'off'
    const content = 'context '.repeat(4000) + 'Retain backups for 7 days.'
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content }, { speaker: 'user' })
    json.mockImplementation(async request => {
      expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(0)
      expect(request.input.evidence.reduce((n, row) => n + row.content.length, 0)).toBeLessThanOrEqual(18000)
      return { complete: true, facts: [{ content: 'Retain backups for 7 days.', kind: 'procedure', concepts: ['backup'], citations: [{ observationId: source.id, quote: 'Retain backups for 7 days.' }] }] }
    })
    await service.run(); expect(curate).toHaveBeenCalled(); expect(coverage).toHaveBeenCalled()
    expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(1)
  })
  it('keeps incomplete coverage pending human review without publishing partial knowledge', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'A durable rule.' }, { speaker: 'user' })
    json.mockResolvedValue({ complete: false, facts: [] })
    await service.run(); expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(0)
    expect((await service.status()).tasks[0]).toMatchObject({ status: 'needs-review', reason: 'extraction-incomplete-coverage' })
  })
  it.each(['empty extraction', 'mistaken discard'])('recovers durable knowledge from %s using independent coverage', async mode => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    config.stages.entryReview.provider = 'off'
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Production backups must be kept for seven days.' }, { speaker: 'user' })
    const fact = { content: source.content, kind: 'decision', concepts: ['backup'], citations: [{ observationId: source.id, quote: source.content }] }
    json.mockResolvedValue({ complete: true, facts: mode === 'empty extraction' ? [] : [fact] })
    if (mode === 'mistaken discard') curate.mockImplementation(input => ({ complete: true, selections: [{ index: 0, action: input.coverageRepair ? 'keep' : 'ephemeral', equivalentTo: null, duplicateOf: null }] }))
    coverage.mockImplementation(input => ({ complete: true, coveredEvidenceIds: input.evidence.map(part => part.key),
      missing: input.candidates.length ? [] : [fact], invalidCandidateIds: [], reason: 'The backup retention rule is durable and must be retained.' }))
    await service.run()
    expect((await knowledgeExtractService.listFactCandidates()).map(item => item.fact.content)).toEqual([source.content])
    expect(coverage).toHaveBeenCalledTimes(2)
    const task = (await service.status()).tasks.find(item => item.stage === 'extraction')!
    expect(task.status).toBe('succeeded')
    const journal = JSON.parse(await readFile(join(root, 'processing/extraction', task.id + '.json'), 'utf8'))
    expect(journal.records.some(record => record.phase === 'coverage' && record.result.missing.length === 1)).toBe(true)
    if (mode === 'mistaken discard') expect(journal.records.some(record => record.phase === 'curation' && record.selections[0].action === 'ephemeral')).toBe(true)
  })
  it('blocks a claimed complete audit that omits an evidence part', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'A durable project constraint.' }, { speaker: 'user' })
    json.mockResolvedValue({ complete: true, facts: [] })
    coverage.mockReturnValue({ complete: true, coveredEvidenceIds: [], missing: [], invalidCandidateIds: [], reason: 'Nothing found.' })
    await service.run()
    expect((await service.status()).tasks[0]).toMatchObject({ status: 'needs-review', reason: 'extraction-incomplete-coverage' })
    expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(0)
  })
  it('subdivides a dense extraction and admits more than twenty audited facts atomically', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    config.stages.entryReview.provider = 'off'
    const statements = Array.from({ length: 25 }, (_, index) => `Module-${index} requires backup verification before restoring production data.`)
    const source = await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: statements.join('\n') }, { speaker: 'user' })
    json.mockImplementation(async request => {
      expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(0)
      const matching = statements.filter(statement => request.input.evidence.some(part => part.content.includes(statement)))
      return { complete: matching.length < 20, facts: matching.slice(0, 20).map(content => ({ content, kind: 'procedure', concepts: ['backup'], citations: [{ observationId: source.id, quote: content }] })) }
    })
    await service.run()
    expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(25)
    expect((await service.status()).tasks.find(item => item.stage === 'extraction')?.status).toBe('succeeded')
  })
  it('includes uncited later corrections in entry review and rejects an obsolete proposal', async () => {
    const item = await candidate(1)
    // Persist a real same-session pair, then bind the candidate to the earlier source only.
    const capture = (content: string, at: number) => knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'agent-stream', type: 'conversation-turn', content,
      sessionId: 'cache-session', correlationId: 'cache-task', agentId: 'codex', tags: ['terminal-transcript'] }, { speaker: 'user', createdAt: new Date(now + at).toISOString(), sourceEventId: content })
    const earlier = await capture('Use Redis for the application cache.', -2000)
    const correction = await capture('Correction: avoid Redis; use an in-process cache only in development.', -1000)
    item.fact.content = earlier.content
    item.fact.provenance.sourceObservationIds = [earlier.id]; item.fact.provenance.sourceEvidence = [sourceEvidence(earlier)]
    item.evidence = { observationIds: [earlier.id], sources: [sourceEvidence(earlier)], quotes: [{ observationId: earlier.id, quote: earlier.content }] }
    await writeFile(join(root, 'facts/candidates.jsonl'), JSON.stringify(item) + '\n')
    review.mockImplementation(async request => {
      expect(request.input.context.map(row => row.id)).toContain(correction.id)
      return { verdict: 'unsupported', complete: true, conflict: true, coveredIds: [item.id], reason: 'Later user correction supersedes Redis.' }
    })
    await service.run()
    expect((await knowledgeTruthService.list()).facts).toHaveLength(0)
    expect((await service.status()).tasks[0]).toMatchObject({ status: 'needs-review', reason: 'Later user correction supersedes Redis.' })
  })
  it('projects all eligible review work without writing tasks or including personal and old candidates', async () => {
    const seed = await candidate(0)
    const snapshot = await deps.snapshot()
    config.enabledSince = new Date(now - 120000).toISOString()
    snapshot.candidates = Array.from({ length: 205 }, (_, index) => ({ ...seed, id: `queued-${index}` }))
    snapshot.candidates.push({ ...seed, id: 'private', fact: { ...seed.fact, scope: 'user' } },
      { ...seed, id: 'old', fact: { ...seed.fact, provenance: { ...seed.fact.provenance, createdAt: '2010-01-01T00:00:00.000Z' } } })
    deps.snapshot = async () => snapshot
    const status = await service.status()
    expect(status.stages).toEqual({ extraction: 'rules-only', entryReview: 'automatic', wikiGeneration: 'automatic', wikiReview: 'automatic' })
    expect(status.queue).toHaveLength(205)
    expect(status.queue.every(task => task.stage === 'entryReview' && task.status === 'pending' && task.subject.startsWith('queued-'))).toBe(true)
    expect(status.tasks).toEqual([])
    await expect(readFile(join(root, 'processing/automation-tasks.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(review).not.toHaveBeenCalled()
    allowed = false
    expect((await service.status()).queue).toEqual([])
  })

  it('projects current manual, incomplete, failed and running work independently of historical records', async () => {
    await candidate(1)
    config.stages.entryReview.provider = 'off'
    expect((await service.status()).queue).toEqual([expect.objectContaining({stage:'entryReview',subject:'candidate-1',status:'needs-review'})])
    await service.run()
    config.stages.entryReview = { provider: 'external', providerId: '', model: 'model', thinking: false }
    expect((await service.status()).stages.entryReview).toBe('unconfigured')
    expect((await service.status()).queue[0].status).toBe('needs-review')
    config.stages.entryReview.providerId = 'configured-provider'
    expect((await service.status()).queue[0].status).toBe('pending')
    let finish!: () => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    review.mockImplementationOnce(async () => {
      entered()
      await new Promise<void>(resolve => { finish = resolve })
      return {verdict:'uncertain',reason:'evidence insufficient',complete:false,conflict:false,coveredIds:[]}
    })
    const running = service.run()
    await started
    try {
      const status = await service.status()
      expect(status.running).toBe(true)
      expect(status.queue).toEqual([expect.objectContaining({stage:'entryReview',subject:'candidate-1',status:'running'})])
    } finally { finish(); await running }
    expect((await service.status()).queue).toEqual([expect.objectContaining({stage:'entryReview',subject:'candidate-1',status:'needs-review'})])
    const ledgerPath = join(root, 'processing/automation-tasks.json')
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))
    const current = ledger.tasks.find(task => task.model.provider === 'external')
    current.status = 'failed'
    await writeFile(ledgerPath, JSON.stringify(ledger))
    expect((await service.status()).queue).toEqual([expect.objectContaining({stage:'entryReview',subject:'candidate-1',status:'failed'})])
    config.stages.entryReview.model = 'replacement-model'
    const replaced = await service.status()
    expect(replaced.counts.failed).toBe(1)
    expect(replaced.queue).toEqual([expect.objectContaining({stage:'entryReview',subject:'candidate-1',status:'pending'})])
  })

  it('captures, extracts, reviews, publishes a topic, updates it and preserves prior content', async () => {
    config.stages.extraction.provider = 'external'
    await knowledgeObservationService.capture({ workspaceId: 'project', workspaceName: 'Project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Backups run nightly.' }, { speaker: 'user' })
    json.mockImplementation(async request => request.stage === 'extraction' ? { complete: true, facts: [{ content: 'Backups run nightly.', kind: 'procedure', concepts: ['backups'], citations: [{ observationId: request.input.evidence[0].id, quote: 'Backups run nightly.' }] }] }
      : { markdown: request.input.knowledge.map(item => item.content).join('\n\n') })
    await service.run(); now += 60000; await service.run()
    const first = await knowledgeTruthService.list()
    expect(first.facts[0].confirmation?.kind).toBe('model-review')
    expect(first.wikiPages[0]).toMatchObject({ slug: expect.stringMatching(/^workflows\//), managed: true, version: 1, freshness: 'current' })
    const slug = first.wikiPages[0].slug
    expect((await listWikiHistory({ workspaceId: 'project', slug })).total).toBe(1)
    config.stages.extraction.provider = 'off'
    await candidate(2, 'backups'); await service.run(); now += 60000; await service.run()
    expect((await knowledgeTruthService.list()).wikiPages[0].version).toBe(2)
    expect((await listWikiHistory({ workspaceId: 'project', slug })).total).toBe(2)
    expect((await service.status()).counts.failed).toBe(0)
    expect(await readFile(join(root, 'audit/audit.jsonl'), 'utf8')).toContain('auto-policy')
    const ledgerPath = join(root, 'processing/automation-tasks.json')
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))
    const applied = ledger.tasks.find(task => task.stage === 'wikiReview' && task.status === 'succeeded')
    applied.status = 'running'; await writeFile(ledgerPath, JSON.stringify(ledger))
    service = new KnowledgeAutomationService(deps); await service.run()
    expect((await listWikiHistory({ workspaceId: 'project', slug })).total).toBe(2)
    expect((await service.status()).tasks.find(task => task.id === applied.id)?.status).toBe('succeeded')
  })
  it('processes more than 20 candidates over restarts without cursor loss', async () => {
    config.stages.wikiGeneration.provider = 'off'
    for (let i = 0; i < 25; i++) await candidate(i)
    for (let i = 0; i < 4; i++) { await service.run(); service = new KnowledgeAutomationService(deps) }
    expect((await knowledgeTruthService.list()).facts).toHaveLength(25)
    expect((await service.status()).tasks.filter(task => task.stage === 'entryReview' && task.status === 'succeeded')).toHaveLength(25)
  })
  it('generates and independently checks coverage for over 200 facts using bounded sections', async () => {
    const seed = (await candidate(0)).fact
    await facts(Array.from({ length: 205 }, (_, i) => ({ ...seed, id: `existing-${i}`, status: 'active', content: `Step ${i} requires verification.`, provenance: { ...seed.provenance, createdAt: new Date(now - 60000).toISOString() } })))
    await service.run(); now += 60000; await service.run()
    const page = (await knowledgeTruthService.list()).wikiPages[0]
    expect(page.sourceFactIds.length).toBeGreaterThanOrEqual(205)
    expect(page.markdown).toContain('Step 204')
    expect(review.mock.calls.filter(([request]) => request.stage === 'wikiReview').length).toBeGreaterThan(205)
  })
  it('does not publish when disabled during inference or when the model omits necessary knowledge', async () => {
    await candidate(1)
    review.mockImplementationOnce(async (_request, required) => { allowed = false; service.stop(); return { verdict: 'supported', reason: 'ok', complete: true, conflict: false, coveredIds: required.map(item => item.id) } })
    await service.run(); expect((await knowledgeTruthService.list()).facts).toHaveLength(0)
    allowed = true; now += 10000; await service.run(); now += 60000
    review.mockImplementation(async () => ({ verdict: 'supported', reason: 'missing condition', complete: false, conflict: false, coveredIds: [] }))
    await service.run()
    expect((await knowledgeTruthService.list()).wikiPages).toHaveLength(0)
    expect((await service.status()).counts['needs-review']).toBeGreaterThan(0)
  })
  it('keeps unrelated changes valid and excludes Wiki after source expiry', async () => {
    const item = await candidate(1)
    review.mockImplementationOnce(async (_request, required) => {
      await facts([{ ...item.fact, id: 'unrelated', status: 'active', kind: 'decision', concepts: ['different'], content: 'An unrelated choice.' }])
      return { verdict: 'supported', reason: 'ok', complete: true, conflict: false, coveredIds: required.map(item => item.id) }
    })
    await service.run(); now += 60000; await service.run()
    expect((await knowledgeTruthService.list()).facts).toHaveLength(2)
    const truth = await knowledgeTruthService.list()
    await facts(truth.facts.map(fact => fact.id === item.fact.id ? { ...fact, ttl: '2020-01-01' } : fact))
    expect((await knowledgeTruthService.list()).wikiPages.some(page => page.sourceFactIds.includes(item.fact.id))).toBe(false)
    expect((await knowledgeTruthService.list({ includeStaleWiki: true })).wikiPages.find(page => page.sourceFactIds.includes(item.fact.id))?.freshness).toBe('stale')
    // The host's public entry cannot grant automatic acceptance.
    await expect(knowledgeReviewService.applyCandidate({ ...await reviewCandidateInput(item), actor: 'auto-policy' })).rejects.toThrow('Automatic acceptance')
  })
  it('protects a manually edited topic from later automatic overwrites', async () => {
    await candidate(1); await service.run(); now += 60000; await service.run()
    const original = (await knowledgeExtractService.listWikiPatchCandidates())[0]
    const edit = { ...original, id: 'manual-edit', status: 'proposed' as const, expectedVersion: 1, patchMarkdown: 'Human-maintained handbook.' }
    await proposeDerivedCandidates([edit]); await knowledgeReviewService.applyCandidate(await reviewCandidateInput(edit))
    await candidate(2); await service.run(); now += 60000; await service.run()
    expect((await knowledgeTruthService.list()).wikiPages[0]).toMatchObject({ version: 2, managed: false, markdown: 'Human-maintained handbook.\n' })
  })
  it('fails closed on corrupt task storage', async () => {
    await mkdir(join(root, 'processing')); await writeFile(join(root, 'processing/automation-tasks.json'), '{broken')
    await expect(service.run()).rejects.toThrow(); await expect(service.status()).rejects.toThrow()
    expect(review).not.toHaveBeenCalled()
  })
  it('generates page relationships inside a Wiki proposal, preserves rejection and publishes new evidence together', async () => {
    const item = await candidate(90, 'backup')
    await facts([{ ...item.fact, status: 'active' }])
    config.stages.entryReview.provider = 'off'; config.stages.wikiReview.provider = 'off'
    const target: CandidateWikiPatch = { id: 'policy', type: 'wiki-patch', status: 'proposed', pageSlug: 'policy', title: 'Policy',
      patchMarkdown: 'The backup workflow depends on this policy.', rationale: 'Reviewed', sourceFactIds: [], reviewMode: 'full-page', expectedVersion: 0,
      confidence: 0, derivation: 'llm', evidence: { observationIds: [] }, provenance: item.fact.provenance }
    await proposeDerivedCandidates([target]); await knowledgeReviewService.applyCandidate(await reviewCandidateInput(target))
    json.mockImplementation(async request => ({ markdown: request.input.knowledge.map(item => item.content).join('\n\n') + `\n\n[Policy](${wikiPageUri('project', 'policy')})`,
      relations: [{ targetSlug: 'policy', type: 'depends_on', reason: 'This workflow depends on the policy.', sourceFactIds: [item.fact.id] }] }))
    await service.run()
    const proposed = (await knowledgeExtractService.listWikiPatchCandidates()).find(patch => patch.managed)!
    expect(proposed.relations?.map(relation => relation.type).sort()).toEqual(['depends_on', 'references'])
    expect((await knowledgeTruthService.list()).wikiPages).toHaveLength(1)
    await knowledgeReviewService.rejectCandidate(await reviewCandidateInput(proposed))
    config.stages.wikiGeneration.model = 'another-generation-model'
    await service.run(); service = new KnowledgeAutomationService(deps); await service.run()
    expect((await knowledgeExtractService.listWikiPatchCandidates()).filter(patch => patch.managed)).toHaveLength(1)
    await facts([{ ...item.fact, content: 'The backup workflow depends on the policy; retain copies for 7 days.', status: 'active', version: 2 }])
    config.stages.wikiReview.provider = 'local'
    await service.run()
    const page = (await knowledgeTruthService.list()).wikiPages.find(page => page.slug === proposed.pageSlug)!
    expect(page.markdown).toContain('7 days')
    expect(page.relations).toHaveLength(2)
    expect(page.relationIssues).toEqual([])
    expect(review.mock.calls.some(([request]) => request.input.required?.[0]?.id === 'relation:0')).toBe(true)
    expect(await knowledgeExtractService.listGraphCandidates()).toEqual([])
  })
  it('publishes a topic before the next generation reads its relationship targets', async () => {
    const first = await candidate(92, 'backup'), second = await candidate(93, 'deployment')
    await facts([first, second].map(item => ({ ...item.fact, status: 'active' })))
    config.stages.entryReview.provider = 'off'
    json.mockImplementation(async request => ({ markdown: request.input.knowledge.map(item => item.content).join('\n\n')
      + (request.input.publishedPages[0] ? `\n\n[Related instructions](${request.input.publishedPages[0].uri})` : '') }))
    await service.run()
    const pages = (await knowledgeTruthService.list()).wikiPages
    expect(pages).toHaveLength(2)
    expect(pages.flatMap(page => page.relations ?? [])).toHaveLength(1)
    expect(pages.flatMap(page => page.relationIssues ?? [])).toEqual([])
  })
  it.each(['unsupported', 'target-update'] as const)('does not publish a relationship on %s during Wiki review', async mode => {
    const item = await candidate(91, 'backup')
    await facts([{ ...item.fact, status: 'active' }]); config.stages.entryReview.provider = 'off'
    const target: CandidateWikiPatch = { id: 'target', type: 'wiki-patch', status: 'proposed', pageSlug: 'policy', title: 'Policy',
      patchMarkdown: 'Policy before review', rationale: 'Reviewed', sourceFactIds: [], reviewMode: 'full-page', expectedVersion: 0,
      confidence: 0, derivation: 'llm', evidence: { observationIds: [] }, provenance: item.fact.provenance }
    await proposeDerivedCandidates([target]); await knowledgeReviewService.applyCandidate(await reviewCandidateInput(target))
    json.mockImplementation(async request => ({ markdown: request.input.knowledge.map(item => item.content).join('\n\n') + `\n\n[Policy](${wikiPageUri('project', 'policy')})` }))
    review.mockImplementation(async (request, required) => {
      if (required[0]?.id.startsWith('relation:')) {
        if (mode === 'unsupported') return { verdict: 'unsupported', reason: 'Unsupported relation', complete: false, conflict: false, coveredIds: [] }
        const update = { ...target, id: 'updated', expectedVersion: 1, patchMarkdown: 'Policy after review' }
        await proposeDerivedCandidates([update]); await knowledgeReviewService.applyCandidate(await reviewCandidateInput(update))
      }
      return { verdict: 'supported', reason: 'supported', complete: true, conflict: false, coveredIds: required.map(item => item.id) }
    })
    await service.run()
    expect((await knowledgeTruthService.list()).wikiPages.map(page => page.slug)).toEqual(['policy'])
    const reviewTask = (await service.status()).queue.find(task => task.stage === 'wikiReview')!
    expect(reviewTask.status).toBe('needs-review')
    expect(reviewTask.reason).toContain(mode === 'unsupported' ? 'Unsupported relation' : 'wiki-relation-target-changed')
  })
})
