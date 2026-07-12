import { expect, test, type Locator, type Page } from '@playwright/test'

async function pointer(locator: Locator, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', options: { x?: number; y?: number; button?: number; pointerId?: number; isPrimary?: boolean } = {}) {
  await locator.dispatchEvent(type, {
    bubbles: true,
    pointerType: 'mouse',
    pointerId: options.pointerId ?? 1,
    isPrimary: options.isPrimary ?? true,
    button: options.button ?? 0,
    clientX: options.x ?? 100,
    clientY: options.y ?? 20,
  })
}

async function tap(island: Locator, point = { x: 100, y: 20 }) {
  await pointer(island, 'pointerdown', point)
  await pointer(island, 'pointerup', point)
}

function harness(page: Page) {
  return page.getByTestId('harness')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.janus-island')).toBeVisible()
})

test('single activation shows only the empty Knowledge peek after confirmation', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-stage', 'peek', { timeout: 1_000 })
  await expect(harness(page)).toHaveAttribute('data-single-count', '1')
  await expect(page.getByText('No knowledge match')).toBeVisible()
})

test('second pointerdown activates expanded exactly once and cancels single activation', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island, { x: 100, y: 20 })
  await page.waitForTimeout(80)
  await pointer(island, 'pointerdown', { x: 108, y: 24, pointerId: 2 })

  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
  await pointer(island, 'pointerup', { x: 108, y: 24, pointerId: 2 })
  await page.waitForTimeout(500)
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '1')
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
})

test('double activation collapses expanded Island exactly once', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
  await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
  await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')

  await tap(island, { x: 110, y: 25 })
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 114, y: 27, pointerId: 3 })
  await pointer(island, 'pointerup', { x: 114, y: 27, pointerId: 3 })

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await page.waitForTimeout(500)
  await expect(harness(page)).toHaveAttribute('data-double-count', '2')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
})

test('cancelled and non-primary pointers do not activate Island', async ({ page }) => {
  const island = page.locator('.janus-island')
  await pointer(island, 'pointerdown')
  await pointer(island, 'pointercancel')
  await pointer(island, 'pointerdown', { pointerId: 2, isPrimary: false })
  await pointer(island, 'pointerup', { pointerId: 2, isPrimary: false })
  await pointer(island, 'pointerdown', { pointerId: 3, button: 2 })
  await pointer(island, 'pointerup', { pointerId: 3, button: 2 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('cancelled nonmatching second press clears the pending first tap', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 140, y: 22, pointerId: 2 })
  await pointer(island, 'pointercancel', { x: 140, y: 22, pointerId: 2 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('dragged nonmatching second press clears the pending first tap', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.waitForTimeout(50)
  await pointer(island, 'pointerdown', { x: 140, y: 22, pointerId: 2 })
  await pointer(island, 'pointermove', { x: 140, y: 50, pointerId: 2 })
  await pointer(island, 'pointercancel', { x: 140, y: 50, pointerId: 2 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('delayed single activation calls the latest callback identity', async ({ page }) => {
  const island = page.locator('.janus-island')
  await tap(island)
  await page.getByTestId('replace-single').click()

  await expect(harness(page)).toHaveAttribute('data-stage', 'peek', { timeout: 1_000 })
  await expect(harness(page)).toHaveAttribute('data-called-version', '2')
  await expect(harness(page)).toHaveAttribute('data-single-count', '1')
})

test('dragging does not leave a stale single activation', async ({ page }) => {
  const island = page.locator('.janus-island')
  await pointer(island, 'pointerdown', { x: 100, y: 20 })
  await pointer(island, 'pointermove', { x: 100, y: 100 })
  await pointer(island, 'pointerup', { x: 100, y: 100 })
  await page.waitForTimeout(500)

  await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
  await expect(harness(page)).toHaveAttribute('data-single-count', '0')
  await expect(harness(page)).toHaveAttribute('data-double-count', '0')
})

test('peek and expanded geometry stay inside desktop and compact viewports', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 720, height: 540 }]) {
    await page.setViewportSize(viewport)
    const island = page.locator('.janus-island')
    await tap(island)
    await expect(harness(page)).toHaveAttribute('data-stage', 'peek', { timeout: 1_000 })
    await expect(island).toBeInViewport()

    await tap(island)
    await expect(harness(page)).toHaveAttribute('data-stage', 'collapsed')
    await tap(island)
    await page.waitForTimeout(50)
    await pointer(island, 'pointerdown', { x: 104, y: 22, pointerId: 2 })
    await pointer(island, 'pointerup', { x: 104, y: 22, pointerId: 2 })
    await expect(harness(page)).toHaveAttribute('data-stage', 'expanded')
    await expect(island).toBeInViewport()

    const box = await island.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)

    await page.reload()
    await expect(page.locator('.janus-island')).toBeVisible()
  }
})
