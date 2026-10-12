import { expect, test } from '@playwright/test'

test('acknowledges listed updates while cached or incomplete, including after a sync error', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  const updates = page.locator('.bp-attention__triggers button').first()
  await expect(updates).toHaveText('更新 3')
  await page.evaluate(async () => {
    const f = (window as any).attentionFixture
    f.view.sourcesPending = true; f.view.sourceComplete = false; f.view.updates.complete = false
    await f.refresh(); f.failSync(true); await f.refresh()
  })
  await updates.click()
  const dialog = page.getByRole('dialog', { name: '更新', exact: true })
  await dialog.locator('.bp-attention-panel__menu > summary').click()
  const mark = dialog.getByRole('button', { name: '将当前 3 篇标为已读', exact: true })
  await expect(mark).toBeEnabled()
  await mark.click()
  await expect(updates).toHaveText('更新 0')
  await expect(dialog.locator('article[data-read="true"]')).toHaveCount(3)
  expect(await page.evaluate(() => (window as any).attentionFixture.calls.mark[0].versions.length)).toBe(3)
  await dialog.getByRole('button', { name: '撤销已读', exact: true }).click()
  await expect(updates).toHaveText('更新 3')
})

test('retains discovery counts and list rows through sync errors and ordinary node selection', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  const updates = page.locator('.bp-attention__triggers button').first()
  const suggestions = page.locator('.bp-attention__triggers button').nth(1)
  await expect(updates).toHaveText('更新 3')
  await expect(suggestions).toHaveText('有建议 1')
  await page.evaluate(async () => { const f = (window as any).attentionFixture; f.failSync(true); await f.refresh() })
  await expect(updates).toHaveText('更新 3')
  await expect(suggestions).toHaveText('有建议 1')
  await updates.click()
  const dialog = page.getByRole('dialog', { name: '更新', exact: true })
  await expect(dialog.locator('article')).toHaveCount(3)
  await expect(dialog).toContainText('Source temporarily unavailable')
  await page.keyboard.press('Escape')
  const visibleCards = await page.locator('.react-flow__node').evaluateAll(nodes => nodes.filter(node => {
    const box = node.getBoundingClientRect(), canvas = node.closest('.react-flow')!.getBoundingClientRect()
    return box.width > 0 && box.x >= canvas.x && box.y >= canvas.y && box.right <= canvas.right && box.bottom <= canvas.bottom
  }).map(node => node.getAttribute('data-id')!).slice(0, 2))
  expect(visibleCards.length).toBe(2)
  const reads = await page.evaluate(() => (window as any).attentionFixture.calls.read)
  for (const id of visibleCards) {
    await page.locator(`.react-flow__node[data-id="${id}"]`).click()
    await expect(page.locator('.bp-node-detail')).toBeVisible()
    await expect(updates).not.toContainText('…')
    await expect(updates).not.toContainText('加载中')
    await expect(suggestions).toHaveText('有建议 1')
  }
  expect(await page.evaluate(() => (window as any).attentionFixture.calls.read)).toBe(reads)
})

test('all attention lists stay within the viewport and scroll their Note rows', async ({ page }) => {
  await page.setViewportSize({ width: 920, height: 620 })
  await page.goto('/blueprint-architecture.html?v2&attention')
  const triggers = [page.locator('.bp-attention__triggers button').nth(0),
    page.locator('.bp-attention__triggers button').nth(1), page.locator('.blueprint-review-activity[role="button"]')]
  for (const trigger of triggers) {
    await trigger.click()
    const dialog = page.getByRole('dialog')
    const sizes = await dialog.evaluate(panel => {
      const list = panel.querySelector<HTMLElement>('.bp-attention-panel__list')!
      for (let index = 0; index < 30; index++) {
        const row = document.createElement('article')
        row.textContent = `Additional Note ${index + 1}`
        list.append(row)
      }
      list.scrollTop = list.scrollHeight
      return { panelHeight: panel.getBoundingClientRect().height, panelBottom: panel.getBoundingClientRect().bottom,
        listHeight: list.clientHeight, contentHeight: list.scrollHeight, scrollTop: list.scrollTop }
    })
    expect(sizes.panelHeight).toBeLessThanOrEqual(481)
    expect(sizes.panelBottom).toBeLessThanOrEqual(621)
    expect(sizes.contentHeight).toBeGreaterThan(sizes.listHeight)
    expect(sizes.scrollTop).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('fast review targets navigate before the full Note review view arrives', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  await page.evaluate(() => (window as any).attentionFixture.holdReview())
  await page.getByRole('button', { name: '自动审核详情', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '自动审核详情', exact: true })
  await dialog.getByRole('button', { name: /Root decision/ }).click()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Root decision')
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.evaluate(() => (window as any).attentionFixture.releaseReview())
  await expect(page.locator('.bp-note-review__failure')).toContainText('Generation request timed out')
})

test('narrow canvas keeps the focused Note fully visible at a readable distance', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 520 })
  await page.goto('/blueprint-architecture.html?v2&attention')
  await page.locator('.bp-attention__triggers button').first().click()
  await page.getByRole('dialog', { name: '更新', exact: true }).getByRole('button', { name: /Deep parsing document/ }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  const geometry = await page.locator('.react-flow__node.bp-navigation-focused').evaluate(node => {
    const card = node.getBoundingClientRect()
    const canvas = node.closest('.react-flow')!.getBoundingClientRect()
    return { dx: (card.left + card.right - canvas.left - canvas.right) / 2,
      dy: (card.top + card.bottom - canvas.top - canvas.bottom) / 2,
      widthRatio: card.width / canvas.width, heightRatio: card.height / canvas.height }
  })
  expect(Math.abs(geometry.dx)).toBeLessThan(4)
  expect(Math.abs(geometry.dy)).toBeLessThan(4)
  expect(geometry.widthRatio).toBeLessThanOrEqual(.73)
  expect(geometry.heightRatio).toBeLessThanOrEqual(.66)
})

for (const workbench of [false, true]) test(`updates navigate smoothly, acknowledge once and keep suggestions independent (${workbench ? 'workbench' : 'embedded'})`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/blueprint-architecture.html?v2&attention' + (workbench ? '&workbench' : ''))
  const updates = page.locator('.bp-attention__triggers button').first()
  await expect(updates).toHaveText('更新 3')
  await page.evaluate(() => (window as any).attentionFixture.delay(600))
  await updates.click()
  const dialog = page.getByRole('dialog', { name: '更新', exact: true })
  await page.evaluate(() => {
    const samples: string[] = []; (window as any).navigationSamples = samples
    const started = performance.now()
    const sample = () => { samples.push(document.querySelector('.react-flow__viewport')?.getAttribute('style') ?? ''); if (performance.now() - started < 1100) requestAnimationFrame(sample) }
    requestAnimationFrame(sample)
  })
  await dialog.getByRole('button', { name: /Deep parsing document/ }).click()
  await expect(page.locator('.bp-navigation-status')).toContainText('正在打开并聚焦')
  await expect(page.locator('.bp-note-loading')).toBeVisible()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Deep parsing document')
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await expect(page.locator('.bp-navigation-focused')).toBeVisible()
  expect(await page.evaluate(() => new Set((window as any).navigationSamples).size)).toBeGreaterThan(3)
  const focus = await page.locator('.react-flow__node.bp-navigation-focused').evaluate(node => {
    const card = node.getBoundingClientRect()
    const canvas = node.closest('.react-flow')!.getBoundingClientRect()
    const viewport = node.closest('.react-flow')!.querySelector('.react-flow__viewport')!
    return { dx: (card.left + card.right - canvas.left - canvas.right) / 2,
      dy: (card.top + card.bottom - canvas.top - canvas.bottom) / 2,
      widthRatio: card.width / canvas.width, heightRatio: card.height / canvas.height,
      zoom: new DOMMatrix(getComputedStyle(viewport).transform).a }
  })
  expect(Math.abs(focus.dx)).toBeLessThan(4)
  expect(Math.abs(focus.dy)).toBeLessThan(4)
  expect(focus.widthRatio).toBeLessThanOrEqual(.73)
  expect(focus.heightRatio).toBeLessThanOrEqual(.66)
  expect(focus.zoom).toBeGreaterThan(.7)
  expect(focus.zoom).toBeLessThanOrEqual(1.1)
  await page.screenshot({ path: test.info().outputPath('attention-light-focus.png'), fullPage: true })
  await page.evaluate(() => (window as any).architectureFixture.theme('dark'))
  await page.screenshot({ path: test.info().outputPath('attention-dark.png'), fullPage: true })
  await expect(updates).toHaveText('更新 2')
  await expect(dialog.getByRole('button', { name: /Deep parsing document/ }).locator('..')).toContainText('已读')
  expect(await page.evaluate(() => (window as any).attentionFixture.calls.run)).toBe(0)
  await page.getByRole('button', { name: '关闭列表' }).click()
  await page.getByRole('button', { name: '自动审核详情', exact: true }).click()
  const automatic = page.getByRole('dialog', { name: '自动审核详情', exact: true })
  await expect(automatic.getByRole('button', { name: '需要重试 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await automatic.getByRole('button', { name: '审核完成 1', exact: true }).click()
  await expect(automatic.locator('article')).toHaveCount(1)
  await expect(automatic.locator('[data-group="completed"]')).toContainText('Deep parsing document')
  await expect(automatic.getByRole('button', { name: 'Recovery rule is missing', exact: true })).toHaveCount(0)
  await automatic.getByRole('button', { name: /Deep parsing document/ }).click()
  await expect(page.locator('.bp-note-review__toggle')).toHaveAttribute('aria-expanded', 'true')
  await automatic.getByRole('button', { name: '需要重试 2', exact: true }).click()
  await automatic.getByRole('button', { name: /Root decision/ }).click()
  await expect(page.locator('.bp-note-review__failure')).toContainText('Generation request timed out')
  await automatic.getByRole('button', { name: /Child note/ }).click()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Child note')
  await expect(page.locator('.bp-note-review__coverage')).toContainText('Referenced recovery file could not be read from this commit.')
  await expect(page.locator('.bp-note-review__coverage')).toContainText('手动恢复')
  await expect(updates).toHaveText('更新 2')
  expect(await page.evaluate(() => (window as any).attentionFixture.calls)).toMatchObject({ run: 0, close: 0 })
  expect(errors).toEqual([])
})

test('failed navigation retries without losing unread state; return restores reading position', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  const updates = page.locator('.bp-attention__triggers button').first()
  await expect(updates).toHaveText('更新 3')
  await page.evaluate(() => (window as any).attentionFixture.fail(true))
  await updates.click()
  await page.getByRole('dialog', { name: '更新', exact: true }).getByRole('button', { name: /Deep parsing document/ }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'failed')
  await expect(updates).toHaveText('更新 3')
  await page.getByRole('button', { name: '关闭列表' }).click()
  await page.evaluate(() => { (window as any).attentionFixture.fail(false); (window as any).attentionFixture.delay(500) })
  await page.locator('.bp-note-warning').getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await expect(updates).toHaveText('更新 2')
  const detail = page.locator('.bp-node-detail__scroll')
  await detail.evaluate(el => { el.scrollTo({ top: 650, behavior: 'instant' }) })
  await expect.poll(() => detail.evaluate(el => Math.round(el.scrollTop))).toBe(650)
  await updates.click()
  await page.getByRole('dialog', { name: '更新', exact: true }).getByRole('button', { name: /Root decision/ }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.getByRole('button', { name: '关闭列表' }).click()
  await page.getByRole('navigation', { name: '模块导航' }).getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Deep parsing document')
  await expect.poll(() => detail.evaluate(el => Math.round(el.scrollTop))).toBe(650)
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('aria-busy', 'false')
})

test('ignores revision-only entries and updates an open retry list immediately after recovery', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  await page.evaluate(async () => {
    const fixture = (window as any).attentionFixture
    fixture.view.items.push({ noteId: fixture.other, reportRevision: 7, availability: 'available', error: 'Cached old failure', report: null })
    fixture.view.items.push({ noteId: 'never-reviewed', reportRevision: 8, availability: 'available', error: null, report: null })
    await fixture.refresh()
  })
  await page.getByRole('button', { name: '自动审核详情', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '自动审核详情', exact: true })
  await expect(dialog.locator('article')).toHaveCount(2)
  await expect(dialog).not.toContainText('never-reviewed')
  await dialog.getByRole('button', { name: /Root decision/ }).click()
  await expect(page.locator('.bp-note-review__failure')).toContainText('Generation request timed out')
  // A fresh scheduler result overrides the cached suggestion-store error before the full read returns.
  await page.evaluate(async () => {
    const fixture = (window as any).attentionFixture
    const target = fixture.view.automatic.targets.find((target: any) => target.noteId === fixture.other)
    target.state = 'reviewed'; target.reportRevision = 8; delete target.error
    fixture.view.activityRevision++
    await fixture.enabled(false)
    await fixture.refresh()
  })
  await expect(dialog.getByRole('button', { name: '需要重试 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: /Root decision/ })).toHaveCount(0)
  await dialog.getByRole('button', { name: '审核完成 2', exact: true }).click()
  await expect(dialog.getByRole('button', { name: /Root decision/ })).toContainText('审核完成')
  await expect(dialog).not.toContainText('Cached old failure')
  await expect(page.locator('.bp-note-review__failure')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).attentionFixture.calls.run)).toBe(0)
})

for (const workbench of [false, true]) test(`suggestion actions align right with theme hover and keyboard feedback (${workbench ? 'workbench' : 'embedded'})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/blueprint-architecture.html?v2&attention' + (workbench ? '&workbench' : ''))
  await page.locator('.bp-attention__triggers button').nth(1).click()
  await page.getByRole('dialog', { name: '有建议', exact: true }).getByRole('button', { name: 'Recovery rule is missing', exact: true }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.getByRole('button', { name: '关闭列表' }).click()
  const actions = page.locator('.bp-note-review__actions'), handled = actions.getByRole('button', { name: '已处理', exact: true })
  await expect(handled).toBeVisible()
  for (const theme of ['dark', 'planche']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    await page.mouse.move(0, 0)
    const before = await handled.evaluate(node => getComputedStyle(node).backgroundColor)
    await handled.hover()
    await expect.poll(() => handled.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(before)
    const row = await actions.boundingBox(), last = await actions.getByRole('button', { name: '不采纳', exact: true }).boundingBox()
    expect(Math.abs(row!.x + row!.width - last!.x - last!.width)).toBeLessThan(2)
    await handled.focus()
    await page.keyboard.press('Tab')
    const declined = actions.getByRole('button', { name: '不采纳', exact: true })
    await expect(declined).toBeFocused()
    expect(await declined.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none')
    await page.locator('.bp-node-detail').screenshot({ path: test.info().outputPath('suggestion-actions-' + theme + '.png') })
    await declined.blur()
  }
})

test('suggestions collapse on ordinary visits and only compact navigation stays sticky', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  await page.locator('.bp-attention__triggers button').first().click()
  await page.getByRole('dialog', { name: '更新', exact: true }).getByRole('button', { name: /Deep parsing document/ }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.getByRole('button', { name: '关闭列表' }).click()
  const toggle = page.locator('.bp-note-review__toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.bp-note-review__content')).toBeHidden()
  const detail = page.locator('.bp-node-detail__scroll')
  const before = await detail.evaluate(el => ({ heading: el.querySelector('.bp-note-review__heading')!.getBoundingClientRect().top,
    body: el.querySelector('.markdown-preview')!.getBoundingClientRect().top }))
  expect(before.heading).toBeLessThan(before.body)
  await detail.evaluate(el => el.scrollTo({ top: 650, behavior: 'instant' }))
  await expect.poll(() => detail.evaluate(el => {
    const toolbar = el.querySelector('.bp-note-wiki__toolbar')!.getBoundingClientRect()
    return Math.abs(toolbar.top - el.getBoundingClientRect().top)
  })).toBeLessThan(2)
  expect(await detail.locator('.bp-note-review__heading').evaluate(el => getComputedStyle(el).position)).not.toBe('sticky')
  await expect(page.locator('.bp-note-review-shortcut')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('suggestions-sticky.png'), fullPage: true })
  await page.locator('.bp-note-review-shortcut').click()
  await expect(page.locator('.bp-note-review__content')).toBeVisible()
  await toggle.click()
  await page.locator('.bp-attention__triggers button').nth(1).click()
  await page.getByRole('dialog', { name: '有建议', exact: true }).getByRole('button', { name: 'Recovery rule is missing', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('details[data-finding-id]')).toHaveAttribute('open', '')
  await expect(page.locator('details[data-finding-id] > summary')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('suggestions-open.png'), fullPage: true })
  await page.getByRole('button', { name: '关闭列表' }).click()
  await page.getByRole('button', { name: '自动审核详情', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Root decision/ }).click()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Root decision')
  await page.getByRole('button', { name: '关闭列表' }).click()
  await page.getByRole('navigation', { name: '模块导航' }).getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Deep parsing document')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('details[data-finding-id]')).toHaveAttribute('open', '')
})

test('bulk read is filtered, undoable, stable and does not clear new content', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  const updates = page.locator('.bp-attention__triggers button').first()
  await expect(updates).toHaveText('更新 3'); await updates.click()
  const dialog = page.getByRole('dialog', { name: '更新', exact: true })
  await dialog.getByRole('textbox', { name: '查找 Note' }).fill('Child')
  await dialog.locator('summary').click()
  await dialog.getByRole('button', { name: '将当前 1 篇标为已读' }).click()
  await expect(updates).toHaveText('更新 2')
  await expect(dialog.getByRole('button', { name: /Child note/ }).locator('..')).toContainText('已读')
  await dialog.getByRole('button', { name: '撤销已读' }).click()
  await expect(updates).toHaveText('更新 3')
  await dialog.getByRole('button', { name: '将当前 1 篇标为已读' }).click()
  await page.evaluate(() => { const fixture = (window as any).attentionFixture; return fixture.update(fixture.child) })
  await expect(updates).toHaveText('更新 3')
  await dialog.getByRole('textbox', { name: '查找 Note' }).fill('')
  await dialog.getByRole('button', { name: '将当前 3 篇标为已读' }).click()
  await expect(updates).toHaveText('更新 0')
  const bulk = await page.evaluate(() => (window as any).attentionFixture.calls.mark.at(-1))
  expect(bulk.bulk).toBe(true)
  expect(bulk.versions).toHaveLength(3)
  expect(bulk.versions.every((version: Record<string, unknown>) => Object.keys(version).sort().join(',') === 'hash,noteId,path')).toBe(true)
})

test('rapid navigation cancels stale reads and reduced motion reaches the final target', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/blueprint-architecture.html?v2&attention')
  await page.locator('.bp-attention__triggers button').first().click()
  const dialog = page.getByRole('dialog', { name: '更新', exact: true })
  await page.evaluate(() => (window as any).attentionFixture.delay(700))
  await dialog.getByRole('button', { name: /Deep parsing document/ }).click()
  await dialog.getByRole('button', { name: /Root decision/ }).click()
  await expect(page.locator('.bp-node-detail__title')).toHaveText('Root decision')
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  const marked = await page.evaluate(() => (window as any).attentionFixture.calls.mark.flatMap((call: any) => call.versions.map((version: any) => version.noteId)))
  expect(marked).toEqual(['00000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
  await expect(page.locator('.bp-attention__triggers button').first()).toHaveText('更新 2')
})


test('explicit mark-read updates the counter without another body request', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  await page.locator('.bp-attention__triggers button').nth(1).click()
  await page.getByRole('dialog').getByRole('button', { name: /Deep parsing document/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  const read = page.getByRole('button', { name: '查看当前正文 · 标为已读', exact: true })
  await expect(read).toBeVisible()
  await page.evaluate(() => {
    const w = window as any; w.unexpectedReads = 0
    w.electron.harness.noteRead = async () => { w.unexpectedReads++; throw Error('Unexpected body reread') }
  })
  await read.click()
  await expect(page.locator('.bp-attention__triggers button').first()).toHaveText('更新 2')
  expect(await page.evaluate(() => (window as any).unexpectedReads)).toBe(0)
})

test('workbench gives more width to reading while keeping the side-track total', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.goto('/blueprint-architecture.html?v2&attention&workbench')
  await page.locator('.bp-attention__triggers button').nth(1).click()
  await page.getByRole('dialog').getByRole('button', { name: /Deep parsing document/ }).click()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('.blueprint-workbench-body').evaluate(element => {
    const tracks = getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat)
    return [tracks[0], tracks[2]]
  })).toEqual([360, 360])
})

for (const workbench of [false, true]) test(`suggestion handoff opens Janus with a moving card and visible loading (${workbench ? 'workbench' : 'embedded'})`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/blueprint-architecture.html?v2&attention&focus&repair' + (workbench ? '&workbench' : ''))
  await page.evaluate(() => { const w = window as any; w.electron.blueprintReview.repairPrepare = (input: unknown) => { w.repairInput = input; return new Promise((_resolve, reject) => { w.rejectRepair = () => reject(new Error('Fixture version changed')) }) } })
  await page.locator('.bp-attention__triggers button').nth(1).click()
  const issue = page.locator('.bp-attention-panel article').filter({ hasText: 'Recovery rule is missing' })
  await issue.getByRole('button', { name: /修复本篇/ }).click()
  await expect(page.locator('.bp-maintenance-panel')).toBeVisible()
  await expect(page.locator('.bp-note-repair--flying')).toBeVisible()
  const card = page.locator('section.bp-note-repair')
  await expect(card).toContainText('Recovery rule is missing')
  await expect(card).toContainText('准备交接')
  await expect(card).toHaveAttribute('aria-busy', 'true')
  const geometry = await card.evaluate(element => {
    const card = element.getBoundingClientRect(), canvas = document.querySelector('.blueprint-canvas-wrapper')!.getBoundingClientRect()
    return { right: card.x > canvas.x + canvas.width / 2, top: card.y - canvas.y }
  })
  expect(geometry.right).toBe(true); expect(geometry.top).toBeLessThan(100)
  expect(await page.evaluate(() => (window as any).repairInput)).toMatchObject({ kind: 'suggestions', intent: 'repair', reportRevision: 1, findingIds: ['99999999-1111-4111-8111-111111111111'] })
  await expect(page.locator('.bp-note-repair--flying')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/note-repair/' + (workbench ? 'workbench-loading.png' : 'embedded-loading.png') })
  await page.evaluate(() => (window as any).rejectRepair())
  await expect(card).toContainText('Fixture version changed')
  await expect(page.locator('.bp-attention__triggers button').nth(1)).toHaveText('有建议 1')
  expect(errors).toEqual([])
})


test('committed re-review synchronizes count, node and detail while an older list read is delayed', async ({ page }) => {
  await page.goto('/blueprint-architecture.html?v2&attention')
  const suggestions = page.locator('.bp-attention__triggers button').nth(1)
  await expect(suggestions).toHaveText('有建议 1')
  await suggestions.click()
  await page.getByRole('dialog', { name: '有建议', exact: true }).getByRole('button', { name: 'Recovery rule is missing', exact: true }).click()
  await expect(page.locator('.blueprint-canvas-main')).toHaveAttribute('data-navigation', 'ready')
  await page.getByRole('button', { name: '关闭列表' }).click()
  const dot = page.locator('.bp-navigation-focused .bp-node-card__dot')
  await expect(dot).toHaveCount(1)
  await expect(page.locator('.bp-note-review__finding')).toHaveCount(1)
  await page.evaluate(() => (window as any).attentionFixture.holdOldRead())
  await page.evaluate(() => (window as any).attentionFixture.writeRepair())
  await expect(page.locator('.bp-node-detail .markdown-preview')).toContainText('Repaired recovery checkpoint')
  // Writing alone does not count as a successful independent re-review.
  await expect(suggestions).toHaveText('有建议 1')
  await expect(dot).toHaveCount(1)
  await page.evaluate(() => (window as any).attentionFixture.publishReview())
  await expect(suggestions).toHaveText('有建议 0')
  await expect(dot).toHaveCount(0)
  await expect(page.locator('.bp-note-review__finding')).toHaveCount(0)
  await page.evaluate(() => (window as any).attentionFixture.releaseReview())
  await expect(suggestions).toHaveText('有建议 0')
  await expect(dot).toHaveCount(0)
  await expect(page.locator('.bp-note-review__finding')).toHaveCount(0)
  await expect(page.locator('.bp-node-detail .markdown-preview')).toContainText('Repaired recovery checkpoint')
})
