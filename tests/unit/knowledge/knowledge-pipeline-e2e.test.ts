import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import { knowledgeObservationService, resetObservationServiceEphemeralState } from '../../../src/main/knowledge/observation-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeSearchService } from '../../../src/main/knowledge/search-service'
import { knowledgeContextService } from '../../../src/main/knowledge/context-service'
import { knowledgeDiagnosticsService } from '../../../src/main/knowledge/diagnostics-service'
import { knowledgeRecallService } from '../../../src/main/knowledge/recall-service'
import { KnowledgeProcessingQueue } from '../../../src/main/knowledge/processing-queue'
import { runDeterministicStage } from '../../../src/main/knowledge/deterministic-extractor'

const WS = 'ws-e2e'

/**
 * Phase 5 e2e（vitest 级，可在 CI 直接运行）：采集 → 确定性 proposal →
 * 审核 → truth → 检索 → 上下文，外加 §6 指标（derivation 计数 / 索引时间 /
 * 维护戳）。桌面端 Playwright spec（tests/e2e/knowledge-pipeline.spec.ts）
 * 复用同一断言链走真实 IPC，需 `NO_PROXY=127.0.0.1,localhost`。
 */
describe('knowledge pipeline e2e (Phase 5, no LLM)', () => {
  let root: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    resetObservationServiceEphemeralState()
    root = await mkdtemp(join(tmpdir(), 'janusx-knowledge-e2e-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = join(root, 'knowledge')
  })

  afterEach(async () => {
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    await rm(root, { recursive: true, force: true })
  })

  it('采集 → proposal → 审核 → truth → 检索 → 上下文全链路可追溯', async () => {
    // 1. 采集：一条决策句（高精度 proposal）+ 一条 git 事实 + 一条普通笔记（仅索引）。
    const decision = await knowledgeObservationService.capture({
      workspaceId: WS,
      workspaceName: 'E2E Workspace',
      workspacePath: 'C:\\e2e',
      source: 'manual',
      type: 'user-note',
      content: '决定：采用软删除方案',
      actor: 'user',
      sessionId: 'session-e2e',
      agentId: 'codex',
    })
    await knowledgeObservationService.capture({
      workspaceId: WS,
      workspaceName: 'E2E Workspace',
      workspacePath: 'C:\\e2e',
      source: 'git-analyzer',
      type: 'git-event',
      content: 'commit e2e: add soft delete flag',
      fileRefs: ['src/user.ts'],
      actor: 'user',
    })
    await knowledgeObservationService.capture({
      workspaceId: WS,
      workspaceName: 'E2E Workspace',
      workspacePath: 'C:\\e2e',
      source: 'manual',
      type: 'user-note',
      content: '今天天气不错',
      actor: 'user',
    })

    // 2. 处理：无模型全量确定性沉淀。
    const queue = new KnowledgeProcessingQueue()
    queue.configureDeterministicHandler((batch) =>
      runDeterministicStage(batch, { getAutoAccept: async () => false }).then(() => undefined),
    )
    // 生产装配同款维护 handler（register.ts）：低峰任务真实可跑。
    queue.configureMaintenanceHandler(async () => {
      await knowledgeObservationService.autoPrune()
      await knowledgeObservationService.archiveOldShards({ confirm: true })
      await knowledgeObservationService.compactEvidence({ confirm: true })
    })
    try {
      const processed = await queue.processNow()
      expect(processed.handlerMissing).toBe(false)
      expect(processed.failed).toBe(0)
      expect(processed.processed).toBe(3)

      // 3. §6 指标：Inbox 压力按 derivation 可见，无模型即无 LLM 计数。
      const stats = await queue.processingStats()
      expect(stats.pendingTotal).toBe(0)
      expect(stats.llmConfigured).toBe(false)
      expect(stats.proposalsTotal).toBeGreaterThanOrEqual(2)
      expect(stats.proposalsByDerivation.deterministic).toBeGreaterThanOrEqual(2)
      expect(stats.failures).toBe(0)

      // 4. 审核前检索：治理层可见候选与证据 observation。
      const preSearch = await knowledgeSearchService.search({ query: '软删除', workspaceId: WS })
      const preIds = preSearch.hits.map((hit) => hit.id)
      expect(preIds).toContain(decision.id)

      const candidates = await knowledgeExtractService.listFactCandidates()
      const decisionCandidate = candidates.find((c) => c.fact.content.includes('软删除'))!
      expect(decisionCandidate.derivation).toBe('deterministic')
      expect(decisionCandidate.fact.kind).toBe('decision')
      expect(decisionCandidate.status).toBe('proposed')
      expect(decisionCandidate.evidence.observationIds).toContain(decision.id)

      // 5. 审核：批准决策 → truth 可追溯到 observation / workspace / derivation 证据链。
      const applied = await knowledgeReviewService.applyCandidate({ type: 'fact', id: decisionCandidate.id })
      const factId = applied.applied!.fact!.id
      const truth = await knowledgeTruthService.list()
      const fact = truth.facts.find((f) => f.id === factId)!
      expect(fact.status).toBe('active')
      expect(fact.kind).toBe('decision')
      expect(fact.provenance.workspaceId).toBe(WS)
      expect(fact.provenance.sourceObservationIds).toContain(decision.id)

      // 6. 上下文：truth 层拼装命中已接受事实并保留截断语义。
      const context = await knowledgeContextService.search({ query: '软删除', workspaceId: WS })
      expect(context.items.map((item) => item.id)).toContain(factId)
      expect(context.truncated).toBe(false)

      // 7. 索引新鲜度：recall 真实跑过之后 stats / diagnostics 均可见。
      await knowledgeRecallService.recall({ query: '软删除', layer: 'truth', workspaceId: WS })
      const fresh = await queue.processingStats()
      expect(fresh.indexUpdatedAt).not.toBeNull()

      const diagnostics = await knowledgeDiagnosticsService.snapshot({ workspaceId: WS })
      expect(diagnostics.candidates.byDerivation).toEqual(fresh.proposalsByDerivation)
      expect(diagnostics.indexUpdatedAt).toBe(fresh.indexUpdatedAt)
      expect(diagnostics.truth.facts).toBe(1)

      // 8. 维护戳：真实维护 handler 跑通并落戳。
      const maintenance = await queue.runMaintenanceNow()
      expect(maintenance.ran).toBe(true)
      expect((await queue.processingStats()).lastMaintenanceAt).toBe(maintenance.at)
    } finally {
      queue.dispose()
    }
  })
})
