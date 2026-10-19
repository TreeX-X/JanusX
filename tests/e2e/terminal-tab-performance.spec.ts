import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

test('measure warm tab switching with twenty populated terminal buffers', async ({ page }) => {
  await page.goto('/pane-tabs.html?single&performance')
  await expect(page.locator('.xterm-screen')).toHaveCount(20)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.buffersReady())).toBe(true)
  await page.waitForTimeout(400)
  const result = await page.evaluate(async () => {
    const fixture = (window as any).paneFixture
    const screen = document.querySelector('.xterm-screen')!
    fixture.resetMetrics()
    const presentationMs: number[] = []
    for (let i = 0; i < 12; i++) {
      const start = performance.now()
      document.querySelector<HTMLElement>(`[data-tab-id="terminal:${i % 2 ? 'a' : 'b'}"]`)!.click()
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      presentationMs.push(performance.now() - start)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return { ...fixture.metrics(), presentationMs, retained: screen.isConnected }
  })
  await test.info().attach('terminal-tab-work.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  await mkdir(test.info().outputPath(), { recursive: true })
  await writeFile(test.info().outputPath('terminal-tab-work.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ fits: result.fits, refreshes: result.refreshes, resizes: result.resizes, replays: result.replays,
    reactActualMs: result.renderWork.reduce((sum: number, value: number) => sum + value, 0) }))
  expect(result.replays).toBe(0)
  expect(result.resizes).toBe(0)
  expect(result.retained).toBe(true)
  if (!process.env.JANUSX_PERF_BASELINE) {
    // Same-size activation reuses the measured viewport instead of refitting
    // it twice on each click. Real geometry changes remain covered separately.
    expect(result.fits).toBe(0)
    expect(result.refreshes).toBeLessThanOrEqual(12)
  }
})

test('warm activation preserves scrollback and receives output while hidden', async ({ page }) => {
  await page.goto('/pane-tabs.html?single&performance')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.buffersReady())).toBe(true)
  const screen = page.locator('.cli-terminal').first().locator('.xterm-screen')
  const slider = page.locator('.cli-terminal').first().locator('.scrollbar.vertical .slider')
  const thumb = (await slider.boundingBox())!
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y - 100, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => {
    const state = (window as any).paneFixture.terminalState('a')
    return state.viewportY < state.baseY
  })).toBe(true)
  const topLine = await page.evaluate(() => (window as any).paneFixture.terminalState('a').viewportY)
  await page.locator('[data-tab-id="terminal:b"]').click()
  await page.evaluate(() => (window as any).paneFixture.output('a', '\r\nHIDDEN OUTPUT\r\n'))
  await page.locator('[data-tab-id="terminal:a"]').click()
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.terminalState('a').viewportY)).toBe(topLine)
  expect(await page.evaluate(() => (window as any).paneFixture.terminalState('a').connected)).toBe(true)
  const currentThumb = (await slider.boundingBox())!
  const track = (await page.locator('.cli-terminal').first().locator('.scrollbar.vertical').boundingBox())!
  await page.mouse.move(currentThumb.x + currentThumb.width / 2, currentThumb.y + currentThumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(currentThumb.x + currentThumb.width / 2, track.y + track.height - 1, { steps: 4 })
  await page.mouse.up()
  await expect(screen).toContainText('HIDDEN OUTPUT')
})

test('hidden terminal resizes and alternate-buffer activation retains its screen', async ({ page }) => {
  await page.goto('/pane-tabs.html?single&performance')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.buffersReady())).toBe(true)
  const initialCols = await page.evaluate(() => (window as any).paneFixture.terminalState('b').cols)
  await page.setViewportSize({ width: 900, height: 650 })
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.terminalState('b').cols)).toBeLessThan(initialCols)
  await page.evaluate(() => (window as any).paneFixture.output('b', '\x1b[?1049h\x1b[2J\x1b[HTUI READY'))
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.terminalState('b').buffer)).toBe('alternate')
  await page.locator('[data-tab-id="terminal:b"]').click()
  await expect(page.locator('.cli-terminal').nth(1).locator('.xterm-screen')).toContainText('TUI READY')
  await page.locator('[data-tab-id="terminal:a"]').click()
  await page.locator('[data-tab-id="terminal:b"]').click()
  await expect(page.locator('.cli-terminal').nth(1).locator('.xterm-screen')).toContainText('TUI READY')
  await page.evaluate(() => (window as any).paneFixture.resetMetrics())
  await page.evaluate(() => (window as any).paneFixture.forceFit('b'))
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.metrics().fits)).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as any).paneFixture.metrics().resizes)).toBe(0)
})

test('returning from a hidden workspace recovers changed geometry without replaying', async ({ page }) => {
  await page.goto('/pane-tabs.html?single&performance')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.buffersReady())).toBe(true)
  const initialCols = await page.evaluate(() => (window as any).paneFixture.terminalState('a').cols)
  await page.evaluate(() => {
    (window as any).paneFixture.resetMetrics()
    ;(window as any).paneFixture.selectWorkspace('other')
  })
  await expect(page.locator('[data-tab-id="terminal:a"]')).toBeHidden()
  await page.setViewportSize({ width: 900, height: 650 })
  await page.evaluate(() => (window as any).paneFixture.selectWorkspace('ws'))
  await expect(page.locator('[data-tab-id="terminal:a"]')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).paneFixture.terminalState('a').cols)).toBeLessThan(initialCols)
  await expect(page.locator('.cli-terminal').first().locator('.xterm-screen')).toContainText('a: READY>')
  expect(await page.evaluate(() => (window as any).paneFixture.metrics().replays)).toBe(0)
})
