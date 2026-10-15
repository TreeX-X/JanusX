import { expect, test } from '@playwright/test'

test('return restores folded chapters together with the reading position', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/blueprint-architecture.html?v2&attention')
  await page.evaluate(() => {
    const api = (window as any).electron.harness, read = api.noteRead
    api.noteRead = async (...args: any[]) => {
      const source = await read(...args)
      if (args[1].endsWith('00000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) {
        const paragraphs = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}. A recoverable failure.`).join('\n\n')
        const body = `# Document\n\n## Goal\n\n${paragraphs}\n\n## Details\n\n${paragraphs}`
        return { ...source, raw: body, doc: { ...source.doc, body }, view: { ...source.view, headings: [
          { depth: 1, text: 'Document', anchor: 'document', line: 1 },
          { depth: 2, text: 'Goal', anchor: 'goal', line: 3 },
          { depth: 2, text: 'Details', anchor: 'details', line: body.split('\n').findIndex(line => line === '## Details') + 1 },
        ] } }
      }
      return source
    }
  })
  const updates = page.locator('.bp-attention__triggers button').first()
  await updates.click()
  await page.getByRole('dialog', { name: '更新', exact: true }).getByRole('button', { name: /Deep parsing document/ }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.getByRole('button', { name: '关闭列表' }).click()
  const chapter = page.locator('.bp-note-chapter').first(), scroller = page.locator('.bp-node-detail__scroll')
  await chapter.locator('summary').click()
  await expect(chapter).not.toHaveAttribute('open')
  await scroller.evaluate(el => { el.scrollTop = 200 })
  await updates.click()
  await page.getByRole('dialog', { name: '更新', exact: true }).getByRole('button', { name: /Root decision/ }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.getByRole('button', { name: '关闭列表' }).click()
  await page.getByRole('navigation', { name: '模块导航' }).getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Deep parsing document')
  await expect(chapter).not.toHaveAttribute('open')
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(200)
})

test('index diagnostics appear in data sources only when a problem exists', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2')
  await page.getByRole('button', { name: /^数据来源/ }).click()
  const dialog = page.getByRole('dialog', { name: '数据来源' })
  await expect(dialog.getByRole('region', { name: '需要检查的问题' })).toBeVisible()
  const issue = dialog.locator('.bp-source-issue').filter({ hasText: 'FIXTURE_PARSE_DIAGNOSTIC' })
  await issue.locator('summary').click()
  await expect(issue).toContainText('Invalid historical document remains visible')
})

for (const workbench of [false, true]) test(`reader close position is stable with and without scrollbars (${workbench ? 'workbench' : 'embedded'})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/blueprint-architecture.html?v2&attention' + (workbench ? '&workbench' : ''))
  await page.locator('.bp-attention__triggers button').first().click()
  await page.getByRole('dialog', { name: '更新', exact: true }).getByRole('button', { name: /Deep parsing document/ }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.getByRole('button', { name: '关闭列表' }).click()
  const detail = page.locator('.bp-node-detail'), scroller = detail.locator('.bp-node-detail__scroll'), close = detail.locator('.bp-panel-close')
  const measure = () => close.evaluate(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y }))
  for (const theme of ['dark', 'planche']) {
    await page.evaluate(value => (window as any).architectureFixture.theme(value), theme)
    await page.getByRole('tab', { name: '正文', exact: true }).click()
    expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    const before = await measure()
    await scroller.evaluate(el => { el.scrollTop = 700 })
    expect(await measure()).toEqual(before)
    await page.getByRole('tab', { name: '关联笔记', exact: true }).click()
    await expect.poll(() => scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(false)
    expect(await measure()).toEqual(before)
    await page.getByRole('tab', { name: '正文', exact: true }).click()
    await page.locator('.bp-note-wiki__actions > summary').click()
    await page.getByRole('button', { name: '完整源文', exact: true }).click()
    expect(await measure()).toEqual(before)
    await page.locator('.bp-note-wiki__actions > summary').click()
    await page.getByRole('button', { name: '预览', exact: true }).click()
    await expect(detail.locator('.bp-node-detail__terminal-footer')).toHaveCount(0)
    await detail.screenshot({ path: `artifacts/blueprint-reader/${workbench ? 'workbench' : 'embedded'}-${theme}.png` })
  }
})
