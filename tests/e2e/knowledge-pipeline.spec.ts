import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { KnowledgeAPI } from '../../src/shared/ipc/knowledge'
import { createDesktopTestEnv } from './desktop-test-env'

type KnowledgeWindow = Window & { electron: { knowledge: KnowledgeAPI } }

const WS_ID = 'ws-desktop-e2e'
const PROCESS_EXIT_TIMEOUT = 5_000

/**
 * Phase 5 e2e（桌面端，走真实 IPC + 真实服务；CI/桌面环境运行）：
 * 采集 → 确定性 proposal → 审核 → truth → 检索 → 上下文，外加 §6 指标。
 * 无默认模型时 LLM 阶段干净跳过，确定性产物不受影响。
 *
 * NOTE: 按实施方案 §11，运行需 `NO_PROXY=127.0.0.1,localhost`
 *（本地启动时本文件已在 launch env 内置该值）。
 */
async function closeApplication(application: ElectronApplication | undefined): Promise<void> {
  if (!application) return
  const process = application.process()
  const running = process.exitCode === null && process.signalCode === null
  if (!running) return
  await application.close().catch(() => undefined)
  if (process.exitCode === null && process.signalCode === null) {
    process.kill('SIGKILL')
  }
  void PROCESS_EXIT_TIMEOUT
}

test('knowledge pipeline: observe → propose → review → truth → search → context', async () => {
  const entry = resolve('out/main/index.js')
  let fixtureRoot: string | undefined
  let application: ElectronApplication | undefined
  let page: Page | undefined

  try {
    await access(entry)
    fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-knowledge-e2e-'))
    const userDataDir = join(fixtureRoot, 'user-data')
    const workspacePath = join(fixtureRoot, 'workspace')
    await mkdir(userDataDir, { recursive: true })
    await mkdir(workspacePath, { recursive: true })

    application = await electron.launch({
      args: [entry, `--user-data-dir=${userDataDir}`],
      env: {
        ...createDesktopTestEnv(fixtureRoot),
        NO_PROXY: '127.0.0.1,localhost',
        no_proxy: '127.0.0.1,localhost',
      },
    })
    page = await application.firstWindow({ timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => {
      const api = (window as unknown as KnowledgeWindow).electron
      return typeof api?.knowledge?.observe === 'function' && typeof api?.knowledge?.processNow === 'function'
    })
    await expect(page.locator('body')).toBeVisible()

    // 1. 采集：决策句（高精度 proposal）+ git 事实 + 普通笔记（仅索引）。
    const observed = await page.evaluate(
      ({ workspaceId, workspacePath }) => {
        const knowledge = (window as unknown as KnowledgeWindow).electron.knowledge
        return Promise.all([
          knowledge.observe({
            workspaceId,
            workspacePath,
            source: 'manual',
            type: 'user-note',
            content: '决定：采用软删除方案',
            actor: 'user',
            sessionId: 'session-desktop-e2e',
            agentId: 'codex',
          }),
          knowledge.observe({
            workspaceId,
            workspacePath,
            source: 'git-analyzer',
            type: 'git-event',
            content: 'commit desktop: add soft delete flag',
            fileRefs: ['src/user.ts'],
            actor: 'user',
          }),
          knowledge.observe({
            workspaceId,
            workspacePath,
            source: 'manual',
            type: 'user-note',
            content: '今天天气不错',
            actor: 'user',
          }),
        ])
      },
      { workspaceId: WS_ID, workspacePath },
    )
    expect(observed).toHaveLength(3)
    const decisionId = observed[0].id

    // 2. 处理 + §6 指标：无待处理、Inbox 压力按 derivation 可见。
    const run = await page.evaluate(() => (window as unknown as KnowledgeWindow).electron.knowledge.processNow())
    expect(run.handlerMissing).toBe(false)
    expect(run.failed).toBe(0)
    expect(run.processed).toBe(3)

    const stats = await page.evaluate(() => (window as unknown as KnowledgeWindow).electron.knowledge.processingStats())
    expect(stats.pendingTotal).toBe(0)
    expect(stats.proposalsTotal).toBeGreaterThanOrEqual(2)
    expect(stats.proposalsByDerivation.deterministic).toBeGreaterThanOrEqual(2)
    expect(stats.failures).toBe(0)

    // 3. 审核前检索：治理层可见候选与证据 observation。
    const preSearch = await page.evaluate(
      (workspaceId) => (window as unknown as KnowledgeWindow).electron.knowledge.search({ query: '软删除', workspaceId }),
      WS_ID,
    )
    expect(preSearch.hits.map((hit) => hit.id)).toContain(decisionId)

    // 4. 审核：批准决策候选 → truth 落库且可追溯。
    const appliedId = await page.evaluate(async () => {
      const knowledge = (window as unknown as KnowledgeWindow).electron.knowledge
      const candidates = await knowledge.listCandidates()
      const decision = candidates.find((c) => c.fact.content.includes('软删除'))
      if (!decision) throw new Error('decision candidate missing from Inbox')
      if (decision.derivation !== 'deterministic' || decision.fact.kind !== 'decision') {
        throw new Error('decision candidate lost derivation/kind')
      }
      const applied = await knowledge.applyCandidate({ type: 'fact', id: decision.id })
      if (!applied.applied?.fact) throw new Error('applyCandidate produced no fact')
      return applied.applied.fact.id
    })

    const truth = await page.evaluate(() => (window as unknown as KnowledgeWindow).electron.knowledge.listTruth())
    const fact = truth.facts.find((f) => f.id === appliedId)
    expect(fact?.status).toBe('active')
    expect(fact?.provenance.sourceObservationIds).toContain(decisionId)

    // 5. 上下文：truth 层拼装命中已接受事实。
    const context = await page.evaluate(
      (workspaceId) => (window as unknown as KnowledgeWindow).electron.knowledge.context({ query: '软删除', workspaceId }),
      WS_ID,
    )
    expect(context.items.map((item) => item.id)).toContain(appliedId)

    // 6. 诊断与指标一致：byDerivation 同口径、索引时间可见、truth 计数对上。
    const diagnostics = await page.evaluate(
      (workspaceId) => (window as unknown as KnowledgeWindow).electron.knowledge.diagnostics({ workspaceId }),
      WS_ID,
    )
    const statsAfter = await page.evaluate(() => (window as unknown as KnowledgeWindow).electron.knowledge.processingStats())
    expect(diagnostics.candidates.byDerivation).toEqual(statsAfter.proposalsByDerivation)
    expect(statsAfter.indexUpdatedAt).not.toBeNull()
    expect(diagnostics.indexUpdatedAt).toBe(statsAfter.indexUpdatedAt)
    expect(diagnostics.truth.facts).toBeGreaterThanOrEqual(1)
  } finally {
    await closeApplication(application).catch(() => undefined)
    if (fixtureRoot) {
      await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
})
