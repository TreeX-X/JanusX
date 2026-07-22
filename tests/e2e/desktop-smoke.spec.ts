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
      writeFile(join(workspacePath, 'dock-file.txt'), 'dock fixture\n'),
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

    await page.setViewportSize({ width: 1200, height: 800 })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    const dock = page.locator('[aria-label="右侧工具 Dock"]')
    const rail = page.getByRole('toolbar', { name: '右侧工具' })
    const panelShell = page.getByTestId('right-tool-panel-shell')
    await expect(dock).toBeVisible()
    await expect(rail).toBeVisible()
    expect((await rail.boundingBox())?.width).toBe(48)
    expect((await page.locator('main').boundingBox())?.width).toBeGreaterThanOrEqual(320)

    const filesRailButton = page.getByRole('button', { name: /打开文件工具/ })
    if (
      !(await filesRailButton.getAttribute('aria-label'))?.includes('当前') ||
      await panelShell.isHidden()
    ) {
      await filesRailButton.click()
    }
    await expect(filesRailButton).toHaveAttribute('aria-label', /当前/)
    await expect(panelShell).toBeVisible()
    const filesPanel = page.locator('#right-tool-panel-files')
    const fileExplorerContent = filesPanel.getByTestId('file-explorer-content')
    await expect(filesPanel).toHaveAttribute('aria-hidden', 'false')
    await expect(fileExplorerContent).toBeVisible()
    const originalFilesPanel = await filesPanel.elementHandle()
    await filesRailButton.click()
    await expect(panelShell).toBeHidden()
    expect(await originalFilesPanel?.evaluate((element) => element.isConnected)).toBe(true)
    await filesRailButton.click()
    await expect(panelShell).toBeVisible()

    await fileExplorerContent.click({ button: 'right', position: { x: 16, y: 16 } })
    await expect(page.getByRole('button', { name: '新建文件', exact: true })).toBeVisible()
    await filesRailButton.click()
    await expect(panelShell).toBeHidden()
    await expect(page.getByRole('button', { name: '新建文件', exact: true })).toHaveCount(0)
    expect(await originalFilesPanel?.evaluate((element) => element.isConnected)).toBe(true)
    await filesRailButton.click()
    await expect(panelShell).toBeVisible()

    await expect(filesPanel).toHaveAttribute('aria-hidden', 'false')
    await expect(fileExplorerContent).toBeVisible()
    await fileExplorerContent.click({ button: 'right', position: { x: 16, y: 16 } })
    await expect(page.getByRole('button', { name: '新建文件', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /打开 Git 工具/ }).click()
    await expect(page.getByRole('button', { name: '新建文件', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Push', exact: true }).click()
    await expect(page.getByRole('button', { name: '取消', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /打开文件工具/ }).evaluate((element: HTMLElement) => element.click())
    await expect(page.getByRole('button', { name: '取消', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: '关闭 Git' }).click()
    await page.getByRole('button', { name: '关闭 文件' }).click()
    expect(await originalFilesPanel?.evaluate((element) => element.isConnected)).toBe(false)
    await expect(panelShell).toBeHidden()
    await expect(rail).toBeVisible()
    await page.getByRole('button', { name: /打开文件工具，已关闭/ }).click()
    await expect(panelShell).toBeVisible()

    const separator = page.getByRole('separator', { name: '调整右侧工具面板宽度' })
    await separator.focus()
    await separator.press('Home')
    await expect(separator).toHaveAttribute('aria-valuenow', '240')
    await separator.press('End')
    const maximumWidth = Number(await separator.getAttribute('aria-valuemax'))
    expect(Number(await separator.getAttribute('aria-valuenow'))).toBe(maximumWidth)
    const separatorBox = await separator.boundingBox()
    if (!separatorBox) throw new Error('Right Dock separator has no layout box')
    await page.mouse.move(separatorBox.x + separatorBox.width / 2, separatorBox.y + 40)
    await page.mouse.down()
    await page.mouse.move(separatorBox.x - 24, separatorBox.y + 40)
    await page.mouse.up()
    expect(await page.evaluate(() => ({ cursor: document.body.style.cursor, userSelect: document.body.style.userSelect }))).toEqual({ cursor: '', userSelect: '' })

    await page.setViewportSize({ width: 680, height: 800 })
    await expect(panelShell).toBeHidden()
    await expect(rail).toBeVisible()
    await page.getByRole('button', { name: /打开文件工具，当前/ }).click()
    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(panelShell).toBeVisible()
    expect((await page.locator('main').boundingBox())?.width).toBeGreaterThanOrEqual(320)

    await page.getByTitle('收起侧栏').click()
    await expect(rail).toBeVisible()
    expect((await page.locator('main').boundingBox())?.width).toBeGreaterThanOrEqual(320)
    await page.locator('main').getByText('Shell', { exact: true }).click()
    const terminalInput = page.locator('.xterm-helper-textarea').first()
    await expect(terminalInput).toBeAttached({ timeout: 15_000 })
    const terminalScreen = page.locator('.xterm-screen').first()
    await expect(terminalScreen).toBeVisible()
    const terminalBox = await terminalScreen.boundingBox()
    const centerBox = await page.locator('main').boundingBox()
    expect(terminalBox?.width).toBeGreaterThan(0)
    expect(terminalBox?.width).toBeLessThanOrEqual(centerBox?.width ?? 0)
    await terminalInput.focus()
    await terminalInput.pressSequentially('echo JANUSX_DOCK_FIT')
    await terminalInput.press('Enter')
    await expect(page.locator('.xterm-rows')).toContainText('JANUSX_DOCK_FIT', { timeout: 10_000 })

    const terminalTabs = page.locator('main button[draggable="true"]')
    await expect(terminalTabs).toHaveCount(1)
    const firstTerminalView = terminalScreen.locator('xpath=ancestor::*[@aria-hidden][1]')
    const firstTerminalElement = await terminalScreen.elementHandle()
    if (!firstTerminalElement) throw new Error('First terminal did not expose an xterm screen')

    await page.locator('main').getByRole('button', { name: 'New Terminal', exact: true }).click()
    await page.locator('main').getByRole('button', { name: 'New Shell terminal', exact: true }).click()
    await expect(terminalTabs).toHaveCount(2, { timeout: 15_000 })
    await expect(page.locator('.xterm-screen')).toHaveCount(2, { timeout: 15_000 })
    await expect(firstTerminalView).toHaveAttribute('aria-hidden', 'true')
    expect(await firstTerminalElement.evaluate((element) => element.isConnected)).toBe(true)

    const secondTerminalInput = page.locator('.xterm-helper-textarea').nth(1)
    const secondTerminalScreen = page.locator('.xterm-screen').nth(1)
    await expect(secondTerminalScreen).toBeVisible()
    await secondTerminalInput.focus()
    await secondTerminalInput.pressSequentially('echo JANUSX_SECOND_TAB')
    await secondTerminalInput.press('Enter')
    await expect(page.locator('.xterm-rows').nth(1)).toContainText('JANUSX_SECOND_TAB', { timeout: 10_000 })

    await terminalTabs.first().click()
    await expect(firstTerminalView).toHaveAttribute('aria-hidden', 'false')
    await expect(terminalScreen).toBeVisible()
    await expect(secondTerminalScreen).toBeHidden()
    expect(await firstTerminalElement.evaluate((element) => element.isConnected)).toBe(true)
    const recoveredTerminalBox = await terminalScreen.boundingBox()
    expect(recoveredTerminalBox?.width).toBeGreaterThan(0)
    expect(recoveredTerminalBox?.height).toBeGreaterThan(0)
    await expect(page.locator('.xterm-rows').first()).toContainText('JANUSX_DOCK_FIT')
    await terminalInput.focus()
    await terminalInput.pressSequentially('echo JANUSX_TAB_RECOVERED')
    await terminalInput.press('Enter')
    await expect(page.locator('.xterm-rows').first()).toContainText('JANUSX_TAB_RECOVERED', { timeout: 10_000 })

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
