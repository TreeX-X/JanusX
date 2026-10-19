import { expect, test } from '@playwright/test'

for (const theme of ['planche', 'dark']) {
  test(`pane selection slides independently with immediate content activation in ${theme}`, async ({ page }) => {
    await page.goto(`/pane-tabs.html?theme=${theme}`)
    const left = page.locator('[data-pane-id="left"]')
    const right = page.locator('[data-pane-id="right"]')
    const marker = left.getByTestId('pane-tab-indicator')
    await expect(marker).toBeVisible()
    const initialX = (await marker.boundingBox())!.x
    const rightX = (await right.getByTestId('pane-tab-indicator').boundingBox())!.x
    const screen = await left.locator('.xterm-screen').first().elementHandle()
    const next = left.locator('[data-tab-id="terminal:c"]')
    // Read the store in the same JS task as the click: terminal selection has
    // no timer, even though its selection backdrop animates.
    expect(await next.evaluate((element) => {
      (element as HTMLElement).click()
      return (window as any).paneFixture.state().panes[0].active
    })).toBe('terminal:c')
    await expect(next).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await marker.boundingBox())!.x).toBeGreaterThan(initialX)
    await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - (await next.boundingBox())!.x)).toBeLessThan(0.5)
    expect((await right.getByTestId('pane-tab-indicator').boundingBox())!.x).toBe(rightX)
    expect(await screen?.evaluate((element) => element.isConnected)).toBe(true)
    await right.locator('[data-tab-id="browser:e"]').click()
    await expect(left.locator('[data-tab-id="terminal:c"]')).toHaveAttribute('aria-pressed', 'true')
    const state = await page.evaluate(() => (window as any).paneFixture.state())
    expect(state.kills).toBe(0)
    expect(state.creates).toBe(0)
    await page.screenshot({ path: test.info().outputPath(`pane-feedback-${theme}.png`) })
  })
}

test('pane marker follows scrolling, hides during dragging, and restores after cancellation', async ({ page }) => {
  await page.goto('/pane-tabs.html?overflow')
  const strip = page.locator('[data-tab-strip="left"]')
  const marker = strip.getByTestId('pane-tab-indicator')
  const tab = strip.locator('[data-tab-id="terminal:c"]')
  await tab.dispatchEvent('click')
  await strip.evaluate((element) => { element.scrollLeft = 200 })
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - (await tab.boundingBox())!.x)).toBeLessThan(0.5)
  const box = (await tab.boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 16)
  await page.mouse.down()
  await page.mouse.move(box.x + 50, box.y + 16)
  await expect(page.locator('[data-tab-drag-clone]')).toHaveCount(1)
  await expect(marker).toBeHidden()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(marker).toBeVisible()
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - (await tab.boundingBox())!.x)).toBeLessThan(0.5)
})

test('pane keyboard selection is immediate with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/pane-tabs.html')
  const tab = page.locator('[data-tab-id="terminal:b"]')
  await tab.focus()
  await page.keyboard.press('Enter')
  await expect(tab).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-pane-id="left"]').getByTestId('pane-tab-indicator')).toHaveCSS('transition-duration', '0s')
})
