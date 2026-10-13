import { expect, test } from '@playwright/test'

// Note: cover the right shoulder as well as the middle of the old tab/body seam
// — see .agents/notes/blueprint/navigation/requirements/module-browsing.md
for (const theme of ['planche', 'dark']) {
  test(`folder shoulder stays continuous across zoom and highlights: ${theme}`, async ({ browser, baseURL }) => {
    const page = await browser.newPage({ baseURL, viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 })
    try {
      await page.goto('/blueprint-module-card.html')
      const card = page.locator('.bp-node-card--module')
      await expect(card).toBeVisible({ timeout: 15_000 })
      await page.evaluate(theme => (window as any).moduleCardFixture.theme(theme), theme)
      for (const zoom of [1, 1.62, 0.38]) {
        await page.evaluate(zoom => (window as any).moduleCardFixture.zoom(zoom), zoom)
        await expect(card).toHaveClass(zoom < 0.5 ? /--minimal/ : /^(?!.*--minimal)/)
        const size = await card.evaluate(el => [el.clientWidth, el.clientHeight])
        let defaultStroke = '', selectedStroke = ''
        for (const state of ['default', 'selected', 'matched', 'focus']) {
          await page.evaluate(state => (window as any).moduleCardFixture.state(state), state)
          await expect(card).toHaveClass(state === 'default' ? /^(?!.*--selected)/ : /--selected/)
          const shape = card.locator('.bp-node-card__module-shape')
          await expect(shape).toHaveCSS('pointer-events', 'none')
          await page.waitForTimeout(170) // Allow the production border-color transition to finish.
          const stroke = await shape.evaluate(el => getComputedStyle(el).stroke)
          if (state === 'default') defaultStroke = stroke
          if (state === 'selected') { selectedStroke = stroke; expect(stroke).not.toBe(defaultStroke) }
          if (state === 'matched') expect(stroke).toBe(selectedStroke)
          if (state === 'focus') await expect(card.locator('.bp-node-card__module-focus')).toHaveCSS('display', 'block')
          expect(await card.evaluate(el => [el.clientWidth, el.clientHeight])).toEqual(size)
          const shot = (await card.screenshot()).toString('base64')
          const pixels = await card.evaluate(async (el, shot) => {
            const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + shot)).blob())
            const canvas = document.createElement('canvas')
            canvas.width = bitmap.width; canvas.height = bitmap.height
            const context = canvas.getContext('2d')!
            context.drawImage(bitmap, 0, 0)
            const scale = bitmap.width / (el as HTMLElement).offsetWidth
            const tabWidth = el.classList.contains('bp-node-card--minimal') ? 50 : 76
            const sample = (x: number) => [...context.getImageData(Math.round(x * scale), Math.round(3 * scale), 1, 1).data].slice(0, 3)
            // Rendered reference fill also accounts for translucent dark themes.
            // The old border overlap left a vertical tail at tabWidth - 1.
            return { fill: sample(130), samples: [20, tabWidth - 1].map(sample) }
          }, shot)
          for (const pixel of pixels.samples) pixel.forEach((value, i) => expect(Math.abs(value - pixels.fill[i]), `${state}, zoom ${zoom}: interior shoulder pixel`).toBeLessThanOrEqual(5))
        }
        await page.screenshot({ path: test.info().outputPath(`folder-${zoom}.png`), fullPage: true })
      }
    } finally { await page.close() }
  })
}
