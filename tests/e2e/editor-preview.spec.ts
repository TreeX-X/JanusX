import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/editor-preview.html')
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('editing is the default; opt-in HEAD comparison preserves edits and cursor', async ({ page }) => {
  expect(await page.evaluate(() => (window as any).previewHarness.baselineCalls)).toBe(0)
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
  await page.evaluate(() => (window as any).previewHarness.open('code.ts'))
  await expect(page.locator('.view-lines')).toContainText('value = 2')
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('// unsaved')
  const position = await page.evaluate(() => (window as any).previewHarness.editors()[0].getPosition())
  const compare = page.getByRole('button', { name: '与 HEAD 比较' })
  await compare.click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await compare.click()
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
  await expect(page.locator('.view-lines')).toContainText('// unsaved')
  expect(await page.evaluate(() => (window as any).previewHarness.editors()[0].getPosition())).toEqual(position)
  expect(await page.evaluate(() => (window as any).previewHarness.state().openFiles.find((file: any) => file.name === 'code.ts').isDirty)).toBe(true)
  await page.evaluate(() => (window as any).previewHarness.open('missing.ts', 'const newFile = true'))
  await compare.click()
  await expect(page.getByRole('status')).toContainText('没有可用的 HEAD 基线')
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
})

test('custom dialog supports cancel, failed-save retry, multiple files and discard', async ({ page }, testInfo) => {
  await page.evaluate(async () => {
    const h = (window as any).previewHarness
    const id = h.state().activeFileId
    h.state().updateContent(id, '# Changed')
    await h.open('code.ts')
    h.state().updateContent(h.state().activeFileId, '// Changed')
    h.failSave = true
  })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '是否保存更改？' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('li')).toHaveCount(2)
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '保存并关闭' })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('save-dialog-dark.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => (window as any).previewHarness.closed)).toBe(0)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并关闭' }).click()
  await expect(dialog.getByRole('alert')).toContainText('无法保存')
  await page.evaluate(() => (window as any).previewHarness.setTheme('planche'))
  await page.screenshot({ path: testInfo.outputPath('save-dialog-light-error.png') })
  expect(await page.evaluate(() => (window as any).previewHarness.closed)).toBe(0)
  await page.evaluate(() => { (window as any).previewHarness.failSave = false })
  await dialog.getByRole('button', { name: '保存并关闭' }).click()
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => (window as any).previewHarness.saves.length)).toBe(2)
  await page.evaluate(() => {
    const h = (window as any).previewHarness
    h.state().updateContent(h.state().activeFileId, '// discard')
  })
  await page.getByRole('button', { name: '关闭 code.ts' }).click()
  await dialog.getByRole('button', { name: '不保存', exact: true }).click()
  await expect(page.locator('[data-editor-tab]')).toHaveCount(1)
})

test('Markdown follows source blocks, resizes, reaches the end and can disable sync', async ({ page }) => {
  const viewport = page.locator('.preview-scroll-viewport')
  await page.evaluate(() => {
    const editor = (window as any).previewHarness.editors().find((item: any) => item.getDomNode()?.closest('#root'))
    const block = document.querySelectorAll<HTMLElement>('[data-source-line]')[30]
    editor.setScrollTop(editor.getTopForLineNumber(Number(block.dataset.sourceLine)))
  })
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeGreaterThan(500)
  await expect.poll(() => page.locator('[data-source-line]').nth(30).evaluate(el => {
    const viewport = el.closest('.preview-scroll-viewport')!
    return Math.abs(el.getBoundingClientRect().top - viewport.getBoundingClientRect().top)
  })).toBeLessThan(4)
  await page.setViewportSize({ width: 960, height: 640 })
  await page.evaluate(() => {
    const editor = (window as any).previewHarness.editors()[0]
    editor.setScrollTop(editor.getScrollHeight())
  })
  await expect.poll(() => viewport.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(3)
  await page.getByRole('checkbox', { name: '同步滚动' }).uncheck()
  const before = await viewport.evaluate(el => el.scrollTop)
  await page.evaluate(() => (window as any).previewHarness.editors()[0].setScrollTop(0))
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('Section 0')
  expect(await viewport.evaluate(el => el.scrollTop)).toBeCloseTo(before, 0)
})
