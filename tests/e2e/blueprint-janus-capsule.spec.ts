import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { WorkspaceAPI } from '../../src/shared/ipc/workspace'

type TestWindow = Window & { electron: { workspace: WorkspaceAPI } }

test('JanusX capsule opens blueprint conversation without resizing the canvas', async () => {
  const entry = resolve('out/main/index.js')
  let root = ''
  let application: ElectronApplication | undefined

  try {
    await access(entry)
    root = await mkdtemp(join(tmpdir(), 'janusx-blueprint-capsule-'))
    const userDataDir = join(root, 'user-data')
    const workspacePath = join(root, 'workspace')
    await Promise.all([mkdir(userDataDir, { recursive: true }), mkdir(workspacePath, { recursive: true })])

    application = await electron.launch({
      args: [entry, `--user-data-dir=${userDataDir}`],
      env: { ...process.env, ELECTRON_RENDERER_URL: '', NODE_ENV: 'production' },
    })
    const page = await application.firstWindow({ timeout: 30_000 })
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.evaluate(
      (path) => (window as TestWindow).electron.workspace.create({ name: 'Blueprint UI fixture', path }),
      workspacePath,
    )
    await page.reload()
    await page.getByRole('button', { name: /Open Blueprint Workbench/ }).click()
    await expect(page.getByRole('button', { name: /新建/ })).toBeVisible()

    await page.getByRole('button', { name: /新建/ }).click()
    const createDialog = page.getByRole('dialog', { name: '新建蓝图' })
    await createDialog.locator('input').fill('JanusX Capsule Fixture')
    await createDialog.locator('input').press('Enter')

    const capsule = page.getByRole('button', { name: /打开 JanusX 蓝图对话/ })
    await expect(capsule).toBeEnabled()
    await expect(capsule).toContainText('JanusX')
    await expect(capsule).toContainText('待命')
    await expect(capsule.locator('.janus-identity-eye')).toHaveCount(2)
    const canvasWidthBefore = (await page.locator('.blueprint-view--workbench').boundingBox())?.width

    await capsule.click()
    await expect(capsule).toHaveAttribute('aria-expanded', 'true')
    const conversation = page.getByRole('complementary', { name: 'Janus 蓝图维护' })
    await expect(conversation).toBeVisible()
    await expect(page.getByText('蓝图维护对话', { exact: true })).toBeVisible()
    const conversationBoxBeforeDetail = await conversation.boundingBox()

    await page.locator('.react-flow__node').first().dblclick()
    const nodeDetail = page.locator('.bp-node-detail')
    await expect(nodeDetail).toBeVisible()
    const canvasWidthAfter = (await page.locator('.blueprint-view--workbench').boundingBox())?.width
    expect(canvasWidthBefore).toBeDefined()
    expect(Math.abs((canvasWidthAfter ?? 0) - (canvasWidthBefore ?? 0))).toBeLessThanOrEqual(1)
    const conversationBox = await conversation.boundingBox()
    const detailBox = await nodeDetail.boundingBox()
    expect(conversationBoxBeforeDetail).not.toBeNull()
    expect(conversationBox).not.toBeNull()
    expect(detailBox).not.toBeNull()
    expect(Math.abs(conversationBox!.x - conversationBoxBeforeDetail!.x)).toBeLessThanOrEqual(1)
    expect(detailBox!.x + detailBox!.width).toBeLessThanOrEqual(conversationBox!.x)

    await page.screenshot({ path: test.info().outputPath('blueprint-janus-capsule.png') })
    await capsule.click()
    await expect(capsule).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('complementary', { name: 'Janus 蓝图维护' })).toHaveCount(0)
  } finally {
    if (application) await application.close().catch(() => undefined)
    if (root) await rm(root, { recursive: true, force: true })
  }
})
