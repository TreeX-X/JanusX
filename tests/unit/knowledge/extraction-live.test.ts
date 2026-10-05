import { expect, it, vi } from 'vitest'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OpenAICompatibleAdapter, type ProviderSettings } from '@janusx/llm-core'
import { KnowledgeAutomationService } from '../../../src/main/knowledge/automation-service'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeModelJson, reviewKnowledge } from '../../../src/main/knowledge/knowledge-models'
import { defaultKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/contract-service', () => ({ knowledgeContractService: { bootstrapWorkspace: vi.fn() } }))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({ knowledgeProcessingQueue: { schedule: vi.fn() } }))
let selected: ProviderSettings
vi.mock('../../../src/main/llm/LlmService', () => ({ llmService: {
  getProviderSettings: async () => selected,
  getLanguageModel: async (_terminal: string, _provider: string, model: string) => new OpenAICompatibleAdapter().createLanguageModel(selected, model),
} }))

it.runIf(process.env.JANUSX_EXTRACTION_LIVE === '1')('extracts corrected task knowledge with real external inference and verified source quotes', async () => {
  // Opt-in: only synthetic evidence leaves the machine. Read credentials without printing or copying them.
  const document = JSON.parse(await readFile(process.env.JANUSX_EXTRACTION_CONFIG!, 'utf8'))
  selected = Object.values(document.terminals.janus.providers).find((provider: unknown) => {
    const value = provider as ProviderSettings
    return value.enabled !== false && value.authType === 'api-key' && value.apiKey && (!process.env.JANUSX_EXTRACTION_PROVIDER || value.id === process.env.JANUSX_EXTRACTION_PROVIDER)
  }) as ProviderSettings
  expect(selected).toBeTruthy()
  const root = await mkdtemp(join(tmpdir(), 'extraction-live-'))
  vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root)
  const settings = defaultKnowledgeAutomation(); settings.enabled = true; settings.enabledSince = '2020-01-01T00:00:00.000Z'
  settings.stages.extraction = { provider: 'external', providerId: selected.id, model: selected.modelId!, thinking: false }
  settings.stages.entryReview = { ...settings.stages.extraction }
  let modelCalls = 0
  const service = new KnowledgeAutomationService({ settings: async () => ({ allowed: true, config: settings }),
    snapshot: async () => { const truth = await knowledgeTruthService.list(); return {
      observations: await knowledgeObservationService.listAll(true), candidates: await knowledgeExtractService.listFactCandidates(),
      patches: await knowledgeExtractService.listWikiPatchCandidates(), facts: truth.facts, pages: truth.wikiPages,
    } }, content: row => knowledgeObservationService.resolveContent(row),
    json: async request => { modelCalls++; try { const output = await knowledgeModelJson(request); console.info(JSON.stringify({ call: modelCalls, output })); return output } catch (error) { console.info(JSON.stringify({ call: modelCalls, error: (error as Error).message })); throw error } }, review: reviewKnowledge, now: Date.now })
  const started = Date.now()
  try {
    const contents = [
      { speaker: 'user' as const, content: '最初考虑用 Redis 缓存。数据库备份先保留 3 天。' },
      { speaker: 'assistant' as const, content: '可以采用 Redis。我还没有运行验证。' },
      { speaker: 'user' as const, content: '最终决定：仅在开发环境使用进程内缓存，避免引入外部服务，允许重启丢失缓存。数据库备份改为保留 7 天，恢复前必须验证校验和。不要把 Redis 或 3 天保存为当前方案。' },
      { speaker: 'tool' as const, content: 'Cache tests: 12 passed. Backup retention configuration: 7 days. Restore checksum validation: passed.' },
    ]
    for (const [index, row] of contents.entries()) await knowledgeObservationService.capture({ workspaceId: 'synthetic-project', workspacePath: root, source: 'agent-stream',
      type: 'conversation-turn', content: row.content, sessionId: 'synthetic-session', correlationId: 'task', agentId: 'claude',
      tags: [row.speaker === 'user' ? 'turn-started' : 'terminal-transcript'] }, { speaker: row.speaker, sourceEventId: `event-${index}`, createdAt: new Date(started + index).toISOString() })
    await knowledgeObservationService.capture({ workspaceId: 'synthetic-project', workspacePath: root, source: 'agent-stream', type: 'system-event', content: 'completed',
      sessionId: 'synthetic-session', correlationId: 'task', agentId: 'claude', tags: ['turn-completed'], metadata: { evidenceStatus: 'complete' } },
    { speaker: 'system', sourceEventId: 'completed', createdAt: new Date(started + 10).toISOString() })
    await service.run()
    const candidates = await knowledgeExtractService.listFactCandidates()
    const combined = candidates.map(candidate => candidate.fact.content).join('\n')
    console.info(JSON.stringify({ tasks: (await service.status()).tasks.map(task => ({ stage: task.stage, status: task.status, reason: task.reason })) }))
    expect(candidates.length).toBeGreaterThan(0)
    expect(combined).toMatch(/7\s*(天|days)/i)
    expect(combined).toMatch(/校验|checksum/i)
    expect(combined).toMatch(/开发|development/i)
    expect(combined).not.toMatch(/12\s*(tests|项|个)|12 tests/i)
    expect(candidates.length).toBeLessThanOrEqual(3)
    expect(combined).not.toMatch(/保留\s*3\s*天|retain.{0,10}3 days/i)
    for (const candidate of candidates) expect(candidate.evidence.quotes?.length).toBeGreaterThan(0)
    expect((await knowledgeTruthService.list()).facts.length).toBeGreaterThan(0)
    const count = candidates.length; const calls = modelCalls
    await service.run(); expect(await knowledgeExtractService.listFactCandidates()).toHaveLength(count); expect(modelCalls).toBe(calls)
    console.info(JSON.stringify({ test: 'external-task-extraction', model: selected.modelId, elapsedMs: Date.now() - started,
      candidates: candidates.map(candidate => ({ content: candidate.fact.content, status: candidate.status, citations: candidate.evidence.quotes?.length })),
      tasks: (await service.status()).tasks.map(task => ({ stage: task.stage, status: task.status, reason: task.reason })) }))
  } finally { service.stop(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) }
}, 360000)
