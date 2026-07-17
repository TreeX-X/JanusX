import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { ProjectAPI } from '../../src/shared/ipc/project'
import type { TerminalAPI } from '../../src/shared/ipc/terminal'
import type { WorkspaceAPI } from '../../src/shared/ipc/workspace'

interface DesktopAPI {
  project: ProjectAPI
  terminal: TerminalAPI
  workspace: WorkspaceAPI
}

type DesktopWindow = Window & { electron: DesktopAPI }
type ElectronProcess = ReturnType<ElectronApplication['process']>

const PROCESS_EXIT_TIMEOUT = 5_000

async function cleanupRendererFixtures(
  page: Page | undefined,
  terminalId: string | undefined,
  workspaceId: string | undefined,
): Promise<void> {
  if (!page || page.isClosed()) return
  await page.evaluate(
    async ({ terminalId, workspaceId }) => {
      const api = (window as DesktopWindow).electron
      if (terminalId) await api.terminal.kill(terminalId).catch(() => undefined)
      if (workspaceId) await api.workspace.delete(workspaceId).catch(() => undefined)
    },
    { terminalId, workspaceId },
  ).catch(() => undefined)
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

test('built desktop exposes typed Workspace, Terminal, and Project critical paths', async () => {
  const entry = resolve('out/main/index.js')
  let fixtureRoot: string | undefined
  let application: ElectronApplication | undefined
  let page: Page | undefined
  let workspaceId: string | undefined
  let terminalId: string | undefined

  try {
    await access(entry)
    fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-desktop-smoke-'))
    const userDataDir = join(fixtureRoot, 'user-data')
    const workspacePath = join(fixtureRoot, 'workspace')
    const projectPath = join(fixtureRoot, 'vite-project')
    await Promise.all([
      mkdir(userDataDir, { recursive: true }),
      mkdir(workspacePath, { recursive: true }),
      mkdir(join(projectPath, 'src'), { recursive: true }),
    ])
    await Promise.all([
      writeFile(
        join(projectPath, 'package.json'),
        JSON.stringify({ name: 'desktop-smoke-vite', scripts: { dev: 'vite' }, devDependencies: { vite: '^6.0.0' } }),
      ),
      writeFile(join(projectPath, 'vite.config.ts'), 'export default {}\n'),
    ])

    application = await electron.launch({
      args: [entry, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: '',
        NODE_ENV: 'production',
      },
    })
    page = await application.firstWindow({ timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => {
      const api = (window as DesktopWindow).electron
      return Boolean(api?.workspace?.create && api?.terminal?.create && api?.project?.detect)
    })
    await expect(page.locator('body')).toBeVisible()

    const workspace = await page.evaluate(
      ({ workspacePath }) =>
        (window as DesktopWindow).electron.workspace.create({
          name: 'Desktop smoke workspace',
          path: workspacePath,
        }),
      { workspacePath },
    )
    workspaceId = workspace.id
    expect(workspace).toMatchObject({
      id: expect.any(String),
      name: 'Desktop smoke workspace',
      path: workspacePath,
      clis: [],
      layout: { mode: 'grid', positions: [] },
    })

    const listed = await page.evaluate(() => (window as DesktopWindow).electron.workspace.list())
    expect(listed).toContainEqual(workspace)
    const loaded = await page.evaluate(
      (id) => (window as DesktopWindow).electron.workspace.load(id),
      workspace.id,
    )
    expect(loaded).toEqual(workspace)

    const shell = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : process.env.SHELL ?? '/bin/sh'
    terminalId = `desktop-smoke-${process.pid}`
    await expect(
      page.evaluate(() => (window as DesktopWindow).electron.terminal.warmup({ engines: [] })),
    ).resolves.toEqual({ ok: true })
    const createdTerminal = await page.evaluate(
      ({ cwd, id, shell, workspaceId }) =>
        (window as DesktopWindow).electron.terminal.create({
          id,
          workspaceId,
          cwd,
          shell,
          preset: 'shell',
          cols: 80,
          rows: 24,
        }),
      { cwd: workspacePath, id: terminalId, shell, workspaceId: workspace.id },
    )
    expect(createdTerminal.pid).toBeGreaterThan(0)
    const replay = await page.evaluate(
      (id) => (window as DesktopWindow).electron.terminal.replay(id),
      terminalId,
    )
    expect(replay).toEqual({ data: expect.any(String), seq: expect.any(Number) })
    await expect(
      page.evaluate(
        (id) => (window as DesktopWindow).electron.terminal.kill(id),
        terminalId,
      ),
    ).resolves.toEqual({ success: true })
    terminalId = undefined

    const detected = await page.evaluate(
      (path) => (window as DesktopWindow).electron.project.detect(path),
      projectPath,
    )
    expect(detected).toEqual({ success: true, data: { type: 'vite' } })
    const details = await page.evaluate(
      (path) => (window as DesktopWindow).electron.project.detectWithDetails(path),
      projectPath,
    )
    expect(details).toMatchObject({
      success: true,
      data: {
        type: 'vite',
        confidence: expect.any(Number),
        detectedFeatures: ['package.json', 'vite.config.ts'],
        recommendedConfig: { type: 'vite', packageManager: 'npm' },
      },
    })

    await expect(
      page.evaluate(
        (id) => (window as DesktopWindow).electron.workspace.delete(id),
        workspace.id,
      ),
    ).resolves.toEqual({ success: true })
    workspaceId = undefined
    const afterDelete = await page.evaluate(() => (window as DesktopWindow).electron.workspace.list())
    expect(afterDelete.some((item) => item.id === workspace.id)).toBe(false)
  } finally {
    await cleanupRendererFixtures(page, terminalId, workspaceId)
    await closeApplication(application)
    if (fixtureRoot) {
      await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
})
