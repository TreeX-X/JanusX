import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

let browser: Browser
let script: string
let css: string

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  await mkdir('artifacts/usage-loading-browser', { recursive: true })
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
        import React from 'react';import {createRoot} from 'react-dom/client'
        import i18n from 'i18next';import {initReactI18next} from 'react-i18next'
        import en from './src/renderer/src/i18n/locales/en/settings.json'
        import zh from './src/renderer/src/i18n/locales/zh-CN/settings.json'
        import {UsageStatsPanel} from './src/renderer/src/components/UsageStatsPanel'
        import {useThemeStore} from './src/renderer/src/stores/theme'
        import './src/renderer/src/styles/globals.css';import './src/renderer/src/styles/themes.generated.css'
        // Deferred gate: while window.gate is a pending promise every ledger
        // query stalls, so the loading window is observable.
        window.calls=[];window.gate=null;window.release=null;window.issueEngine=null
        window.pages={
          all:{records:[{id:'1',engine:'claude',sessionId:'s1',at:Date.now(),timeBasis:'event',inputTokens:700,outputTokens:300,cacheReadTokens:100,cacheWriteTokens:100,totalTokens:1200}],sessions:[{engine:'claude',sessionId:'s1',coverageStart:Date.now()-86400000,updatedAt:Date.now()}],coverageStart:Date.now()-86400000},
          codex:{records:[{id:'2',engine:'codex',sessionId:'s2',at:Date.now(),timeBasis:'event',inputTokens:300,outputTokens:150,cacheReadTokens:50,cacheWriteTokens:0,totalTokens:500}],sessions:[{engine:'codex',sessionId:'s2',coverageStart:Date.now()-86400000,updatedAt:Date.now()}],coverageStart:Date.now()-86400000},
        }
        window.electron={system:{listUsageLedger:async query=>{
          window.calls.push(query)
          if(window.gate)await window.gate
          const engine=query.engine??'all'
          const page=window.pages[engine]??{records:[],sessions:[]}
          const issue=window.issueEngine&&(engine==='all'||engine===window.issueEngine)
            ?[{engine:window.issueEngine,sessionId:'s-issue',coverageStart:Date.now()-86400000,updatedAt:Date.now(),issue:'counter-regressed'}]
            :[]
          return {...page,sessions:[...page.sessions,...issue]}
        }}}
        useThemeStore.setState({theme:'dark',loaded:true})
        const root=createRoot(document.getElementById('root'))
        window.show=()=>root.render(<div style={{width:1100,padding:16}}><UsageStatsPanel/></div>)
        i18n.use(initReactI18next).init({lng:'en',resources:{en:{settings:en},'zh-CN':{settings:zh}},initImmediate:false})
        window.show()
      `,
    },
    bundle: true,
    write: false,
    outfile: 'usage-loading.js',
    jsx: 'automatic',
    format: 'iife',
    loader: { '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'i18n', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next';export default i18n;export const changeLanguage=()=>{}", loader: 'ts' }))
    } }],
  })
  script = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!.text
})

afterAll(async () => { await browser?.close() })

async function mount(page: Page, prepare?: () => Promise<void>) {
  page.setDefaultTimeout(5000)
  await page.route('http://localhost/usage-loading', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://localhost/usage-loading')
  if (prepare) await prepare()
  await page.addStyleTag({ content: css + '\nbody{margin:0}*{box-sizing:border-box}' })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.addScriptTag({ content: script })
  await page.getByTestId('usage-total').waitFor()
}

async function totalText(page: Page) {
  return (await page.getByTestId('usage-total').textContent())?.trim()
}

async function refreshing(page: Page) {
  return page.getByTestId('usage-summary').getAttribute('data-refreshing')
}

it('keeps the previous data visible while a filter switch reloads, then swaps', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await mount(page)
    await expect.poll(() => totalText(page)).toBe('1.2ktokens')

    // Stall the next query, then switch the engine filter.
    await page.evaluate(() => { window.gate = new Promise(resolve => { window.release = resolve }) })
    await page.getByRole('button', { name: 'Codex' }).click()

    // Old data stays; the panel reports refreshing instead of flashing empty.
    await expect.poll(() => refreshing(page)).toBe('true')
    // Wait for the number animation to settle on the old value before asserting.
    await expect.poll(() => totalText(page)).toBe('1.2ktokens')
    // The dimming is real, not just an attribute (transition settles to 0.55).
    await expect.poll(() => page.getByTestId('usage-summary').evaluate(node => Number(getComputedStyle(node).opacity))).toBeLessThan(0.99)
    // The progress hairline animates when motion is allowed.
    const animation = await page.locator('[data-refresh-bar]').evaluate(node => getComputedStyle(node, '::after').animationName)
    expect(animation).toContain('usage-refresh-slide')

    await page.evaluate(() => { window.gate = null; window.release() })
    await expect.poll(() => totalText(page)).toBe('500tokens')
    await expect.poll(() => refreshing(page)).toBe(null)
    await expect.poll(() => page.getByTestId('usage-summary').evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1)
  } finally {
    await page.close()
  }
})

it('stays silent on the periodic re-query of an unchanged filter', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await page.clock.install()
    await mount(page)
    await expect.poll(() => totalText(page)).toBe('1.2ktokens')
    await page.evaluate(() => { window.calls = [] })

    // The 10s `now` tick re-queries the same key: no indicator, no flicker.
    await page.evaluate(() => { window.gate = new Promise(resolve => { window.release = resolve }) })
    await page.clock.fastForward(10_000)
    await expect.poll(() => page.evaluate(() => window.calls.length)).toBe(1)
    expect(await refreshing(page)).toBe(null)
    expect(await totalText(page)).toBe('1.2ktokens')

    await page.evaluate(() => { window.gate = null; window.release() })
    await expect.poll(() => page.evaluate(() => window.calls.length)).toBe(1)
    expect(await refreshing(page)).toBe(null)
    expect(await totalText(page)).toBe('1.2ktokens')
  } finally {
    await page.close()
  }
})

it('renders the reduced-motion variant as an instant, static indicator', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  try {
    await mount(page)
    await page.evaluate(() => { window.gate = new Promise(resolve => { window.release = resolve }) })
    await page.getByRole('button', { name: 'Codex' }).click()
    await expect.poll(() => refreshing(page)).toBe('true')
    const style = await page.locator('[data-refresh-bar]').evaluate(node => {
      const after = getComputedStyle(node, '::after')
      return { animationName: after.animationName, width: after.width }
    })
    expect(style.animationName).toBe('none')
    // Static full-width hairline instead of the sliding one.
    const barWidth = await page.locator('[data-refresh-bar]').evaluate(node => node.getBoundingClientRect().width)
    expect(Number.parseFloat(style.width)).toBeCloseTo(barWidth, 0)

    await page.evaluate(() => { window.gate = null; window.release() })
    await expect.poll(() => totalText(page)).toBe('500tokens')
  } finally {
    await page.close()
  }
})

it('morphs the curve into the new shape instead of redrawing it', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await mount(page)
    await expect.poll(() => totalText(page)).toBe('1.2ktokens')
    const path = page.locator('path[data-series]').first()
    // A marker on the node proves the svg is not remounted: a redraw would lose
    // it, a morph keeps the same element and only changes its geometry.
    await path.evaluate(node => node.setAttribute('data-morph-witness', '1'))
    // Segment count identifies the bucket shape (today: hourly, week: daily) and
    // tolerates the float noise of a same-shape tween running underneath.
    const segments = (d: string | null) => (d?.match(/C /g) ?? []).length
    const before = await path.getAttribute('d')
    const beforeSegments = segments(before)

    // Hourly today buckets -> daily week buckets is a shape change. Gate the
    // query so the transition starts at a known moment.
    await page.evaluate(() => { window.gate = new Promise(resolve => { window.release = resolve }) })
    await page.getByRole('button', { name: 'This week' }).click()
    // While the query is in flight the settled snapshot keeps the old shape.
    expect(segments(await path.getAttribute('d'))).toBe(beforeSegments)
    await page.evaluate(() => { window.gate = null; window.release() })

    // The geometry leaves the old shape: an in-place morph, not a snap.
    await expect.poll(async () => segments(await path.getAttribute('d'))).not.toBe(beforeSegments)
    // It settles on the target shape and stays there.
    await page.waitForTimeout(600)
    const settled = await path.getAttribute('d')
    expect(segments(settled)).not.toBe(beforeSegments)
    await page.waitForTimeout(150)
    expect(await path.getAttribute('d')).toBe(settled)
    expect(await path.getAttribute('data-morph-witness')).toBe('1')
    // Data points return once the real buckets are back (no flying dots mid-morph).
    await expect.poll(() => page.locator('svg circle').count()).toBeGreaterThan(0)
  } finally {
    await page.close()
  }
})

it('keeps the curves visible without motion', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  try {
    await mount(page)
    await page.getByRole('button', { name: 'This week' }).click()
    const path = page.locator('path[data-series]').first()
    await expect.poll(() => path.getAttribute('pathLength')).toBe('100')
    // 轮询等重挂后的新曲线落位：卸载中的节点计算样式为空
    await expect.poll(() => path.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
    const style = await path.evaluate(node => {
      const computed = getComputedStyle(node)
      return { animationName: computed.animationName, dasharray: computed.strokeDasharray, dashoffset: computed.strokeDashoffset }
    })
    // No animation and no leftover dash: reduced motion shows the full curve.
    expect(style.animationName).toBe('none')
    expect(style.dasharray === 'none' || style.dasharray === '').toBe(true)
    expect(Number(style.dashoffset.replace('px', '')) || 0).toBe(0)
  } finally {
    await page.close()
  }
})

it('hides the incompleteness hint for codex-only session issues', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    // Codex compaction resets its cumulative counters, so a paused codex
    // session is expected CLI behaviour, not a data-integrity problem.
    await mount(page, async () => { await page.evaluate(() => { window.issueEngine = 'codex' }) })
    await expect.poll(() => totalText(page)).toBe('1.2ktokens')
    expect(await page.getByText('Usage is incomplete').count()).toBe(0)

    // Any other engine's gap still warns.
    await page.evaluate(() => { window.issueEngine = 'claude' })
    await page.getByRole('button', { name: 'Codex' }).click()
    await page.getByRole('button', { name: 'All' }).click()
    await expect.poll(() => page.getByText('Usage is incomplete').count()).toBe(1)
  } finally {
    await page.close()
  }
})
