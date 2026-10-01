import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

let browser: Browser
let script: string
let css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import {createRoot} from 'react-dom/client'
      import i18n from 'i18next'
      import {initReactI18next} from 'react-i18next'
      import en from './src/renderer/src/i18n/locales/en/knowledge.json'
      import zh from './src/renderer/src/i18n/locales/zh-CN/knowledge.json'
      import settingsEn from './src/renderer/src/i18n/locales/en/settings.json'
      import settingsZh from './src/renderer/src/i18n/locales/zh-CN/settings.json'
      import commonEn from './src/renderer/src/i18n/locales/en/common.json'
      import commonZh from './src/renderer/src/i18n/locales/zh-CN/common.json'
      import {LayaSettingsPanel} from './src/renderer/src/components/LayaSettingsPanel'
      import {KnowledgeSettingsPanel} from './src/renderer/src/components/KnowledgeSettingsPanel'
      import shell from './src/renderer/src/components/AppSettingsModal.module.css'
      window.calls=[]
      window.runtime=window.runtime??{phase:'stopped',reason:'',modelRevision:'e4e9ddf21a7b1903b7acffd8814ad4307bf63a67'}
      window.config={enabled:window.masterEnabled??true,mode:'deterministic-only',autoAcceptDeterministicFacts:false,laya:{enabled:true,pythonPath:'C:/tools/laya/python.exe',modelPath:''}}
      let reads=0
      window.electron={dialog:{openDirectory:async()=>window.folder??{canceled:false,filePaths:['C:/models/laya']}},knowledge:{
        getSettings:async()=>window.config, updateSettings:async value=>{window.config=value;return value}, externalMcpStatus:async()=>null,
        layaControl:async action=>{
          window.calls.push(action)
          if(action==='status'){
            reads++
            if(window.failStatus)throw Error('status unavailable')
            if(window.deferFirstStatus&&reads===1)return new Promise(resolve=>window.finishRead=()=>resolve({phase:'stopped',reason:'old',modelRevision:'old'}))
            return {...window.runtime}
          }
          if(action==='prepare'&&window.deferPrepare)await new Promise(resolve=>window.finishOperation=resolve)
          if(action==='warm')window.runtime={...window.runtime,phase:'ready',reason:'',warmupMs:12}
          if(action==='prepare')window.runtime={...window.runtime,phase:'stopped',reason:'prepared'}
          if(action==='stop')window.runtime={...window.runtime,phase:'stopped',reason:'stopped'}
          return {...window.runtime}
        }
      }}
      function Panel(){
        const [saving,setSaving]=React.useState(false)
        const [value,setValue]=React.useState(window.config.laya)
        const save=()=>{if(window.saveFails)return Promise.resolve(false);if(!window.deferSave)return Promise.resolve(true);setSaving(true);return new Promise(resolve=>window.finishSave=()=>{setSaving(false);resolve(true)})}
        return <LayaSettingsPanel value={value} knowledgeEnabled={window.masterEnabled??true} onChange={setValue} onSave={save} disabled={saving}/>
      }
      i18n.use(initReactI18next).init({lng:window.language??'en',resources:{en:{knowledge:en,settings:settingsEn,common:commonEn},'zh-CN':{knowledge:zh,settings:settingsZh,common:commonZh}},interpolation:{escapeValue:false}}).then(()=>{
        window.root=createRoot(document.getElementById('root'))
        window.root.render(<div className={shell.panel} style={{display:'block',width:'100%',height:'auto',overflow:'visible'}}><div className={shell.body}>{window.fullPanel?<KnowledgeSettingsPanel/>:<Panel/>}</div></div>)
      })
    ` },
    bundle: true, write: false, outfile: 'laya-settings-test.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'i18n', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage = lang => i18n.changeLanguage(lang)", loader: 'ts' }))
    } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = (await readFile('src/renderer/src/styles/themes.generated.css', 'utf8')) + '\n' + result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })

async function mount(page: Page, options: Record<string, unknown> = {}) {
  page.setDefaultTimeout(3000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<div id="root"></div>')
  await page.addStyleTag({ content: css + '\n*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--shell-canvas);font-family:system-ui;--control-h:32px}#root{max-width:700px;margin:auto}' })
  await page.evaluate(values => Object.assign(window, values), options)
  await page.addScriptTag({ content: script })
  try { await page.getByRole('switch').waitFor() }
  catch (error) { throw new Error(`${String(error)}\nBrowser errors: ${errors.join('\n')}`) }
}

it('lets cancellation stop a warm-up while settings are still saving', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, { deferSave: true })
    await page.getByRole('button', { name: 'Load model', exact: true }).click()
    expect(await page.getByRole('button', { name: 'Loading model', exact: true }).isDisabled()).toBe(true)
    await page.getByRole('button', { name: 'Cancel operation', exact: true }).click()
    await page.evaluate(() => (window as any).finishSave())
    expect(await page.evaluate(() => (window as any).calls.filter((x: string) => x !== 'status'))).toEqual(['stop'])
    await expect.poll(() => page.getByRole('button', { name: 'Load model', exact: true }).isEnabled()).toBe(true)
  } finally { await page.close() }
})

it('validates paths, selects a folder and keeps blank model paths valid', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.getByLabel('Python environment', { exact: true }).fill('python.exe')
    expect(await page.getByRole('button', { name: 'Load model', exact: true }).isDisabled()).toBe(true)
    expect(await page.getByLabel('Python environment', { exact: true }).getAttribute('aria-invalid')).toBe('true')
    await page.getByLabel('Python environment', { exact: true }).fill('C:/tools/python.exe')
    await page.getByRole('button', { name: 'Choose folder' }).click()
    await expect.poll(() => page.getByLabel('Model storage', { exact: true }).inputValue()).toBe('C:/models/laya')
    await page.getByLabel('Model storage', { exact: true }).fill('relative/model')
    expect(await page.getByRole('button', { name: 'Load model', exact: true }).isDisabled()).toBe(true)
    await page.getByLabel('Model storage', { exact: true }).fill('')
    expect(await page.getByRole('button', { name: 'Load model', exact: true }).isEnabled()).toBe(true)
    await page.getByRole('switch').press('Space')
    expect(await page.getByRole('switch').isChecked()).toBe(false)
    expect(await page.getByRole('textbox').count()).toBe(0)
  } finally { await page.close() }
})

it('ignores an old status response after loading and shows measured timing only', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, { deferFirstStatus: true })
    await page.getByRole('button', { name: 'Load model', exact: true }).click()
    await expect.poll(() => page.getByRole('status').textContent()).toBe('Ready')
    await page.evaluate(() => (window as any).finishRead())
    expect(await page.getByRole('status').textContent()).toBe('Ready')
    await page.getByText('Runtime details', { exact: true }).click()
    expect(await page.getByText('12 ms', { exact: true }).count()).toBe(1)
    expect(await page.getByText('Last decision', { exact: true }).count()).toBe(0)
  } finally { await page.close() }
})

it('recovers from status errors and does not start after a failed save', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, { failStatus: true, saveFails: true })
    await expect.poll(() => page.getByRole('status').textContent()).toBe('Unable to read runtime status')
    await page.evaluate(() => { (window as any).failStatus = false })
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect.poll(() => page.getByRole('status').textContent()).toBe('Not loaded')
    await page.getByRole('button', { name: 'Load model', exact: true }).click()
    await page.getByRole('alert').waitFor()
    expect(await page.evaluate(() => (window as any).calls.filter((action: string) => action !== 'status'))).toEqual([])
  } finally { await page.close() }
})

it('respects the knowledge switch in the real parent panel and keeps its ordering', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, { fullPanel: true, masterEnabled: false })
    expect(await page.getByRole('switch').isDisabled()).toBe(true)
    expect(await page.getByLabel('Python environment', { exact: true }).isDisabled()).toBe(true)
    expect(await page.getByRole('button', { name: 'Load model', exact: true }).isDisabled()).toBe(true)
    const headings = await page.getByRole('heading', { level: 3 }).allTextContents()
    expect(headings[1]).toBe('Laya local assistance')
    await page.getByRole('checkbox').first().press('Space')
    expect(await page.getByRole('switch').isEnabled()).toBe(true)
  } finally { await page.close() }
})

it('saves before downloading, locks parent settings and supports loading and release', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, { fullPanel: true, deferPrepare: true })
    await page.getByLabel('Model storage', { exact: true }).fill('C:/models/custom-laya')
    await page.getByRole('button', { name: 'Download and verify', exact: true }).click()
    await expect.poll(() => page.evaluate(() => typeof (window as any).finishOperation)).toBe('function')
    expect(await page.evaluate(() => (window as any).config.laya.modelPath)).toBe('C:/models/custom-laya')
    await expect.poll(() => page.getByRole('checkbox').first().isDisabled()).toBe(true)
    await expect.poll(() => page.locator('button[aria-haspopup="listbox"]').isDisabled()).toBe(true)
    await expect.poll(() => page.getByRole('button', { name: 'Save', exact: true }).isDisabled()).toBe(true)
    await expect.poll(() => page.getByRole('button', { name: 'Cancel operation', exact: true }).isEnabled()).toBe(true)
    await page.evaluate(() => (window as any).finishOperation())
    await expect.poll(() => page.getByRole('status').textContent()).toBe('Not loaded')
    await page.getByRole('button', { name: 'Load model', exact: true }).click()
    await expect.poll(() => page.getByRole('status').textContent()).toBe('Ready')
    await page.getByRole('button', { name: 'Release memory', exact: true }).click()
    await expect.poll(() => page.getByRole('status').textContent()).toBe('Not loaded')
    expect(await page.evaluate(() => (window as any).calls.filter((action: string) => action !== 'status'))).toEqual(['prepare', 'warm', 'stop'])
    await expect.poll(() => page.locator('button[aria-haspopup="listbox"]').isEnabled()).toBe(true)
  } finally { await page.close() }
})

it.each(['planche', 'dark'])('keeps Chinese controls within the panel at wide and narrow widths in %s', async theme => {
  const page = await browser.newPage()
  try {
    await mount(page, { language: 'zh-CN', fullPanel: true, runtime: { phase: 'stopped', reason: 'prepared', modelRevision: 'e4e9ddf21a7b1903b7acffd8814ad4307bf63a67' } })
    expect(await page.getByRole('heading', { level: 3 }).allTextContents()).toContain('Laya 本地辅助判断')
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
    for (const width of [760, 390]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const panel = await page.getByRole('region', { name: 'Laya 本地辅助判断' }).boundingBox()
      for (const box of await page.getByRole('region', { name: 'Laya 本地辅助判断' }).locator('input,button').evaluateAll(nodes => nodes.map(node => {
        const rect=node.getBoundingClientRect(); return {x:rect.x,right:rect.right,width:rect.width}
      }))) {
        expect(box.x).toBeGreaterThanOrEqual(panel!.x)
        expect(box.right).toBeLessThanOrEqual(panel!.x + panel!.width)
      }
      if (process.env.LAYA_UI_SCREENSHOTS) {
        await mkdir(process.env.LAYA_UI_SCREENSHOTS, { recursive: true })
        await page.screenshot({ path: join(process.env.LAYA_UI_SCREENSHOTS, `${theme}-${width}.png`), fullPage: true })
      }
    }
  } finally { await page.close() }
})
