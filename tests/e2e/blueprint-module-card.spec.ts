import { expect, test } from '@playwright/test'

// Production cards retain their measured size and readable states while zooming.
for (const theme of ['planche', 'dark']) {
  test(`module cards keep selection, search and assistant focus across zoom: ${theme}`, async ({ browser, baseURL }) => {
    const page = await browser.newPage({ baseURL, viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 })
    try {
      await page.goto('/blueprint-module-card.html')
      const card = page.locator('.bp-node-card--module')
      await expect(card).toBeVisible({ timeout: 15_000 })
      await page.evaluate(theme => (window as any).moduleCardFixture.theme(theme), theme)
      await expect(card).toHaveCSS('border-radius', '8px')
      for (const zoom of [1, 1.62, 0.38]) {
        await page.evaluate(zoom => (window as any).moduleCardFixture.zoom(zoom), zoom)
        await expect(card).toHaveClass(zoom < 0.5 ? /--minimal/ : /^(?!.*--minimal)/)
        const size = await card.evaluate(el => [el.clientWidth, el.clientHeight])
        let defaultStroke = ''
        for (const state of ['default', 'selected', 'matched', 'focus']) {
          await page.evaluate(state => (window as any).moduleCardFixture.state(state), state)
          await expect(card).toHaveClass(state === 'default' ? /^(?!.*--selected)/ : /--selected/)
          if (state === 'default') defaultStroke = await card.evaluate(el => getComputedStyle(el).borderColor)
          if (state === 'selected') {
            await expect.poll(() => card.evaluate(el => getComputedStyle(el).borderColor)).not.toBe(defaultStroke)
            await expect(card).not.toHaveCSS('box-shadow', 'none')
          }
          if (state === 'matched') await expect(card).toHaveClass(/--matched/)
          if (state === 'focus') {
            await expect(card).toHaveCSS('outline-style', 'solid')
            await expect(card).toHaveCSS('outline-width', '3px')
            await expect(card).toHaveCSS('outline-offset', '4px')
          }
          expect(await card.evaluate(el => [el.clientWidth, el.clientHeight])).toEqual(size)
          await expect(card.locator('.bp-node-card__title')).toHaveText('Module card')
          if (zoom >= 0.5) await expect(card.locator('.bp-node-card__enter')).toBeVisible()
        }
        await page.screenshot({ path: test.info().outputPath(`module-${zoom}.png`), fullPage: true })
      }
    } finally { await page.close() }
  })
}
