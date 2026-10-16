import { expect, test } from '@playwright/test'

for (const theme of ['planche', 'dark']) {
  for (const carrier of ['pane', 'window']) {
    for (const width of [480, 1280]) {
      test(`${theme} ${carrier} start page and neutral controls fit ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 720 })
        await page.goto(`/browser-surface.html?theme=${theme}&carrier=${carrier}`)
        const start = page.locator('[data-browser-start-page]')
        const address = page.getByRole('textbox', { name: 'Address bar', exact: true })
        await expect(start).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Browse in your workspace' })).toBeVisible()
        await expect.poll(() => page.evaluate(() => (window as any).browserFixture.state().bounds?.width)).toBe(0)
        await page.getByRole('button', { name: 'Enter a URL', exact: true }).click()
        await expect(address).toBeFocused()
        await expect(address).toHaveValue('')
        const shell = page.locator('[data-browser-surface]')
        expect(await shell.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
        const selected = page.getByRole('tab', { selected: true })
        await expect(selected).toHaveCSS('border-bottom-width', '0px')
        await expect(page.getByRole('button', { name: 'Close tab, hold to confirm', exact: true })).toBeInViewport()
        await page.mouse.move(0, 0)
        await page.screenshot({ path: test.info().outputPath(`browser-${theme}-${carrier}-${width}.png`) })
      })
    }
  }
}

test('blank and empty tabs remain usable and inherit hold-to-close', async ({ page }) => {
  await page.goto('/browser-surface.html')
  const address = page.getByRole('textbox', { name: 'Address bar', exact: true })
  await address.fill('http://localhost:3000')
  await address.press('Enter')
  await expect(page.locator('[data-browser-start-page]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).browserFixture.state().bounds?.width ?? 0)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await expect(address).toHaveValue('')
  await expect(page.locator('[data-browser-start-page]')).toBeVisible()
  const close = page.getByRole('button', { name: 'Close tab, hold to confirm', exact: true }).last()
  await close.click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await close.press('Enter', { delay: 1100 })
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(page.locator('[data-browser-start-page]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close tab, hold to confirm', exact: true }).click({ delay: 1100 })
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.locator('[data-browser-start-page]')).toBeVisible()
  await page.getByRole('button', { name: 'Enter a URL', exact: true }).click()
  await address.fill('http://localhost:4000')
  await address.press('Enter')
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(page.locator('[data-browser-start-page]')).toHaveCount(0)
})

test('failed pages use the same surface and retain their address and retry action', async ({ page }) => {
  await page.goto('/browser-surface.html?theme=dark')
  const address = page.getByRole('textbox', { name: 'Address bar', exact: true })
  await address.fill('http://localhost:3000')
  await address.press('Enter')
  await page.evaluate(() => (window as any).browserFixture.fail())
  await expect(page.getByRole('alert')).toContainText('ERR_CONNECTION_REFUSED')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(address).toHaveValue('http://localhost:3000')
  await expect.poll(() => page.evaluate(() => (window as any).browserFixture.state().bounds?.width)).toBe(0)
  await page.screenshot({ path: test.info().outputPath('browser-error-dark.png') })
})
