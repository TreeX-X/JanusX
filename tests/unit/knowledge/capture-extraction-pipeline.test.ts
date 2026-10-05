import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { agentTurnRecorder } from '../../../src/main/knowledge/agent-turn-recorder'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { KnowledgeAutomationService } from '../../../src/main/knowledge/automation-service'
import { defaultKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/config/service', () => ({ configService: { getKnowledgeSettings: async () => ({ enabled: true }), getExperimentalFeatures: async () => ({ knowledge: true }) } }))
vi.mock('../../../src/main/knowledge/contract-service', () => ({ knowledgeContractService: { bootstrapWorkspace: vi.fn() } }))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({ knowledgeProcessingQueue: { schedule: vi.fn(), scheduleImmediate: vi.fn() } }))
let root: string
afterEach(async () => { agentTurnRecorder.dispose(); vi.unstubAllEnvs(); if (root) await rm(root, { recursive: true, force: true }) })
it('captures full transcript evidence, survives recorder restart, deduplicates replay and feeds automatic review', async () => {
  root = await mkdtemp(join(tmpdir(), 'capture-extraction-')); vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root)
  const path = join(root, 'transcript.jsonl')
  const prompt = 'Use in-process cache only in development.'
  await writeFile(path, [
    { type: 'user', uuid: 'u1', message: { role: 'user', content: prompt } },
    { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: 'Implemented development cache. ' + 'Details. '.repeat(800) } },
    { type: 'user', uuid: 't1', message: { role: 'user', content: [{ type: 'tool_result', content: 'cache test passed' }] } },
  ].map(JSON.stringify).join('\n') + '\n')
  const terminal = { terminalId: 'terminal', engine: 'claude' as const, workspaceId: 'project', cwd: root }
  agentTurnRecorder.registerTerminal(terminal)
  await agentTurnRecorder.handleHookPayload({ source: 'claude', event: 'UserPromptSubmit', terminalId: 'terminal', sessionId: 'session', message: prompt, timestamp: '2026-10-05T00:00:00.000Z' })
  agentTurnRecorder.dispose(); agentTurnRecorder.registerTerminal(terminal)
  const end = { source: 'claude' as const, event: 'Stop', terminalId: 'terminal', sessionId: 'session', timestamp: '2026-10-05T00:01:00.000Z', raw: { transcript_path: path } }
  await agentTurnRecorder.handleHookPayload(end); await agentTurnRecorder.handleHookPayload(end)
  const observations = await knowledgeObservationService.listAll(true)
  expect(observations).toHaveLength(4)
  const answer = observations.find(row => row.sourceEvidence?.speaker === 'assistant')!
  expect((await knowledgeObservationService.resolveContent(answer)).length).toBeGreaterThan(6000)
  const source = observations.find(row => row.sourceEvidence?.speaker === 'user')!
  const config = defaultKnowledgeAutomation(); config.enabled = true; config.enabledSince = '2020-01-01T00:00:00.000Z'
  config.stages.extraction = { provider: 'external', providerId: 'test', model: 'model', thinking: false }
  config.stages.entryReview = { ...config.stages.extraction }
  const model = vi.fn(async request => {
    if (request.input.candidates) return { complete: true, selections: request.input.candidates.map((_item, index) => ({ index, action: 'keep', equivalentTo: null, duplicateOf: null })) }
    expect(request.input.evidence.some(row => row.authority === 'tool-observed')).toBe(true)
    return { complete: true, facts: [{ content: prompt, kind: 'decision', concepts: ['cache'], citations: [{ observationId: source.id, quote: prompt }] }] }
  })
  const service = new KnowledgeAutomationService({ settings: async () => ({ allowed: true, config }), snapshot: async () => {
    const truth = await knowledgeTruthService.list(); return { observations: await knowledgeObservationService.listAll(true),
      candidates: await knowledgeExtractService.listFactCandidates(), patches: [], facts: truth.facts, pages: truth.wikiPages }
  }, content: row => knowledgeObservationService.resolveContent(row), json: model,
    review: async (_request, required) => ({ verdict: 'supported', reason: 'source confirms rule', complete: true, conflict: false, coveredIds: required.map(row => row.id) }), now: Date.now })
  try {
    await service.run(); expect((await knowledgeTruthService.list()).facts).toHaveLength(1)
    expect((await knowledgeExtractService.listFactCandidates())[0].evidence.quotes).toEqual([{ observationId: source.id, quote: prompt }])
    const calls = model.mock.calls.length; await service.run(); expect(model.mock.calls).toHaveLength(calls)
  } finally { service.stop() }
  // A later completion with a missing start hook must not recover an already closed turn.
  const nextPrompt = 'Keep database backups for seven days.'
  await writeFile(path, [
    { type: 'user', uuid: 'u2', message: { role: 'user', content: nextPrompt } },
    { type: 'assistant', uuid: 'a2', message: { role: 'assistant', content: 'Updated retention.' } },
  ].map(JSON.stringify).join('\n') + '\n')
  await agentTurnRecorder.handleHookPayload({ ...end, timestamp: '2026-10-05T00:02:00.000Z' })
  const updated = await knowledgeObservationService.listAll(true)
  const next = updated.find(row => row.content === nextPrompt)!
  expect(next).toBeDefined()
  expect(next.correlationId).not.toBe(source.correlationId)
})
