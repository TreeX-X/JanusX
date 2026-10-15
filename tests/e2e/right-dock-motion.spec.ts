import { expect, test } from '@playwright/test'

for (const theme of ['planche', 'dark']) {
  test(`width changes reveal stable content in ${theme}`, async ({ page }) => {
    await page.goto(`/tool-palette.html?theme=${theme}&panel=520`)
    await expect(page.locator('#right-tool-panel-files')).toBeVisible()
    const samples = await page.evaluate(async () => {
      const shell = document.querySelector<HTMLElement>('[data-testid="right-tool-panel-shell"]')!
      const dock = shell.parentElement!
      const rail = dock.querySelector('[role="toolbar"]')!
      const samples: { shell: number; dock: number; content: number; railX: number }[] = []
      document.getElementById('right-tool-tab-sessions')!.click()
      const started = performance.now()
      while (performance.now() - started < 360) {
        await new Promise(requestAnimationFrame)
        samples.push({
          shell: shell.getBoundingClientRect().width,
          dock: dock.getBoundingClientRect().width,
          content: document.getElementById('right-tool-panel-sessions')!.getBoundingClientRect().width,
          railX: rail.getBoundingClientRect().x,
        })
      }
      return samples
    })
    expect(samples.length).toBeGreaterThan(3)
    expect(new Set(samples.map(({ shell }) => Math.round(shell))).size).toBeGreaterThan(3)
    for (const sample of samples) {
      expect(sample.content).toBeCloseTo(520, 0)
      // One border pixel belongs to the dock; the permanent rail takes 48px.
      expect(sample.dock - sample.shell).toBeCloseTo(49, 0)
      expect(sample.railX).toBeCloseTo(samples[0].railX, 0)
    }
    expect(samples.at(-1)!.shell).toBeCloseTo(519, 0)
    await page.locator('#right-tool-tab-files').click()
    await expect.poll(() => page.locator('[data-testid="right-tool-panel-shell"]').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(259)
  })
}

test('rapid switches retain state and dragging follows the pointer without a transition', async ({ page }) => {
  await page.goto('/tool-palette.html')
  await page.locator('#right-tool-tab-sessions').click()
  const search = page.locator('#right-tool-panel-sessions').getByRole('textbox')
  await search.fill('保留筛选')
  await page.evaluate(() => {
    for (const tool of ['files', 'git', 'sessions', 'files', 'sessions']) {
      document.getElementById(`right-tool-tab-${tool}`)!.click()
    }
  })
  await expect(search).toHaveValue('保留筛选')
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  const shell = page.getByTestId('right-tool-panel-shell')
  await expect.poll(() => shell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(359)
  const handle = page.getByRole('separator')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 3, box.y + 100)
  await page.mouse.down()
  await expect(page.locator('main').first()).toHaveCSS('transition-duration', '0s')
  await page.mouse.move(box.x - 57, box.y + 100)
  await expect.poll(() => shell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(419)
  await page.mouse.up()
  await page.locator('#right-tool-tab-files').click()
  await page.locator('#right-tool-tab-sessions').click()
  await expect.poll(() => shell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(419)
})

test('reduced motion disables both width and content animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/tool-palette.html?panel=520')
  await page.locator('#right-tool-tab-sessions').click()
  await expect(page.locator('main').first()).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('#right-tool-panel-sessions')).toHaveCSS('animation-name', 'none')
  await expect.poll(() => page.getByTestId('right-tool-panel-shell').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(519)
})
