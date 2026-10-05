import { test, expect, type Page } from '@playwright/test'

async function select(page: Page, name: string) {
  await page.getByRole('button', { name: '切换工作区', exact: true }).click()
  await page.getByRole('option', { name: new RegExp(name) }).click()
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  await page.goto('/project.html?workbench&bootstrap')
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.locator('.blueprint-workbench-shell').evaluate(element =>
    element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity && animation.playState === 'running').length,
  )).toBe(0)
})

test('shows every workspace and initializes only after preview confirmation, with undo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: '切换工作区', exact: true }).click()
  await expect(page.getByRole('option')).toHaveCount(5)
  await page.getByRole('option', { name: /Checkout B/ }).click()
  await expect(page.getByRole('button', { name: '初始化蓝图', exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.getByRole('button', { name: '初始化蓝图', exact: true }).click()
  await expect(page.locator('.blueprint-workspace-preview')).toContainText('lifecycle: draft')
  expect(await page.evaluate(() => (window as any).bootstrapFixture.applies)).toEqual([])
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '初始化蓝图', exact: true }).click()
  await page.getByRole('button', { name: '确认初始化', exact: true }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  expect(await page.evaluate(() => (window as any).bootstrapFixture.applies)).toEqual(['C:/fixture-b'])
  await page.getByRole('button', { name: '撤销初始化', exact: true }).click()
  await expect(page.getByRole('button', { name: '初始化蓝图', exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('keeps invalid and unreadable workspaces selectable and exposes their diagnostics', async ({ page }) => {
  await select(page, 'Invalid project')
  await expect(page.locator('.blueprint-workspace-empty')).toContainText('Missing Note identity')
  await expect(page.getByRole('button', { name: '初始化蓝图', exact: true })).toHaveCount(0)
  await select(page, 'Unreadable project')
  await expect(page.locator('.blueprint-workspace-empty')).toContainText('Read denied')
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await select(page, 'Project ·')
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
})

test('draft action sends a read-only proposal request to the selected workspace conversation', async ({ page }) => {
  await select(page, 'Empty project')
  await page.getByRole('button', { name: '让 Janus 起草蓝图', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).projectFixture.streams.length)).toBe(1)
  const request = await page.evaluate(() => (window as any).projectFixture.streams[0])
  expect(request.workspaceResources[0].workspaceId).toBe('ws-empty')
  expect(JSON.stringify(request.messages)).toContain('不要创建、修改或写入任何文件')
  expect(await page.evaluate(() => (window as any).bootstrapFixture.applies)).toEqual([])
})

test('all workspaces remain switchable when none has a blueprint', async ({ page }) => {
  await page.goto('/project.html?workbench&bootstrap&all-empty')
  await expect(page.getByRole('button', { name: '初始化蓝图', exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.blueprint-workbench-shell').evaluate(element =>
    element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity && animation.playState === 'running').length,
  )).toBe(0)
  await select(page, 'Checkout B')
  await expect(page.locator('.blueprint-workspace-empty h2')).toHaveText('Checkout B')
  await expect(page.getByRole('button', { name: '初始化蓝图', exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
})
