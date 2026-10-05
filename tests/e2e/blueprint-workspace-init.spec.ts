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

test('keeps failures actionable and shows technical details only on request', async ({ page }) => {
  await select(page, 'Invalid project')
  await expect(page.getByText('Missing Note identity', { exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: '初始化蓝图', exact: true })).toHaveCount(0)
  await page.getByText('查看诊断详情', { exact: true }).click()
  await expect(page.getByText('Missing Note identity', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开文件', exact: true })).toBeVisible()
  await select(page, 'Unreadable project')
  await expect(page.getByText('Read denied', { exact: true })).not.toBeVisible()
  await page.getByText('查看诊断详情', { exact: true }).click()
  await expect(page.getByText('Read denied', { exact: true })).toBeVisible()
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
  await expect(page.locator('.blueprint-workspace-name')).toHaveText('Checkout B')
  await expect(page.getByRole('button', { name: '初始化蓝图', exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
})

test('loading a healthy workspace never exposes its cross-repository diagnostics', async ({ page }) => {
  await select(page, 'Checkout B')
  await page.evaluate(() => {
    const originalStatus = window.electron.harness.workspaceStatus
    const originalLoad = window.electron.janus.loadBlueprint
    window.electron.harness.workspaceStatus = async (...args) => ({ ...await originalStatus(...args), diagnostics: [{
      code: 'NOT_READY', message: 'note://local/note: repository not bound in this index: external-repo',
    }] })
    window.electron.janus.loadBlueprint = async (...args) => {
      await new Promise<void>(resolve => { (window as any).resumeBlueprintLoad = resolve })
      return originalLoad(...args)
    }
  })
  await select(page, 'Project ·')
  await expect(page.getByText('正在读取工作区蓝图…', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => typeof (window as any).resumeBlueprintLoad)).toBe('function')
  await expect(page.getByText(/repository not bound/)).not.toBeVisible()
  await expect(page.getByRole('button', { name: '适应画布', exact: true })).toHaveCount(0)
  await expect(page.getByText('保存中…', { exact: true })).toHaveCount(0)
  await page.evaluate(() => (window as any).resumeBlueprintLoad())
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect(page.getByText(/repository not bound/)).not.toBeVisible()
  await expect(page.getByRole('button', { name: '适应画布', exact: true })).toBeVisible()
})

for (const width of [1280, 900]) {
  test(`initialization stays readable and operable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 })
    if (width === 900) await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
    await select(page, 'Checkout B')
    const panel = page.locator('.blueprint-workspace-empty')
    const initialize = page.getByRole('button', { name: '初始化蓝图', exact: true })
    await expect(page.locator('.blueprint-workbench-toolbar')).toHaveCount(0)
    await expect(panel.getByRole('heading', { name: '为项目创建蓝图' })).toBeVisible()
    await expect(initialize).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath('workspace-empty.png') })
    await initialize.click()
    const preview = page.locator('.blueprint-workspace-preview')
    await expect(preview.getByRole('button', { name: '确认初始化', exact: true })).toBeInViewport()
    await preview.getByText('.agents/notes/project.md', { exact: true }).click()
    await expect(preview.locator('pre').filter({ hasText: 'lifecycle: draft' })).toBeVisible()
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('workspace-preview.png') })
    await preview.getByRole('button', { name: '取消', exact: true }).click()
    await expect(initialize).toBeFocused()
  })
}

test('foreign-file confirmation remains required and failed actions keep details collapsed', async ({ page }) => {
  await select(page, 'Checkout B')
  await page.evaluate(() => {
    const originalPreview = window.electron.harness.initPreview
    window.electron.harness.initPreview = async (...args) => ({ ...await originalPreview(...args), foreign: true })
    window.electron.harness.initApply = async () => { throw new Error('EACCES: access denied, open C:/fixture-b/.agents/harness.json') }
  })
  await page.getByRole('button', { name: '初始化蓝图', exact: true }).click()
  const confirm = page.getByRole('button', { name: '确认初始化', exact: true })
  await expect(confirm).toBeDisabled()
  await page.getByRole('checkbox').check()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByRole('alert')).toHaveText('操作未完成，请查看详情后重试。')
  await expect(page.getByText(/EACCES:/)).not.toBeVisible()
  await page.getByText('查看诊断详情', { exact: true }).click()
  await expect(page.getByText(/EACCES:/)).toBeVisible()
  await expect(page.locator('.blueprint-workspace-preview')).toBeVisible()
  expect(await page.evaluate(() => (window as any).bootstrapFixture.applies)).toEqual([])
})

test('uninitialized workspaces keep chat usable without loading Note change history', async ({ page }) => {
  await page.evaluate(() => {
    ;(window as any).historyReads = []
    window.electron.harness.noteChatChanges = async (cwd: string) => {
      ;(window as any).historyReads.push(cwd)
      if (cwd === 'C:/fixture-b') throw new Error("Error invoking remote method 'harness:note:chat-changes': [object Object]")
      return []
    }
  })
  await select(page, 'Checkout B')
  const chat = page.locator('.blueprint-workbench-janus-slot')
  await expect(chat.locator('textarea')).toBeVisible()
  await chat.locator('textarea').fill('分析这个项目，不要修改文件')
  await chat.locator('textarea').press('Enter')
  await expect.poll(() => page.evaluate(() => (window as any).projectFixture.streams.length)).toBe(1)
  await expect(chat.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).historyReads)).not.toContain('C:/fixture-b')
  await page.evaluate(() => (window as any).projectFixture.finishStream())
  // The same panel must start reading history as soon as initialization succeeds.
  await page.evaluate(() => {
    window.electron.harness.noteChatChanges = async (cwd: string) => {
      ;(window as any).historyReads.push(cwd)
      return []
    }
  })
  await page.getByRole('button', { name: '初始化蓝图', exact: true }).click()
  await page.getByRole('button', { name: '确认初始化', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).historyReads)).toContain('C:/fixture-b')
})

test('history failures use compact copy, expandable diagnostics and a working retry', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    window.electron.harness.noteChatChanges = async () => {
      throw new Error("Error invoking remote method 'harness:note:chat-changes': EACCES: cannot read history")
    }
  })
  await select(page, 'Empty project')
  const chat = page.locator('.blueprint-workbench-janus-slot')
  const notice = chat.getByText('修改记录暂时无法加载，你仍可继续对话。', { exact: true })
  await expect(notice).toBeVisible()
  expect(await notice.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(12)
  await expect(chat.getByText(/Error invoking remote method/)).not.toBeVisible()
  await expect(chat.locator('textarea')).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('history-unavailable.png') })
  await chat.getByText('查看诊断详情', { exact: true }).click()
  await expect(chat.getByText(/EACCES: cannot read history/)).toBeVisible()
  await page.evaluate(() => { window.electron.harness.noteChatChanges = async () => [] })
  await chat.getByRole('button', { name: '重新加载记录', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await expect(chat.getByText(/Error invoking remote method/)).toHaveCount(0)
})

test('a late history failure cannot follow the user into another workspace', async ({ page }) => {
  await page.evaluate(() => {
    window.electron.harness.noteChatChanges = async () => new Promise((_, reject) => {
      ;(window as any).rejectHistory = () => reject(new Error('Late history failure'))
    })
  })
  await select(page, 'Empty project')
  await expect.poll(() => page.evaluate(() => typeof (window as any).rejectHistory)).toBe('function')
  await select(page, 'Checkout B')
  await page.evaluate(() => (window as any).rejectHistory())
  const chat = page.locator('.blueprint-workbench-janus-slot')
  await expect(chat.getByText(/Late history failure|修改记录暂时无法加载/)).toHaveCount(0)
  await expect(chat.locator('textarea')).toBeVisible()
})
