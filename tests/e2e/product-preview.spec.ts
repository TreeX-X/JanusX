import { expect, test } from '@playwright/test'

const palettes = {
  planche: { canvas: 'rgb(239, 228, 197)', text: 'rgb(28, 52, 59)', accent: 'rgb(212, 61, 42)' },
  dark: { canvas: 'rgb(21, 21, 23)', text: 'rgb(250, 250, 250)', accent: 'rgb(244, 125, 67)' },
}

for (const theme of ['planche', 'dark'] as const) {
  test(`preview chrome, Markdown/text and status UI follow ${theme}`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/product-preview.html?theme=${theme}`)
    await expect(page.getByText('预览', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '关闭预览', exact: true })).toBeVisible()
    const content = page.locator('.preview-scroll-viewport > div')
    await expect(page.getByRole('heading', { name: 'Preview heading' })).toBeVisible()
    await expect(content).toHaveCSS('background-color', palettes[theme].canvas)
    await expect(content).toHaveCSS('color', palettes[theme].text)
    await expect(page.getByText('Readable paragraph')).toHaveCSS('color', palettes[theme].text)
    await page.getByRole('button', { name: '复制代码', exact: true }).click()
    await expect(page.getByRole('button', { name: '已复制代码', exact: true })).toHaveCSS('background-color',
      theme === 'dark' ? 'rgba(255, 120, 48, 0.18)' : 'rgba(212, 61, 42, 0.18)')
    await page.screenshot({ path: test.info().outputPath(`preview-${theme}.png`) })

    // A live theme change updates an already-open document without reloading it.
    await page.getByRole('button', { name: '切换主题' }).click()
    const other = theme === 'dark' ? 'planche' : 'dark'
    await expect(content).toHaveCSS('background-color', palettes[other].canvas)
    await expect(page.getByText('Readable paragraph')).toHaveCSS('color', palettes[other].text)
    await page.getByRole('button', { name: '切换主题' }).click()
    await page.getByRole('button', { name: 'data.txt', exact: false }).first().click()
    await expect(content.locator('pre')).toContainText('Plain text preview')
    await expect(content).toHaveCSS('background-color', palettes[theme].canvas)
    await expect(content).toHaveCSS('color', palettes[theme].text)

    await page.getByRole('button', { name: 'loading.txt', exact: false }).first().click()
    await expect(page.locator('.product-spinner')).toHaveCSS('border-top-color', palettes[theme].accent)
    await page.getByRole('button', { name: 'error.txt', exact: false }).first().click()
    await expect(page.getByText('Fixture read failure')).toBeVisible()
    await page.getByRole('button', { name: 'report.docx', exact: false }).first().click()
    const retry = page.getByRole('button', { name: '重试', exact: true })
    await expect(retry).toBeVisible()
    await retry.hover()
    await expect(retry).toHaveCSS('background-color', theme === 'dark' ? 'rgb(43, 43, 46)' : 'rgb(220, 207, 168)')
  })
}

test('HTML retains the document background under both application themes', async ({ page }) => {
  await page.goto('/product-preview.html')
  await page.getByRole('button', { name: 'page.html', exact: false }).first().click()
  const body = page.frameLocator('iframe').locator('body')
  await expect(body).toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await page.getByRole('button', { name: '切换主题' }).click()
  await expect(body).toHaveCSS('background-color', 'rgb(18, 52, 86)')
})
