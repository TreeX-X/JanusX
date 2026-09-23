import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { WorkspaceAPI } from '../../src/shared/ipc/workspace'
import { createDesktopTestEnv } from './desktop-test-env'

type TestWindow = Window & { electron: { workspace: WorkspaceAPI; system: { setLanguage(language: string): Promise<void> } } }

test('JanusX capsule keeps detail, canvas, and conversation as independent cards', async () => {
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
      env: createDesktopTestEnv(root),
    })
    const page = await application.firstWindow({ timeout: 30_000 })
    await page.evaluate(() => (window as TestWindow).electron.system.setLanguage('zh-CN'))
    const settleWorkbench = () => page.locator('.blueprint-workbench-shell').evaluate(async (element) => {
      const animations = element.getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
    })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.evaluate(
      (path) => (window as TestWindow).electron.workspace.create({ name: 'Blueprint UI fixture', path }),
      workspacePath,
    )
    await page.reload()
    await expect(page.getByRole('button', { name: /打开蓝图工作台|Open Blueprint Workbench/ })).toBeVisible()
    await page.getByRole('button', { name: /打开蓝图工作台|Open Blueprint Workbench/ }).click()
    const workbenchShell = page.locator('.blueprint-workbench-shell')
    const workbenchShellBox = await workbenchShell.boundingBox()
    expect(workbenchShellBox).not.toBeNull()
    expect(workbenchShellBox!.width).toBeGreaterThan(1_500)
    expect(workbenchShellBox!.height).toBeGreaterThan(900)

    await page.setViewportSize({ width: 1280, height: 820 })
    await expect(page.getByRole('button', { name: /新建/ })).toBeVisible()

    await page.getByRole('button', { name: /新建/ }).click()
    const createDialog = page.getByRole('dialog', { name: '新建蓝图' })
    await createDialog.locator('input').fill('JanusX Capsule Fixture')
    await createDialog.locator('input').press('Enter')

    const canvasCard = page.locator('.blueprint-workbench-card--canvas')
    const viewport = canvasCard.locator('.react-flow__pane')
    const initialNode = canvasCard.locator('.react-flow__node').first()
    await expect(initialNode).toBeVisible()
    await expect(canvasCard.locator('.blueprint-canvas-main')).toHaveAttribute('data-graph-ready', 'true')
    await expect(initialNode).toHaveClass(/bp-flow-node--enter/)
    const [viewportBox, initialNodeBox] = await Promise.all([viewport.boundingBox(), initialNode.boundingBox()])
    expect(viewportBox).not.toBeNull()
    expect(initialNodeBox).not.toBeNull()
    expect(initialNodeBox!.x + initialNodeBox!.width).toBeGreaterThan(viewportBox!.x)
    expect(initialNodeBox!.x).toBeLessThan(viewportBox!.x + viewportBox!.width)
    expect(initialNodeBox!.y + initialNodeBox!.height).toBeGreaterThan(viewportBox!.y)
    expect(initialNodeBox!.y).toBeLessThan(viewportBox!.y + viewportBox!.height)

    const capsule = page.getByRole('button', { name: /打开 Janus Copilot 控制台/ })
    await expect(capsule).toBeEnabled()
    await expect(capsule).toContainText('JANUS // COPILOT')
    await expect(capsule).toContainText('IDLE')
    await expect(capsule.locator('.janus-identity-eye')).toHaveCount(2)
    const canvasWidthBefore = (await page.locator('.blueprint-view--workbench').boundingBox())?.width

    if (await capsule.getAttribute('aria-expanded') === 'false') await capsule.click()
    await expect(capsule).toHaveAttribute('aria-expanded', 'true')
    const conversation = page.getByRole('complementary', { name: 'Janus Copilot 控制台' })
    await expect(conversation).toBeVisible()
    await expect(page.getByText(/^(COPILOT CONTROL|COPILOT 控制台)$/)).toBeVisible()
    const conversationBoxBeforeDetail = await conversation.boundingBox()

    await page.locator('.react-flow__node').first().dblclick()
    const nodeDetail = page.locator('.blueprint-workbench-detail-slot > .bp-node-detail')
    await expect(nodeDetail).toBeVisible()
    await settleWorkbench()
    const canvasWidthAfter = (await page.locator('.blueprint-view--workbench').boundingBox())?.width
    expect(canvasWidthBefore).toBeDefined()
    expect(canvasWidthAfter).toBeLessThan(canvasWidthBefore!)
    expect(conversationBoxBeforeDetail).not.toBeNull()
    // Visibility precedes the grid-track transition; check the settled layout.
    await expect(async () => {
      const conversationBox = await conversation.boundingBox()
      const canvasBox = await canvasCard.boundingBox()
      const detailBox = await nodeDetail.boundingBox()
      expect(conversationBox).not.toBeNull()
      expect(canvasBox).not.toBeNull()
      expect(detailBox).not.toBeNull()
      expect(detailBox!.x + detailBox!.width).toBeLessThan(canvasBox!.x)
      expect(canvasBox!.x + canvasBox!.width).toBeLessThan(conversationBox!.x)
    }).toPass({ timeout: 5_000 })

    const staggerMetadata = await page.locator('.blueprint-workbench-shell').evaluate((element) => ({
      cardCount: getComputedStyle(element).getPropertyValue('--card-count').trim(),
      cardIndexes: [
        ...element.querySelectorAll<HTMLElement>('.blueprint-workbench-topbar, .blueprint-workbench-detail-slot, .blueprint-workbench-card'),
      ].map((card) => card.style.getPropertyValue('--card-index')),
    }))
    expect(staggerMetadata.cardCount).toBe('4')
    expect(staggerMetadata.cardIndexes).toEqual(['0', '1', '2', '3'])

    await page.screenshot({ path: test.info().outputPath('blueprint-janus-capsule.png') })
    await page.setViewportSize({ width: 1024, height: 820 })
    // 统一操作栏横跨三列之上（复刻 design toolbar）；画布内旧栏与节点操作组已收敛。
    const workbenchToolbar = page.locator('.blueprint-workbench-toolbar')
    const search = workbenchToolbar.locator('.blueprint-toolbar__search')
    await expect(search).toBeVisible()
    await expect(workbenchToolbar.getByRole('group', { name: /节点操作/ })).toHaveCount(0)
    await expect(canvasCard.locator('.blueprint-toolbar--canvas')).toHaveCount(0)
    await settleWorkbench()
    const shellBox = await workbenchShell.boundingBox()
    const [searchBox] = await Promise.all([
      search.boundingBox(),
    ])
    expect(shellBox).not.toBeNull()
    expect(searchBox).not.toBeNull()
    expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(shellBox!.x + shellBox!.width)

    const focusControls = workbenchToolbar.locator('.blueprint-toolbar__search-wrap, .blueprint-select')
    const focusControlBoxes = await focusControls.evaluateAll((elements) =>
      elements.map((element) => {
        const { bottom, left, right, top } = element.getBoundingClientRect()
        return { bottom, left, right, top }
      }),
    )
    for (const box of focusControlBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(shellBox!.x)
      expect(box.right).toBeLessThanOrEqual(shellBox!.x + shellBox!.width)
    }
    for (let index = 0; index < focusControlBoxes.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < focusControlBoxes.length; nextIndex += 1) {
        const current = focusControlBoxes[index]
        const next = focusControlBoxes[nextIndex]
        const overlaps = current.left < next.right && current.right > next.left && current.top < next.bottom && current.bottom > next.top
        expect(overlaps).toBe(false)
      }
    }

    // 统一栏三按钮：适应画布 / 重放加载 / 在对话中变更，不溢出 shell。
    const toolbarActions = workbenchToolbar.locator('.blueprint-btn')
    await expect(toolbarActions).toHaveCount(3)
    const toolbarActionBoxes = await toolbarActions.evaluateAll((elements) =>
      elements.map((element) => {
        const { bottom, left, right, top } = element.getBoundingClientRect()
        return { bottom, left, right, top }
      })
    )
    for (const box of toolbarActionBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(shellBox!.x)
      expect(box.right).toBeLessThanOrEqual(shellBox!.x + shellBox!.width)
    }
    for (let index = 0; index < toolbarActionBoxes.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < toolbarActionBoxes.length; nextIndex += 1) {
        const current = toolbarActionBoxes[index]
        const next = toolbarActionBoxes[nextIndex]
        const overlaps = current.left < next.right && current.right > next.left && current.top < next.bottom && current.bottom > next.top
        expect(overlaps).toBe(false)
      }
    }

    const shell = page.locator('.blueprint-workbench-shell')
    await shell.evaluate((element) => { element.style.width = '420px' })
    const capsuleName = capsule.locator('.blueprint-janus-capsule__name')
    await expect(capsuleName).toBeHidden()
    await settleWorkbench()
    const [topbarBox, switchBox, actionBox] = await Promise.all([
      page.locator('.blueprint-workbench-topbar').boundingBox(),
      page.locator('.blueprint-workbench-switch').boundingBox(),
      page.locator('.blueprint-workbench-actions').boundingBox(),
    ])
    expect(topbarBox).not.toBeNull()
    expect(switchBox).not.toBeNull()
    expect(actionBox).not.toBeNull()
    expect(switchBox!.x).toBeGreaterThanOrEqual(topbarBox!.x)
    expect(switchBox!.x + switchBox!.width).toBeLessThanOrEqual(actionBox!.x)
    await shell.evaluate((element) => { element.style.removeProperty('width') })

    await capsule.click()
    await expect(capsule).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('complementary', { name: 'Janus Copilot 控制台' })).toHaveCount(0)
    const threeCardMetadata = await page.locator('.blueprint-workbench-shell').evaluate((element) => ({
      cardCount: element.getAttribute('data-card-count'),
      cardIndexes: [
        ...element.querySelectorAll<HTMLElement>('.blueprint-workbench-topbar, .blueprint-workbench-detail-slot[data-open="true"], .blueprint-workbench-card--canvas, .blueprint-workbench-janus-slot[data-visible="true"] .blueprint-workbench-card'),
      ].map((card) => card.style.getPropertyValue('--card-index')),
    }))
    expect(threeCardMetadata.cardCount).toBe('3')
    expect(threeCardMetadata.cardIndexes).toEqual(['0', '1', '2'])
    await page.locator('.blueprint-workbench-close').click()
    await expect(page.locator('.blueprint-workbench-shell')).toHaveAttribute('data-closing', 'true')
    await expect(page.locator('.blueprint-workbench-shell')).toHaveAttribute('data-card-count', '3')
    await expect.poll(async () => page.locator('.blueprint-workbench-card--canvas').evaluate((element) => getComputedStyle(element).animationName)).toBe('blueprint-workbench-card-descend')
    await expect(page.locator('.blueprint-workbench-shell')).toHaveCount(0)

    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.getByRole('button', { name: /打开知识库工作台|Open Knowledge Workbench/ }).click()
    const knowledgeShell = page.getByRole('region', { name: /知识引擎|Knowledge Engine/ })
    await expect(knowledgeShell).toBeVisible()
    const knowledgeShellBox = await knowledgeShell.boundingBox()
    expect(knowledgeShellBox).not.toBeNull()
    expect(knowledgeShellBox!.width).toBeGreaterThan(1_500)
    expect(knowledgeShellBox!.height).toBeGreaterThan(900)
  } finally {
    if (application) await application.close().catch(() => undefined)
    if (root) await rm(root, { recursive: true, force: true })
  }
})
