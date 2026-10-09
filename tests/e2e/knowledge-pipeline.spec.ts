import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, rm, writeFile, readFile, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { KnowledgeAPI } from '../../src/shared/ipc/knowledge'
import { createDesktopTestEnv } from './desktop-test-env'
import { createHash } from 'node:crypto'
import { reviewCandidateSnapshot } from '../../src/shared/review-candidate-snapshot'
import { defaultKnowledgeAutomation } from '../../src/shared/knowledge-automation'
import { createServer } from 'node:http'
import { buildKnowledgeGraphView } from '../../src/renderer/src/components/knowledge/knowledgeGraph'
import type { KnowledgeWorkbenchSnapshot } from '../../src/renderer/src/services/knowledge'

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
  const entry = resolve(process.env.JANUSX_DESKTOP_ENTRY ?? 'out/main/index.js')
  let fixtureRoot: string | undefined
  let application: ElectronApplication | undefined
  let page: Page | undefined

  try {
    if (!process.env.JANUSX_DESKTOP_EXECUTABLE) await access(entry)
    fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-knowledge-e2e-'))
    const userDataDir = join(fixtureRoot, 'user-data')
    const workspacePath = join(fixtureRoot, 'workspace')
    await mkdir(userDataDir, { recursive: true })
    await mkdir(workspacePath, { recursive: true })
    const episodeDirectory = join(fixtureRoot, 'knowledge', 'episodes')
    await mkdir(episodeDirectory, { recursive: true })
    const legacyEpisode = { id: 'legacy-e2e', content: 'Fixture recent memory', createdAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z', ttlDays: 60, tags: [], sourceObservationIds: [], status: 'active' }
    const legacyBytes = JSON.stringify(legacyEpisode) + '\r\n'
    await writeFile(join(episodeDirectory, 'fixture.jsonl'), legacyBytes)

    application = await electron.launch({
      executablePath: process.env.JANUSX_DESKTOP_EXECUTABLE,
      args: [...(process.env.JANUSX_DESKTOP_EXECUTABLE ? [] : [entry]), `--user-data-dir=${userDataDir}`],
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

    // Local authorization belongs to the host; ordinary saves cannot opt in.
    const localGate = await page.evaluate(async automation => {
      const { knowledge, experimental } = window.electron
      const originalFlags = await experimental.get()
      await experimental.update({ knowledge: true })
      const saved = await knowledge.updateSettings({ automation: { ...automation, local: { ...automation.local, enabled: true } } })
      const checked = await knowledge.configureLocalModel({ ...automation.local, enabled: true, serverPath: 'relative.exe' })
      await knowledge.stopLocalModel()
      const stopped = await knowledge.getSettings()
      await experimental.update(originalFlags)
      return { saved: saved.automation!.local.enabled, checked: checked.report, stopped: stopped.automation!.local.enabled }
    }, defaultKnowledgeAutomation())
    await page.evaluate(() => window.electron.experimental.update({ knowledge: true, persona: true }))
    expect(localGate.saved).toBe(false)
    expect(localGate.checked).toMatchObject({ ok: false, reason: 'invalid-local-model-path' })
    expect(localGate.stopped).toBe(false)

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
    const candidates = await page.evaluate(() => (window as unknown as KnowledgeWindow).electron.knowledge.listCandidates())
    const decision = candidates.find(candidate => candidate.fact.content.includes('软删除'))
    expect(decision?.derivation).toBe('deterministic')
    expect(decision?.fact.kind).toBe('decision')
    if (!decision) throw new Error('decision candidate missing from Inbox')
    const candidateHash = createHash('sha256').update(reviewCandidateSnapshot(decision)).digest('hex')
    const appliedId = await page.evaluate(async ({ id, candidateHash }) => {
      const knowledge = (window as unknown as KnowledgeWindow).electron.knowledge
      const applied = await knowledge.applyCandidate({ type: 'fact', id, candidateHash })
      if (!applied.applied?.fact) throw new Error('applyCandidate produced no fact')
      return applied.applied.fact.id
    }, { id: decision.id, candidateHash })

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

    // Profile editing and migration use the real preload/IPC contract and isolated storage.
    const profile = await page.evaluate(async () => {
      const knowledge = (window as unknown as KnowledgeWindow).electron.knowledge
      const original = await knowledge.personalProfileEditContext()
      await knowledge.savePersonalProfile({ expectedHash: original.hash, overrides: { identity: 'Fixture identity', toolPrefs: ['pnpm'] } })
      const saved = await knowledge.personalProfileEditContext()
      await knowledge.forgetPersonalMemory({ kind: 'override', targetId: 'toolPrefs:0', targetHash: saved.hash })
      return knowledge.personalProfileEditContext()
    })
    expect(profile.overrides.identity).toBe('Fixture identity')
    expect(profile.overrides.toolPrefs ?? []).toEqual([])
    const migration = await page.evaluate(async () => {
      const knowledge = (window as unknown as KnowledgeWindow).electron.knowledge
      const preview = await knowledge.migrateLegacyEpisodes({})
      const result = await knowledge.migrateLegacyEpisodes({ expectedHash: preview.hash })
      const retry = await knowledge.migrateLegacyEpisodes({ expectedHash: preview.hash })
      return { preview, result, retry }
    })
    expect(migration.preview).toMatchObject({ files: 1, episodes: 1 })
    expect(migration.result.migrated).toBe(1)
    expect(migration.retry.migrated).toBe(0)
    expect(await readdir(episodeDirectory)).toEqual([])
    const backupDirectory = join(fixtureRoot, 'knowledge', 'migration', 'episodes')
    const [backup] = await readdir(backupDirectory)
    expect(await readFile(join(backupDirectory, backup), 'utf8')).toBe(legacyBytes)
    const controls = await page.evaluate(async ({ workspacePath, workspaceId }) => {
      const { knowledge, experimental } = window.electron
      const originalSettings = await knowledge.getSettings()
      await knowledge.updatePersonalSettings({ useInChat: false, episodeTtlDays: 30 })
      const saved = await knowledge.getPersonalSettings()
      const projectSettings = await knowledge.getSettings()
      const capture = async (personal: boolean) => {
        try {
          await knowledge.observe({ workspaceId: personal ? 'user' : workspaceId,
            workspacePath: personal ? 'user' : workspacePath, source: 'manual', type: 'user-note', content: 'Domain controls fixture' })
          return true
        } catch { return false }
      }
      const combinations: Array<{ knowledge: boolean; persona: boolean; projectCaptured: boolean; personalCaptured: boolean }> = []
      for (const flags of [{ knowledge: true, persona: false }, { knowledge: false, persona: true }, { knowledge: false, persona: false }, { knowledge: true, persona: true }]) {
        await experimental.update(flags)
        combinations.push({ ...flags, projectCaptured: await capture(false), personalCaptured: await capture(true) })
      }
      return { saved, engineeringUnchanged: JSON.stringify(projectSettings) === JSON.stringify(originalSettings), combinations }
    }, { workspacePath, workspaceId: WS_ID })
    expect(controls.saved).toMatchObject({ useInChat: false, episodeTtlDays: 30 })
    expect(controls.engineeringUnchanged).toBe(true)
    for (const result of controls.combinations) {
      expect(result.projectCaptured).toBe(result.knowledge)
      expect(result.personalCaptured).toBe(result.persona)
    }
  } finally {
    await closeApplication(application).catch(() => undefined)
    if (fixtureRoot) {
      await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
})

// Note: verify the published Wiki revision through real IPC, storage and UI — see .agents/notes/knowledge/tasks/knowledge-review-status-audit-plan.md
test('knowledge settlement: extraction and both reviews gate Wiki publication, updates and revocation', async () => {
  test.setTimeout(180_000)
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-wiki-settlement-'))
  const workspacePath = join(fixtureRoot, 'workspace')
  const userDataDir = join(fixtureRoot, 'user-data')
  await mkdir(workspacePath, { recursive: true })
  await mkdir(userDataDir, { recursive: true })
  const statements = ['Database records use soft deletion.', 'Backups run nightly.', 'Backups must remain encrypted.']
  let blockWikiReview = true
  const calls: string[] = []
  // Deterministic inference responses cross the production HTTP model client.
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/health') { response.end('{}'); return }
    if (request.url === '/props') { response.end(JSON.stringify({ default_generation_settings: { n_ctx: 131072 } })); return }
    if (request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return }
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const input = JSON.parse(body.messages.at(-1).content)
      calls.push(body.model)
      let output: unknown
      if (body.model === 'extraction' && input.evidence?.[0]?.key) {
        output = { complete: true, coveredEvidenceIds: input.evidence.map((part: { key: string }) => part.key), missing: [], invalidCandidateIds: [], reason: 'All fixture source parts are covered.' }
      } else if (body.model === 'extraction' && input.candidates) {
        output = { complete: true, selections: input.candidates.map((candidate: { content: string }, index: number) => ({
          index, action: 'keep', equivalentTo: input.existingKnowledge.find((item: { content: string }) => item.content === candidate.content)?.id ?? null, duplicateOf: null, reason: 'Durable fixture policy.',
        })) }
      } else if (body.model === 'extraction') {
        output = { complete: true, facts: input.evidence.flatMap((source: { id: string; content: string }) => statements.filter(text => source.content.includes(text)).map(content => ({
          content, kind: content.startsWith('Backups') ? 'procedure' : 'decision', concepts: [content.startsWith('Backups') ? 'backup-policy' : 'soft-deletion'],
          citations: [{ observationId: source.id, quote: content }],
        }))) }
      } else if (body.model === 'wikiGeneration') {
        const target = input.publishedPages.find((item: { markdown: string }) => item.markdown.includes(statements[0]!))
        output = { markdown: input.knowledge.map((item: { content: string }) => item.content).join('\n\n')
          + (target ? `\n\n[Database policy](${target.uri})` : ''), relations: [] }
      } else {
        const blocked = body.model === 'wikiReview' && blockWikiReview
        output = { verdict: blocked ? 'uncertain' : 'supported', reason: blocked ? 'Fixture requires Wiki review' : 'Fixture evidence is covered',
          complete: !blocked, conflict: false, coveredIds: blocked ? [] : input.required.map((item: { id: string }) => item.id) }
      }
      response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }))
    } catch { response.writeHead(500).end('{}') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture endpoint missing')
  let application: ElectronApplication | undefined
  let page: Page | undefined
  try {
    application = await electron.launch({ executablePath: process.env.JANUSX_DESKTOP_EXECUTABLE,
      args: [...(process.env.JANUSX_DESKTOP_EXECUTABLE ? [] : [resolve(process.env.JANUSX_DESKTOP_ENTRY ?? 'out/main/index.js')]), `--user-data-dir=${userDataDir}`],
      env: { ...createDesktopTestEnv(fixtureRoot), NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } })
    page = await application.firstWindow({ timeout: 30_000 })
    await page.waitForFunction(() => Boolean(window.electron?.knowledge?.automationRun))
    // The UI assertions below use Chinese labels even on an English Windows runner.
    await page.evaluate(() => window.electron.system.setLanguage('zh-CN'))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const bootstrap = await page.evaluate(async ({ endpoint }) => {
      await window.electron.experimental.update({ knowledge: true, persona: true })
      return window.electron.knowledge.configureLocalModel({ enabled: true, endpoint, serverPath: '', modelPath: '', contextTokens: 131072 })
    }, { endpoint: `http://127.0.0.1:${address.port}/v1` })
    expect(bootstrap.report).toMatchObject({ ok: true, mode: 'service' })
    const config = { ...bootstrap.settings.automation!, enabled: true }
    for (const stage of ['extraction', 'entryReview', 'wikiGeneration', 'wikiReview'] as const) {
      config.stages[stage] = { provider: stage === 'extraction' ? 'local' : 'off', providerId: '', model: stage, thinking: false }
    }
    const save = () => page!.evaluate(automation => window.electron.knowledge.updateSettings({ enabled: true, automation }), config)
    const run = () => page!.evaluate(() => window.electron.knowledge.automationRun({ backfill: true }))
    const truth = () => page!.evaluate(() => window.electron.knowledge.listTruth())
    const observe = async (content: string) => {
      await page!.evaluate(automation => window.electron.knowledge.updateSettings({ automation: { ...automation, enabled: false } }), config)
      const captured = await page!.evaluate(input => window.electron.knowledge.observe(input), {
        workspaceId: WS_ID, workspacePath, content, source: 'manual' as const, type: 'user-note' as const, actor: 'user', sessionId: content,
      })
      // Seed the trusted-capture boundary in this fixture only. Public observe IPC
      // intentionally cannot elevate an arbitrary actor label to user testimony.
      const shard = join(fixtureRoot, 'knowledge', 'observations', 'active', captured.createdAt.slice(0, 7) + '.jsonl')
      const rows = (await readFile(shard, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
      const source = rows.find(row => row.id === captured.id)
      source.sourceEvidence = { ...source.sourceEvidence, speaker: 'user', authority: 'user-stated' }
      await writeFile(shard, rows.map(row => JSON.stringify(row)).join('\n') + '\n')
      await save()
      return captured
    }
    const graph = (data: Awaited<ReturnType<typeof truth>>) => buildKnowledgeGraphView({ wikiPages: data.wikiPages, truthFacts: data.facts,
      truthEdges: data.graphEdges, observations: [] } as unknown as KnowledgeWorkbenchSnapshot)

    await save()
    await observe(statements[0]!)
    await run()
    const candidates = await page.evaluate(() => window.electron.knowledge.listCandidates())
    expect(candidates.filter(item => item.status === 'proposed')).toHaveLength(1)
    expect((await truth()).facts).toHaveLength(0)
    config.stages.entryReview.provider = 'local'
    await save(); await run()
    await expect.poll(async () => { await run(); return (await truth()).facts.length }, { timeout: 15000, intervals: [500] }).toBe(1)
    const entryTruth = await truth()
    expect(entryTruth.facts).toHaveLength(1)
    expect(entryTruth.facts[0]!.confirmation?.kind).toBe('model-review')
    expect(entryTruth.wikiPages).toHaveLength(0)
    config.stages.wikiGeneration.provider = 'local'
    await save()
    await expect.poll(async () => { await run(); return (await page!.evaluate(() => window.electron.knowledge.listWikiPatchCandidates())).length }, { timeout: 35_000, intervals: [1000] }).toBe(1)
    expect(graph(await truth()).nodes).toHaveLength(0)
    config.stages.wikiReview.provider = 'local'
    await save()
    const held = await run()
    const failedReview = held.queue.find(item => item.stage === 'wikiReview')
    expect(failedReview).toMatchObject({ status: 'needs-review', reason: 'Fixture requires Wiki review' })
    expect((await truth()).wikiPages).toHaveLength(0)
    blockWikiReview = false
    await page.evaluate(id => window.electron.knowledge.automationRetry(id), failedReview!.id!)
    await run()
    const first = (await truth()).wikiPages[0]!
    expect(first).toMatchObject({ status: 'published', version: 1, freshness: 'current', markdown: statements[0] + '\n' })

    await observe(statements[1]!)
    await expect.poll(async () => { await run(); return (await truth()).wikiPages.length }, { timeout: 40_000, intervals: [1000] }).toBe(2)
    const linked = await truth()
    const backup = linked.wikiPages.find(item => item.markdown.includes(statements[1]!))!
    expect(backup.relations).toEqual([expect.objectContaining({ type: 'references', target: expect.objectContaining({ slug: first.slug, version: 1 }) })])
    expect(graph(linked).edges).toHaveLength(1)
    expect(await page.evaluate(() => window.electron.knowledge.listGraphCandidates())).toEqual([])

    await observe(statements[2]!)
    await expect.poll(async () => { await run(); return (await truth()).wikiPages.find(item => item.slug === backup.slug)?.version }, { timeout: 40_000, intervals: [1000] }).toBe(2)
    const updated = (await truth()).wikiPages.find(item => item.slug === backup.slug)!
    expect(updated.markdown).toContain(statements[2])
    const revision = await page.evaluate(query => window.electron.knowledge.wikiRevision(query), { workspaceId: WS_ID, slug: backup.slug, version: 1 })
    expect(revision.page.markdown).toBe(backup.markdown)
    const context = await page.evaluate(workspaceId => window.electron.knowledge.context({ query: 'Backups encrypted', workspaceId, maxItems: 30, maxChars: 20000 }), WS_ID)
    expect(context.items.some(item => item.kind === 'wiki' && item.content === updated.markdown)).toBe(true)

    // Use the real rail, workbench and graph, not an injected renderer component.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await page.getByRole('toolbar').getByRole('button', { name: /^助手/ }).click()
    await page.getByRole('button', { name: '打开知识库工作台', exact: true }).click()
    const workbench = page.getByRole('region', { name: '知识与记忆', exact: true })
    await workbench.getByRole('navigation', { name: '知识引擎', exact: true }).getByRole('button', { name: /^图谱/ }).click()
    await expect(workbench.locator('.react-flow__edge-path')).toHaveCount(1)
    for (const theme of ['dark', 'planche']) {
      await page.evaluate(theme => window.electron.theme.update(theme), theme)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 800))
      await workbench.getByTitle(updated.title, { exact: true }).click()
      await expect(workbench.locator('[data-knowledge-markdown]').filter({ hasText: statements[2]! })).toBeVisible()
      await workbench.locator('.react-flow__controls-fitview').click()
      await mkdir('artifacts/knowledge-s5-desktop', { recursive: true })
      await page.screenshot({ path: `artifacts/knowledge-s5-desktop/wiki-${theme}.png`, animations: 'disabled' })
      await page.keyboard.press('Escape')
      await expect(workbench.locator('aside')).toHaveCount(0)
      await expect(workbench).toBeVisible()
      await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]!; window.setMinimumSize(320, 480); window.setSize(640, 720) })
      await expect.poll(() => page!.evaluate(() => innerWidth)).toBe(640)
      await workbench.locator('.react-flow__controls-fitview').click()
      await expect.poll(() => workbench.evaluate(el => {
        const canvas = el.querySelector('.react-flow')!.getBoundingClientRect()
        return [...el.querySelectorAll('.react-flow__node')].every(node => {
          const rect = node.getBoundingClientRect()
          return rect.left >= canvas.left - 1 && rect.right <= canvas.right + 1
            && rect.top >= canvas.top - 1 && rect.bottom <= canvas.bottom + 1
        })
      })).toBe(true)
      expect(await workbench.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.screenshot({ path: `artifacts/knowledge-s5-desktop/graph-640-${theme}.png`, animations: 'disabled' })
    }
    const backupFact = (await truth()).facts.find(item => item.content === statements[1])!
    await page.evaluate(input => window.electron.knowledge.revokeTruth(input), { kind: 'fact' as const, id: backupFact.id, workspaceId: WS_ID })
    const revoked = await truth()
    expect(revoked.wikiPages.find(item => item.slug === backup.slug)).toMatchObject({ freshness: 'stale', version: 2 })
    expect(graph(revoked).edges).toHaveLength(0)
    const afterContext = await page.evaluate(workspaceId => window.electron.knowledge.context({ query: 'Backups nightly', workspaceId, maxItems: 30 }), WS_ID)
    expect(afterContext.items.filter(item => item.kind === 'wiki').some(item => item.content === updated.markdown)).toBe(false)
    const audit = await page.evaluate(() => window.electron.knowledge.auditPage({ domain: 'engineering', limit: 100 }))
    expect(audit.items.some(item => item.targetType === 'wiki')).toBe(true)
    expect(calls).toEqual(expect.arrayContaining(['extraction', 'entryReview', 'wikiGeneration', 'wikiReview']))
    expect(errors).toEqual([])
  } catch (error) {
    if (page && !page.isClosed()) {
      await mkdir('artifacts/knowledge-s5-desktop', { recursive: true })
      await page.screenshot({ path: 'artifacts/knowledge-s5-desktop/failure.png' }).catch(() => undefined)
      await writeFile('artifacts/knowledge-s5-desktop/failure.txt', await page.locator('body').innerText()).catch(() => undefined)
      await writeFile('artifacts/knowledge-s5-desktop/failure-status.json', JSON.stringify(await page.evaluate(() => window.electron.knowledge.automationStatus()), null, 2)).catch(() => undefined)
    }
    throw error
  } finally {
    await closeApplication(application)
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
