import { expect, test } from '@playwright/test'

const chart = (theme: string) => `https://api.star-history.com/chart?repos=TreeX-X/JanusX&type=date&theme=${theme}&legend=top-left`
const starHistory = (lightTheme = 'light') => `## Star 历史

<a href="https://www.star-history.com/#TreeX-X/JanusX&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="${chart('dark')}" />
    <source media="(prefers-color-scheme: light)" srcset="${chart(lightTheme)}" />
    <img alt="Star History Chart" width="600" src="${chart('dark')}" />
  </picture>
</a>

<details><summary>更多信息</summary>展开内容</details>`

test.beforeEach(async ({ page }) => {
  await page.route('https://api.star-history.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#ff7830"/></svg>' }))
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/editor-preview.html')
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 20_000 })
})

test('renders Star History HTML, follows the app theme and opens links without leaving the editor', async ({ page }, testInfo) => {
  await page.evaluate(content => (window as any).previewHarness.open('stars.md', content), starHistory())
  const preview = page.locator('.markdown-preview')
  const image = preview.getByRole('img', { name: 'Star History Chart' })
  await expect(preview.getByRole('heading', { name: 'Star 历史' })).toBeVisible()
  await expect(preview.locator('picture source')).toHaveCount(2)
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(640)
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.currentSrc)).toBe(chart('dark'))
  await page.screenshot({ path: testInfo.outputPath('star-history-dark.png') })
  await page.evaluate(() => (window as any).previewHarness.setTheme('planche'))
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.currentSrc)).toBe(chart('light'))
  await image.click()
  expect(await page.evaluate(() => (window as any).previewHarness.links)).toEqual(['https://www.star-history.com/#TreeX-X/JanusX&Date'])
  await preview.locator('summary').click()
  await expect(preview.getByText('展开内容')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('star-history-light.png') })
  await page.evaluate(content => (window as any).previewHarness.open('original-example.md', content), starHistory('dark'))
  await expect.poll(() => page.locator('.markdown-preview img').evaluate((el: HTMLImageElement) => el.currentSrc)).toBe(chart('dark'))
})

test('resolves Markdown and HTML local images and source sets and strips executable markup', async ({ page }) => {
  await page.evaluate(() => {
    ;(window as any).electron.file.readBinary = async (path: string) => {
      const width = path.includes('@2x') ? 240 : 120
      return { base64: btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="80"><rect width="${width}" height="80" fill="green"/></svg>`), mimeType: 'image/svg+xml', size: 140 }
    }
  })
  const markdown = '![Markdown local](./assets/image.svg)\n\n<picture><source srcset="./assets/image.svg 1x, ./assets/image@2x.svg 2x" /><img src="./assets/image.svg" alt="HTML local" width="120" /></picture>\n\n<script>window.previewExecutable=true</script><img src="javascript:bad" onerror="window.previewExecutable=true" /><iframe srcdoc="bad"></iframe>'
  await page.evaluate(content => (window as any).previewHarness.open('local-images.md', content), markdown)
  const preview = page.locator('.markdown-preview')
  for (const name of ['Markdown local', 'HTML local']) {
    await expect.poll(() => preview.getByRole('img', { name, exact: true }).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(120)
  }
  await expect(preview.locator('source')).toHaveAttribute('srcset', /data:image\/svg\+xml;base64,/)
  await expect(preview.locator('script, iframe, style, [onerror]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).previewExecutable)).toBeUndefined()
})
