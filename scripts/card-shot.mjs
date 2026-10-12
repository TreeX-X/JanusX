import { chromium } from 'playwright'
const port = process.env.JANUS_E2E_PORT ?? 41731
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 })
await page.goto(`http://127.0.0.1:${port}/blueprint-architecture.html?workbench`)
await page.waitForSelector('.bp-node-card', { timeout: 15000 })
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const pick = (el) => {
    if (!el) return null
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { cls: el.className.slice(0, 80), bg: s.backgroundColor, bgImage: s.backgroundImage.slice(0, 60), border: s.border, radius: s.borderRadius, overflow: s.overflow, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  }
  const shell = document.querySelector('.blueprint-workbench-card--canvas')
  return {
    shell: pick(shell),
    view: pick(shell.querySelector('.blueprint-view')),
    wrapper: pick(shell.querySelector('.blueprint-canvas-wrapper')),
    main: pick(shell.querySelector('.blueprint-canvas-main')),
  }
})
console.log(JSON.stringify(info, null, 2))
// 画布左上角外缘（含方框边缘）高倍特写
const box = await page.locator('.blueprint-canvas-main').boundingBox()
await page.screenshot({ path: 'test-results/mid-corner-before.png', clip: { x: box.x - 3, y: box.y - 3, width: 60, height: 45 } })
await browser.close()
