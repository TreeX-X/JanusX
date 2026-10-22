import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import en from '../../../src/renderer/src/i18n/locales/en/settings.json'
import zh from '../../../src/renderer/src/i18n/locales/zh-CN/settings.json'

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
      import en from './src/renderer/src/i18n/locales/en/settings.json'
      import zh from './src/renderer/src/i18n/locales/zh-CN/settings.json'
      import {UpdaterSettings} from './src/renderer/src/components/UpdaterSettings'
      import {UpdaterBadge} from './src/renderer/src/components/UpdaterBadge'
      window.calls=[]
      const listeners=new Set()
      window.state={phase:'idle',supported:true,unsupportedReason:null,currentVersion:'0.9.1',availableVersion:null,downloadPercent:null,releaseNotes:null,error:null,...window.initial}
      window.emitState=patch=>{
        window.state={...window.state,...patch}
        listeners.forEach(listener=>listener({type:'state',state:{...window.state}}))
      }
      window.electron={updater:{
        getSettings:async()=>({autoCheck:true}),updateSettings:async value=>value,
        getState:async()=>({...window.state}),onEvent:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},
        check:async()=>{window.calls.push('check');return {...window.state}},
        download:async()=>{
          window.calls.push('download')
          window.emitState({phase:'downloading',downloadPercent:42,error:null})
          if(window.deferDownload)await new Promise(resolve=>window.finishDownload=resolve)
          if(window.failDownload){window.emitState({phase:'error',error:'connection reset'});return {...window.state}}
          window.emitState({phase:'downloaded',downloadPercent:100,error:null})
          return {...window.state}
        },
        install:async()=>{window.calls.push('install');if(window.rejectInstall)throw Error('IPC failed');return {ok:!window.failInstall}},
        openReleases:async()=>{},openRepository:async()=>{}
      }}
      i18n.use(initReactI18next).init({lng:window.language??'en',resources:{en:{settings:en},'zh-CN':{settings:zh}},interpolation:{escapeValue:false}}).then(()=>{
        createRoot(document.getElementById('root')).render(<><header style={{height:38,display:'flex',alignItems:'center',gap:8,padding:'0 12px',borderBottom:'1px solid var(--shell-border)'}}><span>JanusX</span><UpdaterBadge onOpenSettings={()=>window.calls.push('open-settings')}/></header><main style={{padding:24}}><UpdaterSettings/></main></>)
      })
    ` },
    bundle: true, write: false, outfile: 'updater-test.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'i18n', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage=lang=>i18n.changeLanguage(lang)", loader: 'ts' }))
    } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})

it.each(['planche', 'dark'])('shows progress, verification, retry and readiness clearly in %s', async theme => {
  const page = await browser.newPage({ viewport: { width: 520, height: 350 }, reducedMotion: 'reduce' })
  try {
    await mount(page, { language: 'zh-CN', initial: { phase: 'downloading', availableVersion: '0.9.4', downloadPercent: 42 } })
    await page.addStyleTag({ content: readFileSync('src/renderer/src/styles/themes.generated.css', 'utf8') + '\nbody{margin:0;background:var(--shell-canvas);color:var(--shell-text);font:12px system-ui}' })
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
    const badge = page.locator('header button')
    await expect.poll(() => badge.textContent()).toContain('42%')
    expect(await page.getByRole('progressbar').getAttribute('value')).toBe('42')
    expect(await badge.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await badge.focus()
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['open-settings'])
    await page.screenshot({ path: `artifacts/updater-20261022/${theme}-downloading.png` })
    await page.evaluate(() => (window as any).emitState({ downloadPercent: 100 }))
    await expect.poll(() => badge.textContent()).toContain(zh.updater.verifying)
    expect(await page.getByRole('status').textContent()).toBe(zh.updater.verifying)
    expect(await page.getByRole('button', { name: zh.updater.restart, exact: true }).count()).toBe(0)
    await page.screenshot({ path: `artifacts/updater-20261022/${theme}-verifying.png` })
    await page.evaluate(() => (window as any).emitState({ phase: 'error', error: 'sha512 checksum mismatch' }))
    await expect.poll(() => badge.textContent()).toBe(zh.updater.badge.retryLabel)
    await page.getByRole('button', { name: zh.updater.retryDownload, exact: true }).waitFor()
    await badge.click()
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['open-settings', 'open-settings'])
    await page.screenshot({ path: `artifacts/updater-20261022/${theme}-failed.png` })
    await page.evaluate(() => (window as any).emitState({ phase: 'downloaded', error: null }))
    await expect.poll(() => badge.textContent()).toBe(zh.updater.badge.downloadedLabel)
    await page.getByRole('button', { name: zh.updater.restart, exact: true }).waitFor()
    await page.screenshot({ path: `artifacts/updater-20261022/${theme}-ready.png` })
  } finally { await page.close() }
})
afterAll(async () => { await browser?.close() })

async function mount(page: Page, options: Record<string, unknown> = {}) {
  page.setDefaultTimeout(3000)
  await page.setContent('<div id="root"></div>')
  await page.addStyleTag({ content: css })
  await page.evaluate(values => Object.assign(window, values), options)
  await page.addScriptTag({ content: script })
  await expect.poll(() => page.getByRole('checkbox').isEnabled()).toBe(true)
}

it.each(['en', 'zh-CN'])('requires explicit download and installation, with failure retry in %s', async language => {
  const page = await browser.newPage()
  const labels = (language === 'en' ? en : zh).updater
  try {
    await mount(page, { language, failDownload: true, deferDownload: true })
    await page.evaluate(() => (window as any).emitState({ phase: 'available', availableVersion: '0.9.2', releaseNotes: 'Background recovery notes' }))
    await page.getByText('Background recovery notes', { exact: true }).waitFor()
    expect(await page.evaluate(() => (window as any).calls)).toEqual([])
    await page.getByRole('button', { name: labels.download, exact: true }).click()
    await page.getByText(labels.downloading.replace('{{percent}}', '42'), { exact: true }).waitFor()
    expect(await page.getByRole('button', { name: labels.check, exact: true }).isDisabled()).toBe(true)
    await page.evaluate(() => (window as any).finishDownload())
    await page.getByRole('button', { name: labels.retryDownload, exact: true }).waitFor()
    await page.getByText('connection reset', { exact: false }).waitFor()
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['download'])
    await page.evaluate(() => { Object.assign(window, { failDownload: false, deferDownload: false }) })
    await page.getByRole('button', { name: labels.retryDownload, exact: true }).click()
    await page.getByRole('button', { name: labels.restart, exact: true }).waitFor()
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['download', 'download'])
    await page.evaluate(() => { (window as any).failInstall = true })
    await page.getByRole('button', { name: labels.restart, exact: true }).click()
    await page.getByText(labels.error.install, { exact: true }).waitFor()
    expect(await page.getByRole('button', { name: labels.restart, exact: true }).isEnabled()).toBe(true)
    await page.evaluate(() => { (window as any).failInstall = false })
    await page.getByRole('button', { name: labels.restart, exact: true }).click()
    await expect.poll(() => page.getByText(labels.error.install, { exact: true }).count()).toBe(0)
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['download', 'download', 'install', 'install'])
  } finally { await page.close() }
})

it('keeps notes and installation visible after a recheck error; badge opens settings', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, { initial: { phase: 'downloaded', availableVersion: '0.9.2', releaseNotes: 'Cached installer notes', downloadPercent: 100 } })
    await page.evaluate(() => (window as any).emitState({ error: 'offline' }))
    await page.getByText('Cached installer notes', { exact: true }).waitFor()
    await page.getByText('offline', { exact: false }).waitFor()
    expect(await page.getByRole('button', { name: en.updater.restart, exact: true }).isEnabled()).toBe(true)
    await page.getByRole('button', { name: en.updater.badge.downloaded.replace('{{version}}', '0.9.2'), exact: true }).click()
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['open-settings'])
    await page.evaluate(() => { (window as any).rejectInstall = true })
    await page.getByRole('button', { name: en.updater.restart, exact: true }).click()
    await page.getByText(en.updater.error.install, { exact: true }).waitFor()
    expect(await page.getByRole('button', { name: en.updater.restart, exact: true }).isEnabled()).toBe(true)
  } finally { await page.close() }
})
