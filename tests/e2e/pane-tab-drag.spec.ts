import { expect, test, type Page } from '@playwright/test'

const tab = (page: Page, id: string) => page.locator(`[data-tab-id="${id}"]`)
const state = (page: Page) => page.evaluate(() => (window as any).paneFixture.state())
const pageErrors = new WeakMap<Page, string[]>()
async function point(page: Page, selector: string, x = .5, y = .5) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`Missing box: ${selector}`)
  return { x: box.x + box.width * x, y: box.y + box.height * y }
}
async function start(page: Page, id: string) {
  const pos = await point(page, `[data-tab-id="${id}"]`, .4)
  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()
  await page.mouse.move(pos.x + 8, pos.y)
  await expect(page.locator('[data-tab-drag-clone]')).toHaveCount(1)
  return pos
}
async function move(page: Page, pos: { x: number; y: number }) {
  await page.mouse.move(pos.x, pos.y, { steps: 8 })
}
async function clean(page: Page) {
  await expect(page.locator('[data-tab-drag-clone]')).toHaveCount(0)
  await expect.poll(async () => (await state(page)).active).toBe(false)
  expect(await page.locator('body').evaluate((body) => body.style.cursor)).toBe('')
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  await page.goto('/pane-tabs.html')
  await expect(tab(page, 'terminal:a')).toBeVisible()
  await expect(tab(page, 'browser:d')).toBeVisible()
  expect(errors).toEqual([])
})

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([])
})

test('reorders both ways with stable preview and preserves mounted terminal content', async ({ page }) => {
  const last = await point(page, '[data-tab-id="terminal:c"]', .8)
  const screen = await page.locator('.xterm-screen').first().elementHandle()
  await start(page, 'terminal:a')
  await move(page, last)
  await expect(tab(page, 'terminal:b')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -144, 0)')
  const slot = page.locator('[data-tab-strip="left"] [data-tab-drag-slot]')
  const before = await slot.boundingBox()
  // Let the give-way animation finish without moving the pointer.
  await page.waitForTimeout(220)
  expect(await slot.boundingBox()).toEqual(before)
  await test.info().attach('tab-reorder-preview', { body: await page.screenshot(), contentType: 'image/png' })
  expect((await state(page)).panes[0].tabs).toEqual(['terminal:a', 'terminal:b', 'terminal:c'])
  await page.mouse.up()
  await clean(page)
  expect((await state(page)).panes[0].tabs).toEqual(['terminal:b', 'terminal:c', 'terminal:a'])
  expect(await screen?.evaluate((element) => element.isConnected)).toBe(true)
  const first = await point(page, '[data-tab-id="terminal:b"]', .1)
  await start(page, 'terminal:a')
  await move(page, first)
  await page.mouse.up()
  expect((await state(page)).panes[0].tabs).toEqual(['terminal:a', 'terminal:b', 'terminal:c'])
  expect((await state(page)).focusedTab).toBe('terminal:a')
  expect((await state(page)).kills).toBe(0)
  expect((await state(page)).creates).toBe(0)
})

test('inserts across panes and restores browser bounds after dragging', async ({ page }) => {
  await expect.poll(async () => (await state(page)).bounds.d?.width ?? 0).toBeGreaterThan(0)
  const destination = await point(page, '[data-tab-id="browser:d"]', .1)
  await start(page, 'terminal:b')
  await expect.poll(async () => (await state(page)).bounds.d?.width).toBe(0)
  await move(page, destination)
  await page.mouse.up()
  await clean(page)
  expect((await state(page)).panes[1].tabs).toEqual(['terminal:b', 'browser:d', 'browser:e'])
  await tab(page, 'browser:d').click()
  await expect.poll(async () => (await state(page)).bounds.d?.width ?? 0).toBeGreaterThan(0)
  const left = await point(page, '[data-tab-id="terminal:a"]', .1)
  await start(page, 'browser:d')
  await move(page, left)
  await page.mouse.up()
  expect((await state(page)).panes[0].tabs[0]).toBe('browser:d')
  expect((await state(page)).focusedTab).toBe('browser:d')
})

for (const zone of ['left', 'right', 'top', 'bottom', 'center'] as const) {
  test(`canvas ${zone} commits the previewed merge or equal split`, async ({ page }) => {
    const destination = await point(page, '[data-pane-id="right"]', zone === 'left' ? .03 : zone === 'right' ? .97 : .5, zone === 'top' ? .12 : zone === 'bottom' ? .97 : .5)
    await start(page, 'terminal:b')
    await move(page, destination)
    await expect(page.locator('[data-tab-drag-hint]')).toHaveAttribute('data-zone', zone)
    await page.mouse.up()
    await clean(page)
    const result = await state(page)
    expect(result.panes).toHaveLength(zone === 'center' ? 2 : 3)
    if (zone === 'center') expect(result.panes[1].tabs).toEqual(['browser:d', 'browser:e', 'terminal:b'])
    else {
      expect(result.tree.second.ratio).toBe(.5)
      expect(result.tree.second.direction).toBe(zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical')
    }
    expect(result.focusedTab).toBe('terminal:b')
    expect(result.kills).toBe(0)
    expect(result.creates).toBe(0)
  })
}

test('click threshold, unchanged drop, close control and Escape have distinct outcomes', async ({ page }) => {
  const pos = await point(page, '[data-tab-id="terminal:b"]', .4)
  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()
  await page.mouse.move(pos.x + 2, pos.y)
  await expect(page.locator('[data-tab-drag-clone]')).toHaveCount(0)
  await page.mouse.up()
  expect((await state(page)).focusedTab).toBe('terminal:b')
  await start(page, 'terminal:a')
  await page.mouse.up()
  expect((await state(page)).focusedTab).toBe('terminal:a')
  await start(page, 'terminal:c')
  await page.keyboard.press('Escape')
  await clean(page)
  await page.mouse.up()
  expect((await state(page)).focusedTab).toBe('terminal:a')
  expect((await state(page)).panes[0].tabs).toEqual(['terminal:a', 'terminal:b', 'terminal:c'])
  const close = page.locator('[data-tab-id="browser:e"] [data-tab-close]')
  await close.click()
  expect((await state(page)).panes[1].tabs).toEqual(['browser:d'])
  await clean(page)
})

for (const reason of ['outside', 'blur', 'pointercancel', 'workspace', 'removed'] as const) {
  test(`cleans up on ${reason} without committing a move`, async ({ page }) => {
    await start(page, 'terminal:a')
    await move(page, await point(page, '[data-tab-id="browser:d"]'))
    if (reason === 'outside') { await move(page, { x: 10, y: 10 }); await page.mouse.up() }
    else if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else if (reason === 'pointercancel') await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
    else if (reason === 'workspace') await page.evaluate(() => (window as any).paneFixture.switchWorkspace())
    else await page.evaluate(() => (window as any).paneFixture.removeSource())
    await clean(page)
    await page.mouse.up()
    const result = await state(page)
    if (reason !== 'workspace') expect(result.panes[1].tabs).toEqual(['browser:d', 'browser:e'])
    expect(result.kills).toBe(0)
    expect(result.creates).toBe(0)
  })
}

test('scrolls an overflowing strip with a stationary pointer and appends precisely', async ({ page }) => {
  await page.goto('/pane-tabs.html?overflow')
  await expect(tab(page, 'terminal:a')).toBeVisible()
  const strip = page.locator('[data-tab-strip="right"]')
  const destination = await point(page, '[data-tab-strip="right"]', .995)
  await start(page, 'terminal:a')
  await move(page, destination)
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft), { timeout: 8000 }).toBeGreaterThan(550)
  await page.mouse.up()
  expect((await state(page)).panes[1].tabs.at(-1)).toBe('terminal:a')
  await clean(page)
})

test('keeps native sidebar terminal insertion available', async ({ page }) => {
  const destination = tab(page, 'browser:d')
  await page.locator('[data-sidebar-terminal]').dragTo(destination, { targetPosition: { x: 10, y: 16 } })
  expect((await state(page)).panes[1].tabs[0]).toBe('terminal:sidebar')
  expect((await state(page)).creates).toBe(0)
})

test('moving the final tab prunes its source pane without losing content', async ({ page }) => {
  for (const id of ['browser:e', 'browser:d']) {
    const destination = await point(page, '[data-tab-id="terminal:a"]', .1)
    await start(page, id)
    await move(page, destination)
    await page.mouse.up()
    await clean(page)
  }
  const result = await state(page)
  expect(result.panes).toHaveLength(1)
  expect(result.panes[0].tabs).toEqual(['browser:e', 'browser:d', 'terminal:a', 'terminal:b', 'terminal:c'])
  expect(result.focusedTab).toBe('browser:d')
  expect(result.kills).toBe(0)
  expect(result.creates).toBe(0)
})

test('keeps the grab point and canvas hint aligned inside the transformed workspace', async ({ page }) => {
  await page.goto('/pane-tabs.html?transformed')
  const source = tab(page, 'terminal:a')
  await expect(source).toBeVisible()
  const box = (await source.boundingBox())!
  const origin = await start(page, 'terminal:a')
  const grab = { x: origin.x - box.x, y: origin.y - box.y }
  const clone = page.locator('[data-tab-drag-clone]')
  const aligned = async (pointer: { x: number; y: number }) => {
    await expect.poll(async () => {
      const rect = (await clone.boundingBox())!
      return Math.max(Math.abs(rect.x + grab.x - pointer.x), Math.abs(rect.y + grab.y - pointer.y))
    }).toBeLessThan(1)
  }
  await aligned({ x: origin.x + 8, y: origin.y })
  const destination = await point(page, '[data-pane-id="right"]', .97, .5)
  await move(page, destination)
  await aligned(destination)
  const pane = (await page.locator('[data-pane-id="right"]').boundingBox())!
  const hint = page.locator('[data-tab-drag-hint]')
  await expect(hint).toHaveAttribute('data-zone', 'right')
  await expect.poll(async () => {
    const rect = (await hint.boundingBox())!
    return Math.max(Math.abs(rect.x - pane.x - pane.width / 2), Math.abs(rect.y - pane.y), Math.abs(rect.width - pane.width / 2), Math.abs(rect.height - pane.height))
  }).toBeLessThan(1)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await clean(page)
  await expect(page.locator('[data-tab-drag-overlay]')).toHaveCount(0)
})
