import { test, expect } from '@playwright/test'
import { createOfficePreviewProxy } from '../../src/main/office/office-preview-proxy'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'

test('real OfficeCLI slides support fit, zoom, single-page navigation and continuous view', async ({ page }) => {
  test.skip(process.platform !== 'win32', 'Bundled OfficeCLI targets Windows')
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'janus-office-controls-'))
  const binary = resolve('resources/officecli/officecli.exe')
  const file = join(root, 'slides.pptx')
  let proxy: Awaited<ReturnType<typeof createOfficePreviewProxy>> | undefined
  let child: ReturnType<typeof execa> | undefined
  try {
    await execa(binary, ['create', file])
    for (let n = 0; n < 3; n++) await execa(binary, ['add', file, '/', '--type', 'slide'])
    await execa(binary, ['add', file, '/slide[2]', '--type', 'shape', '--prop', 'text=JanusX Office preview', '--prop', 'x=1in', '--prop', 'y=1in', '--prop', 'width=6in', '--prop', 'height=1in'])
    const port = await new Promise<number>(done => {
      const server = createServer()
      server.listen(0, '127.0.0.1', () => { const address = server.address() as { port: number }; server.close(() => done(address.port)) })
    })
    child = execa(binary, ['watch', file, '--port', String(port)], { reject: false, windowsHide: true })
    await expect.poll(async () => { try { return (await fetch(`http://127.0.0.1:${port}/`)).ok } catch { return false } }).toBe(true)
    proxy = await createOfficePreviewProxy(port)
    await page.setViewportSize({ width: 900, height: 650 })
    // Exercise the same cross-origin iframe boundary used by the production renderer.
    await page.goto('/turn-changes.html')
    await page.evaluate(port => { document.body.innerHTML = `<iframe title="Office" sandbox="allow-scripts allow-same-origin" style="width:700px;height:550px" src="http://127.0.0.1:${port}/"></iframe>` }, proxy.port)
    const frame = page.frameLocator('iframe[title="Office"]')
    const bar = frame.locator('#janus-office-controls')
    await expect(bar).toBeVisible()
    await expect(frame.locator('.main > .slide-container:visible')).toHaveCount(1)
    await expect(bar.locator('[data-page]')).toHaveText('1 / 3')
    const slide = frame.locator('.main > .slide-container:visible .slide')
    const fitted = await slide.boundingBox()
    expect(fitted!.width).toBeLessThan(700)
    expect(fitted!.height).toBeLessThan(510)
    await bar.locator('[data-action="next"]').click()
    await expect(bar.locator('[data-page]')).toHaveText('2 / 3')
    await expect(frame.locator('.main > .slide-container:visible')).toHaveAttribute('data-slide', '2')
    await bar.locator('[data-zoom]').selectOption('150')
    const enlarged = await slide.boundingBox()
    expect(enlarged!.width).toBeGreaterThan(fitted!.width)
    expect(await frame.locator('.main').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath('office-zoom-scrollbars.png') })
    await bar.locator('[data-action="out"]').click()
    await expect(bar.locator('[data-zoom]')).toHaveValue('125')
    await bar.locator('[data-zoom]').selectOption('fit')
    await bar.locator('[data-mode]').selectOption('continuous')
    await expect(frame.locator('.main > .slide-container:visible')).toHaveCount(3)
    await page.screenshot({ path: test.info().outputPath('office-continuous-scrollbar.png') })
    await frame.locator('.main > .slide-container').last().evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'start' }))
    await expect(bar.locator('[data-page]')).toHaveText('3 / 3')
    await bar.locator('[data-action="prev"]').click()
    await expect(bar.locator('[data-page]')).toHaveText('2 / 3')
    await bar.locator('[data-mode]').selectOption('single')
    await bar.locator('[data-action="next"]').click()
    await expect(bar.locator('[data-action="next"]')).toBeDisabled()
    await slide.click()
    await page.keyboard.press('ArrowLeft')
    await expect(bar.locator('[data-page]')).toHaveText('2 / 3')
    await page.screenshot({ path: test.info().outputPath('office-single-page.png') })
    await page.setViewportSize({ width: 700, height: 500 })
    await page.locator('iframe[title="Office"]').evaluate(el => { el.style.width = '340px'; el.style.height = '360px' })
    await expect(bar).toBeVisible()
    await expect.poll(async () => (await slide.boundingBox())!.width).toBeLessThan(340)
    expect((await slide.boundingBox())!.height).toBeLessThan(320)
    await bar.locator('[data-action="next"]').click()
    await expect(bar.locator('[data-page]')).toHaveText('3 / 3')
    for (const extension of ['docx', 'xlsx']) {
      await proxy.stop()
      child.kill()
      await child
      const document = join(root, `document.${extension}`)
      await execa(binary, ['create', document])
      child = execa(binary, ['watch', document, '--port', String(port)], { reject: false, windowsHide: true })
      await expect.poll(async () => { try { return (await fetch(`http://127.0.0.1:${port}/`)).ok } catch { return false } }).toBe(true)
      proxy = await createOfficePreviewProxy(port)
      await page.locator('iframe[title="Office"]').evaluate((el, port) => { (el as HTMLIFrameElement).src = `http://127.0.0.1:${port}/?janusLanguage=zh-CN` }, proxy.port)
      await expect(bar).toBeVisible()
      await expect(bar.locator('[data-mode]')).toBeHidden()
      await expect(bar.locator('[data-zoom]')).toHaveAttribute('aria-label', '预览缩放')
      await bar.locator('[data-zoom]').selectOption('150')
      await expect(frame.locator('body')).toHaveCSS('zoom', '1.5')
      expect((await bar.boundingBox())!.width).toBeLessThanOrEqual(700)
      await bar.locator('[data-zoom]').selectOption('fit')
      await expect(frame.locator('body')).not.toHaveCSS('zoom', '1.5')
      await execa(binary, ['close', document], { reject: false, windowsHide: true })
    }
    await proxy.stop()
    proxy = undefined
  } finally {
    await proxy?.stop()
    if (child) { child.kill(); await child }
    await execa(binary, ['close', file], { reject: false, windowsHide: true })
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
