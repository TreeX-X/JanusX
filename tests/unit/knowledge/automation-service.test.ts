import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeAutomationService, type AutomationDeps } from '../../../src/main/knowledge/automation-service'
import { defaultKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
import type { CandidateFact, MemoryFact } from '../../../src/shared/knowledge'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeReviewService, proposeFactCandidates, proposeDerivedCandidates } from '../../../src/main/knowledge/review-service'
import { sourceEvidence } from '../../../src/main/knowledge/memory-evidence'
import { listWikiHistory } from '../../../src/main/knowledge/wiki-history'
import { reviewCandidateInput } from '../../../src/shared/review-candidate-snapshot'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/contract-service', () => ({ knowledgeContractService: { bootstrapWorkspace: vi.fn() } }))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({ knowledgeProcessingQueue: { schedule: vi.fn() } }))
let root: string, now: number, allowed: boolean
let config: ReturnType<typeof defaultKnowledgeAutomation>, deps: AutomationDeps, service: KnowledgeAutomationService
const json = vi.fn(), review = vi.fn(), curate = vi.fn()
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'automation-')); vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root)
  now = Date.now(); allowed = true; config = defaultKnowledgeAutomation(); config.enabled = true; config.enabledSince = '2020-01-01T00:00:00.000Z'
  config.local.enabled = true
  for (const stage of ['entryReview', 'wikiGeneration', 'wikiReview'] as const) config.stages[stage].provider = 'local'
  json.mockReset(); review.mockReset()
  curate.mockReset().mockImplementation(input => ({ complete: true, selections: input.candidates.map((_item, index) => ({ index, action: 'keep', equivalentTo: null, duplicateOf: null })) }))
  review.mockImplementation(async (_request, required) => ({ verdict: 'supported', reason: 'evidence supported', complete: true, conflict: false, coveredIds: required.map(item => item.id) }))
  json.mockImplementation(async request => ({ markdown: request.input.knowledge.map(item => item.content).join('\n\n') }))
  deps = { settings: async () => ({ allowed, config: structuredClone(config) }), snapshot: async () => {
    const truth = await knowledgeTruthService.list({ includeStaleWiki: true })
    return { observations: await knowledgeObservationService.listAll(true), candidates: await knowledgeExtractService.listFactCandidates(),
      patches: await knowledgeExtractService.listWikiPatchCandidates(), facts: truth.facts, pages: truth.wikiPages }
  }, content: observation => knowledgeObservationService.resolveContent(observation), json: request => {
    const input = request.input as { candidates?: unknown[] }
    return input.candidates ? Promise.resolve(curate(input)) : json(request)
  }, review, now: () => now }
  service = new KnowledgeAutomationService(deps)
})
afterEach(async () => { service.stop(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })
async function candidate(index: number): Promise<CandidateFact> {
  const observation = await knowledgeObservationService.capture({ workspaceId: 'project', workspaceName: 'Project', workspacePath: root,
    source: 'manual', type: 'user-note', content: `Module ${index} uses the documented backup workflow.`, tags: [] }, { speaker: 'user', createdAt: new Date(now - 60000).toISOString() })
  const evidence = sourceEvidence(observation)
  const item: CandidateFact = { id: `candidate-${index}`, type: 'fact', status: 'proposed', derivation: 'llm', evidence: { observationIds: [observation.id], sources: [evidence] },
    fact: { id: `fact-${index}`, content: observation.content, kind: 'procedure', scope: 'project', status: 'proposed', confidence: 0, concepts: ['workflow'], files: [], tags: [], version: 1,
      provenance: { workspaceId: 'project', workspaceName: 'Project', workspacePath: root, source: 'manual', actor: 'tester', createdAt: observation.createdAt,
        sourceObservationIds: [observation.id], sourceEvidence: [evidence], fileRefs: [] } } }
  await proposeFactCandidates([item]); return item
}
async function facts(items: MemoryFact[]) { await mkdir(join(root, 'facts'), { recursive: true }); await writeFile(join(root, 'facts/facts.jsonl'), items.map(item => JSON.stringify(item)).join('\n') + '\n') }
describe('durable knowledge automation', () => {
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
    let reconciled = false
    json.mockImplementation(async request => {
      expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(0)
      if (request.input.drafts) reconciled = true
      else expect(request.input.evidence.reduce((n, row) => n + row.content.length, 0)).toBeLessThanOrEqual(18000)
      return { complete: true, facts: [{ content: 'Retain backups for 7 days.', kind: 'procedure', concepts: ['backup'], citations: [{ observationId: source.id, quote: 'Retain backups for 7 days.' }] }] }
    })
    await service.run(); expect(reconciled).toBe(true)
    expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(1)
  })
  it('keeps incomplete coverage pending human review without publishing partial knowledge', async () => {
    config.stages.extraction = { provider: 'external', providerId: 'test', model: 'test', thinking: false }
    await knowledgeObservationService.capture({ workspaceId: 'project', workspacePath: root, source: 'manual', type: 'user-note', content: 'A durable rule.' }, { speaker: 'user' })
    json.mockResolvedValue({ complete: false, facts: [] })
    await service.run(); expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(0)
    expect((await service.status()).tasks[0]).toMatchObject({ status: 'needs-review', reason: 'extraction-incomplete-coverage' })
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
    expect((await service.status()).queue).toEqual([{stage:'entryReview',subject:'candidate-1',status:'needs-review'}])
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
      expect(status.queue).toEqual([{stage:'entryReview',subject:'candidate-1',status:'running'}])
    } finally { finish(); await running }
    expect((await service.status()).queue).toEqual([{stage:'entryReview',subject:'candidate-1',status:'needs-review'}])
    const ledgerPath = join(root, 'processing/automation-tasks.json')
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))
    const current = ledger.tasks.find(task => task.model.provider === 'external')
    current.status = 'failed'
    await writeFile(ledgerPath, JSON.stringify(ledger))
    expect((await service.status()).queue).toEqual([{stage:'entryReview',subject:'candidate-1',status:'failed'}])
    config.stages.entryReview.model = 'replacement-model'
    const replaced = await service.status()
    expect(replaced.counts.failed).toBe(1)
    expect(replaced.queue).toEqual([{stage:'entryReview',subject:'candidate-1',status:'pending'}])
  })

  it('captures, extracts, reviews, publishes a topic, updates it and preserves prior content', async () => {
    config.stages.extraction.provider = 'external'
    await knowledgeObservationService.capture({ workspaceId: 'project', workspaceName: 'Project', workspacePath: root, source: 'manual', type: 'user-note', content: 'Backups run nightly.' }, { speaker: 'user' })
    json.mockImplementation(async request => request.stage === 'extraction' ? { complete: true, facts: [{ content: 'Backups run nightly.', kind: 'procedure', concepts: ['backups'], citations: [{ observationId: request.input.evidence[0].id, quote: 'Backups run nightly.' }] }] }
      : { markdown: request.input.knowledge.map(item => item.content).join('\n\n') })
    await service.run(); now += 60000; await service.run()
    const first = await knowledgeTruthService.list()
    expect(first.facts[0].confirmation?.kind).toBe('model-review')
    expect(first.wikiPages[0]).toMatchObject({ slug: 'workflows', managed: true, version: 1, freshness: 'current' })
    expect((await listWikiHistory({ workspaceId: 'project', slug: 'workflows' })).total).toBe(1)
    config.stages.extraction.provider = 'off'
    await candidate(2); await service.run(); now += 60000; await service.run()
    expect((await knowledgeTruthService.list()).wikiPages[0].version).toBe(2)
    expect((await listWikiHistory({ workspaceId: 'project', slug: 'workflows' })).total).toBe(2)
    expect((await service.status()).counts.failed).toBe(0)
    expect(await readFile(join(root, 'audit/audit.jsonl'), 'utf8')).toContain('auto-policy')
    const ledgerPath = join(root, 'processing/automation-tasks.json')
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))
    const applied = ledger.tasks.find(task => task.stage === 'wikiReview' && task.status === 'succeeded')
    applied.status = 'running'; await writeFile(ledgerPath, JSON.stringify(ledger))
    service = new KnowledgeAutomationService(deps); await service.run()
    expect((await listWikiHistory({ workspaceId: 'project', slug: 'workflows' })).total).toBe(2)
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
    expect((await knowledgeTruthService.list()).wikiPages.some(page => page.slug === 'workflows')).toBe(false)
    expect((await knowledgeTruthService.list({ includeStaleWiki: true })).wikiPages.find(page => page.slug === 'workflows')?.freshness).toBe('stale')
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
})
