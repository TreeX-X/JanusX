// Note: Continue in New Session live drill — one Continue mints exactly one
// card, the focused handoff lands once the composer is ready, a failed create
// leaves no ghost, and external rows run provider resume — see
// .agents/notes/sessions/records/session-identity-single-mint.md and
// .agents/notes/sessions/requirements/workspace-session-checkpoint-continue.md
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ExperimentalAPI } from '../../src/shared/ipc/experimental'
import type { SessionAPI, AgentSessionSummary } from '../../src/shared/ipc/session'
import type { TerminalAPI } from '../../src/shared/ipc/terminal'
import type { WorkspaceAPI } from '../../src/shared/ipc/workspace'
import { createDesktopTestEnv } from './desktop-test-env'

interface DesktopAPI {
  system: { setLanguage(language: string): Promise<void> }
  experimental: ExperimentalAPI
  session: SessionAPI
  terminal: TerminalAPI
  workspace: WorkspaceAPI
}

type DesktopWindow = Window & { electron: DesktopAPI }
type ElectronProcess = ReturnType<ElectronApplication['process']>

const PROCESS_EXIT_TIMEOUT = 5_000
const HANDOFF_MARKER = '继续任务'
const PROVIDER_SESSION_ID = 'sess-ext-1'

const FAKE_AGENT_JS = [
  "const fs = require('fs')",
  "const path = require('path')",
  'const dir = __dirname',
  "fs.writeFileSync(path.join(dir, 'argv-' + process.pid + '.json'), JSON.stringify(process.argv.slice(2)))",
  "process.stdout.write('\\u001b[?2004hfake-agent ready> ')",
  "process.stdin.on('data', (chunk) => {",
  '  try {',
  "    fs.appendFileSync(path.join(dir, 'got-' + process.pid + '.txt'), chunk.toString('utf8'))",
  '  } catch {}',
  '})',
  'setInterval(() => {}, 1000)',
  '',
].join('\n')

const FAKE_AGENT_CMD = '@echo off\r\nnode "%~dp0fake-agent.js" %*\r\n'

function claudeUser(text: string, sessionId: string, cwd: string, timestamp: string) {
  return { type: 'user', message: { role: 'user', content: text }, sessionId, cwd, timestamp }
}

function claudeAssistant(text: string, sessionId: string, cwd: string, timestamp: string) {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    sessionId,
    cwd,
    timestamp,
  }
}

/** Fixture PATH: our fake agent shims win `where claude` / `where pi` resolution. */
function fixtureEnv(fixtureRoot: string, binDir: string): NodeJS.ProcessEnv {
  const env = createDesktopTestEnv(fixtureRoot)
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const cleaned = (env[pathKey] ?? '')
    .split(';')
    .filter(Boolean)
    .filter((entry) => {
      for (const shim of ['claude.cmd', 'claude.exe', 'pi.cmd', 'pi.exe']) {
        if (existsSync(join(entry, shim))) return false
      }
      return true
    })
  env[pathKey] = [binDir, ...cleaned].join(';')
  return env
}

async function readFakeAgentState(binDir: string): Promise<{ argvs: string[][]; inputs: string }> {
  const files = await readdir(binDir)
  const argvs: string[][] = []
  let inputs = ''
  for (const file of files) {
    if (file.startsWith('argv-') && file.endsWith('.json')) {
      argvs.push(JSON.parse(await readFile(join(binDir, file), 'utf-8')) as string[])
    }
    if (file.startsWith('got-') && file.endsWith('.txt')) {
      inputs += await readFile(join(binDir, file), 'utf-8')
    }
  }
  return { argvs, inputs }
}

function isProcessRunning(process: ElectronProcess): boolean {
  return process.exitCode === null && process.signalCode === null
}

async function settlesWithin(promise: Promise<unknown>, timeout: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise.then(() => true, () => false),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeout)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function waitForProcessExit(process: ElectronProcess, timeout: number): Promise<boolean> {
  if (!isProcessRunning(process)) return true
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined
    const finish = (exited: boolean): void => {
      if (timer) clearTimeout(timer)
      process.removeListener('exit', onExit)
      resolve(exited)
    }
    const onExit = (): void => finish(true)
    process.once('exit', onExit)
    timer = setTimeout(() => finish(false), timeout)
    if (!isProcessRunning(process)) finish(true)
  })
}

async function closeApplication(application: ElectronApplication | undefined): Promise<void> {
  if (!application) return
  const process = application.process()
  if (!isProcessRunning(process)) return

  const closedGracefully = await settlesWithin(application.close(), PROCESS_EXIT_TIMEOUT)
  if (closedGracefully || !isProcessRunning(process)) return

  process.kill('SIGKILL')
  if (!(await waitForProcessExit(process, PROCESS_EXIT_TIMEOUT))) {
    throw new Error('Electron process did not exit after forced termination')
  }
}

async function listLive(page: Page): Promise<AgentSessionSummary[]> {
  return page.evaluate(() => (window as DesktopWindow).electron.session.list())
}

test('Continue in New Session mints one card, delivers one handoff, and fails without ghosts', async () => {
  test.setTimeout(150_000)
  const entry = resolve('out/main/index.js')
  let fixtureRoot: string | undefined
  let application: ElectronApplication | undefined
  let page: Page | undefined

  try {
    await accessFixture(entry)
    fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-session-continue-'))
    const binDir = join(fixtureRoot, 'bin')
    const userDataDir = join(fixtureRoot, 'user-data')
    const workspacePath = join(fixtureRoot, 'workspace')
    const doomedPath = join(fixtureRoot, 'doomed')
    const transcriptPath = join(fixtureRoot, '.claude', 'projects', 'proj', `${PROVIDER_SESSION_ID}.jsonl`)
    await Promise.all([
      mkdir(binDir, { recursive: true }),
      mkdir(userDataDir, { recursive: true }),
      mkdir(workspacePath, { recursive: true }),
      mkdir(doomedPath, { recursive: true }),
      mkdir(join(fixtureRoot, '.claude', 'projects', 'proj'), { recursive: true }),
    ])
    await Promise.all([
      writeFile(join(binDir, 'fake-agent.js'), FAKE_AGENT_JS, 'utf-8'),
      writeFile(join(binDir, 'claude.cmd'), FAKE_AGENT_CMD, 'utf-8'),
      writeFile(join(binDir, 'pi.cmd'), FAKE_AGENT_CMD, 'utf-8'),
      writeFile(
        transcriptPath,
        [
          JSON.stringify(
            claudeUser('fix the login retry', PROVIDER_SESSION_ID, workspacePath, '2026-10-10T10:00:00.000Z'),
          ),
          JSON.stringify(
            claudeAssistant(
              'login retry fixed',
              PROVIDER_SESSION_ID,
              workspacePath,
              '2026-10-10T10:01:00.000Z',
            ),
          ),
          '',
        ].join('\n'),
        'utf-8',
      ),
    ])

    application = await electron.launch({
      args: [entry, `--user-data-dir=${userDataDir}`],
      env: fixtureEnv(fixtureRoot, binDir),
    })
    page = await application.firstWindow({ timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => {
      const api = (window as DesktopWindow).electron
      return Boolean(api?.session?.continue && api?.terminal?.create && api?.workspace?.create)
    })
    await page.evaluate(() => (window as DesktopWindow).electron.system.setLanguage('zh-CN'))

    const workspace = await page.evaluate(
      ({ workspacePath }) =>
        (window as DesktopWindow).electron.workspace.create({
          name: 'Continue drill',
          path: workspacePath,
        }),
      { workspacePath },
    )

    // Source row: an agent terminal mints its session exactly once.
    await page.evaluate(
      ({ workspaceId, workspacePath }) =>
        (window as DesktopWindow).electron.terminal.create({
          id: 'source-terminal',
          workspaceId,
          cwd: workspacePath,
          shell: 'powershell.exe',
          preset: 'claude',
        }),
      { workspaceId: workspace.id, workspacePath },
    )
    const source = (await listLive(page)).find((row) => row.engine === 'claude' && row.external !== true)
    expect(source, 'source terminal mints one internal claude row').toBeTruthy()

    // AC-4 machine side: one Continue produces exactly one new card, the
    // original row stays intact, and the handoff lands in the new session.
    const beforeContinue = (await listLive(page)).length
    const continued = await page.evaluate(
      (sessionId) => (window as DesktopWindow).electron.session.continue({ sessionId }),
      source!.id,
    )
    await expect
      .poll(async () => (await listLive(page)).length, { timeout: 15_000 })
      .toBe(beforeContinue + 1)
    const rows = await listLive(page)
    const newRow = rows.find((row) => row.id === continued.sessionId)
    expect(newRow?.continuedFrom).toBe(source!.id)
    expect(newRow?.cwd).toBe(workspacePath)
    expect(rows.find((row) => row.id === source!.id), 'original session stays resumable').toBeTruthy()

    await expect
      .poll(
        async () => {
          const detail = await page!.evaluate(
            (sessionId) => (window as DesktopWindow).electron.session.get(sessionId),
            continued.sessionId,
          )
          return { prompt: detail?.firstPrompt ?? '', pending: detail?.pendingHandoff ?? null }
        },
        { timeout: 20_000 },
      )
      .toEqual({ prompt: expect.stringContaining(HANDOFF_MARKER), pending: null })
    await expect
      .poll(async () => (await readFakeAgentState(binDir)).inputs, { timeout: 20_000 })
      .toContain(HANDOFF_MARKER)

    // Live UI drill: enable the gated sessions tool, then one click of 在新会话中继续
    // grows the card list by exactly one.
    await page.evaluate(() => (window as DesktopWindow).electron.experimental.update({ sessions: true }))
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => {
      const api = (window as DesktopWindow).electron
      return Boolean(api?.session?.list && api?.experimental?.get)
    })
    await page.evaluate(() => (window as DesktopWindow).electron.system.setLanguage('zh-CN'))
    const workspaceRow = page.locator('.ws').filter({ hasText: 'Continue drill' }).first()
    await expect(workspaceRow).toBeVisible({ timeout: 10_000 })
    await workspaceRow.click()
    await page.getByRole('button', { name: /打开会话工具/ }).click()
    await expect(page.getByText('会话管理', { exact: true })).toBeVisible()

    // Live rows in scope: source, the API-continued card, and the imported
    // external row — each non-archived card offers 在新会话中继续 behind its
    // fold (single-card expansion), so expand the first card right before its click.
    await page.getByRole('button', { name: '展开', exact: true }).first().click()
    const continueButtons = page.getByRole('button', { name: '在新会话中继续', exact: true })
    await expect(continueButtons).toHaveCount(3, { timeout: 10_000 })
    const xtermsBeforeUiContinue = await page.locator('.xterm-rows').count()
    await continueButtons.first().click()
    await expect(page.getByRole('button', { name: '开始新会话', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '开始新会话', exact: true }).click()
    await expect(continueButtons).toHaveCount(4, { timeout: 15_000 })
    // The workbench must mount the new terminal view, not just the ledger row:
    // the terminal:created subscription is app-level, so a main-side launch
    // bootstraps even when the pane tree was empty before it.
    await expect
      .poll(async () => page.locator('.xterm-rows').count(), { timeout: 15_000 })
      .toBeGreaterThan(xtermsBeforeUiContinue)

    // AC-8 machine side: an external row keeps Resume and 在新会话中继续 side by
    // side, and Resume re-enters the provider session id in a fresh terminal.
    const external = (await listLive(page)).find((row) => row.external === true)
    expect(external, 'boot backfill imports the fake transcript').toBeTruthy()
    expect(external?.providerSessionId).toBe(PROVIDER_SESSION_ID)
    const externalCard = page
      .locator('div[class*="cardSurface"]')
      .filter({ has: page.getByText('外部', { exact: true }) })
      .first()
    const externalFold = externalCard.getByRole('button', { name: '展开', exact: true })
    if ((await externalFold.count()) > 0) await externalFold.click()
    const resumeButton = externalCard.getByRole('button', { name: '回到原会话', exact: true })
    await expect(resumeButton).toHaveCount(1, { timeout: 10_000 })
    await resumeButton.click()
    await expect
      .poll(async () => (await readFakeAgentState(binDir)).argvs, { timeout: 20_000 })
      .toContainEqual(['--resume', PROVIDER_SESSION_ID])
    await expect
      .poll(async () => (await listLive(page)).filter((row) => row.continuedFrom === external!.id).length, {
        timeout: 15_000,
      })
      .toBe(1)

    // Regression: 在新会话中继续 on an external row must launch the row's own
    // engine and land in the active workspace. A bare-shell spawn writes no
    // fake-agent argv file, and an empty workspaceId hides the terminal from
    // the workspace the user is viewing.
    const argvBefore = (await readFakeAgentState(binDir)).argvs.length
    const xtermsBeforeExtContinue = await page.locator('.xterm-rows').count()
    const rowsBeforeContinue = await listLive(page)
    await externalCard.getByRole('button', { name: '在新会话中继续', exact: true }).click()
    await expect(page.getByRole('button', { name: '开始新会话', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '开始新会话', exact: true }).click()
    await expect
      .poll(async () => (await readFakeAgentState(binDir)).argvs.length, { timeout: 20_000 })
      .toBe(argvBefore + 1)
    await expect
      .poll(async () => page.locator('.xterm-rows').count(), { timeout: 15_000 })
      .toBeGreaterThan(xtermsBeforeExtContinue)
    await expect
      .poll(async () => (await readFakeAgentState(binDir)).inputs, { timeout: 20_000 })
      .toContain('完整原始转录')
    const extContinued = (await listLive(page)).find(
      (row) => !rowsBeforeContinue.some((before) => before.id === row.id),
    )
    expect(extContinued?.continuedFrom).toBe(external!.id)
    expect(extContinued?.workspaceId).toBe(workspace.id)

    // A create that never comes up archives its empty row: no ghost card.
    await page.evaluate(
      ({ workspaceId, doomedPath }) =>
        (window as DesktopWindow).electron.terminal.create({
          id: 'doomed-terminal',
          workspaceId,
          cwd: doomedPath,
          shell: 'powershell.exe',
          preset: 'pi',
        }),
      { workspaceId: workspace.id, doomedPath },
    )
    const doomed = (await listLive(page)).find((row) => row.engine === 'pi' && row.external !== true)
    expect(doomed, 'doomed source row exists before its resume argv can fail').toBeTruthy()
    await rm(join(binDir, 'pi.cmd'), { force: true })
    const beforeFailed = (await listLive(page)).length
    let failedCreate = false
    try {
      await page.evaluate(
        (sessionId) => (window as DesktopWindow).electron.session.continue({ sessionId }),
        doomed!.id,
      )
    } catch {
      failedCreate = true
    }
    expect(failedCreate, 'failed create surfaces instead of silently succeeding').toBe(true)
    expect((await listLive(page)).length).toBe(beforeFailed)
  } finally {
    if (page && !page.isClosed()) {
      await page
        .evaluate(async () => {
          const api = (window as DesktopWindow).electron
          const rows = await api.session.list({ includeArchived: true }).catch(() => [])
          for (const row of rows) {
            for (const terminalId of (row as unknown as { terminalIds?: string[] }).terminalIds ?? []) {
              await api.terminal.kill(terminalId).catch(() => undefined)
            }
          }
        })
        .catch(() => undefined)
    }
    await closeApplication(application)
    if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true }).catch(() => undefined)
  }
})

async function accessFixture(entry: string): Promise<void> {
  if (!existsSync(entry)) {
    throw new Error(`Built desktop entry missing at ${entry}; run npm run build before the desktop project`)
  }
}
