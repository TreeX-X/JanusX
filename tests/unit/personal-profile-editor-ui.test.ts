import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import { build } from 'esbuild'

let browser: Browser
let script: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import {createRoot} from 'react-dom/client'
      import i18n from 'i18next'
      import {initReactI18next} from 'react-i18next'
      import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'
      import {PersonalProfileEditor} from './src/renderer/src/components/knowledge/PersonalProfileEditor'
      import {LegacyEpisodeMigrationControl} from './src/renderer/src/components/knowledge/LegacyEpisodeMigrationControl'
      window.calls=[];window.saved=0;window.mode='ok';window.context={hash:'a'.repeat(64),overrides:{identity:'Tree',toolPrefs:['pnpm']}}
      window.electron={knowledge:{
        personalProfileEditContext:async()=>{if(window.mode==='load-error')throw Error('unavailable');return window.context},
        forgetPersonalMemory:async input=>{window.calls.push(input);if(window.mode==='fail')throw Error('unavailable');window.context={hash:'b'.repeat(64),overrides:{identity:'Tree'}}},
        migrateLegacyEpisodes:async input=>{window.calls.push(input);if(window.mode==='fail')throw Error('changed');return {hash:'c'.repeat(64),files:input.expectedHash?0:1,episodes:input.expectedHash?0:2,migrated:input.expectedHash?2:0}},
        savePersonalProfile:async input=>{window.calls.push(input);if(window.mode==='stale')throw Error('Personal profile changed');if(window.mode==='fail')throw Error('unavailable');if(window.defer)await new Promise(resolve=>window.finish=resolve)}
      }}
      const root=createRoot(document.getElementById('root'))
      window.unmount=()=>root.render(null)
      window.migration=()=>root.render(<LegacyEpisodeMigrationControl/>)
      i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(()=>root.render(<PersonalProfileEditor onSaved={()=>window.saved++} onClose={window.unmount}/>))
    ` },
    bundle: true, write: false, outfile: 'profile-editor.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'i18n-host', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next';export default i18n;export const changeLanguage=lang=>i18n.changeLanguage(lang)", loader: 'ts' }))
    } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
})
afterAll(async () => { await browser?.close() })

describe('personal profile editor', () => {
  it('forgets the stored field after confirmation, retains failures, and reloads remaining overrides', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      const tools = page.getByRole('group', { name: 'Tool preferences' })
      await tools.getByRole('textbox').fill('unsaved draft')
      await tools.getByRole('button', { name: 'Forget this memory' }).click()
      expect(await page.locator('blockquote').textContent()).toBe('pnpm')
      expect(await page.evaluate(() => (window as any).calls)).toEqual([])
      await page.evaluate(() => { (window as any).mode = 'fail' })
      await page.getByRole('button', { name: 'Confirm forgetting' }).click()
      await page.getByRole('alert').waitFor()
      expect(await page.locator('blockquote').textContent()).toBe('pnpm')
      await page.evaluate(() => { (window as any).mode = 'ok' })
      await page.getByRole('button', { name: 'Confirm forgetting' }).click()
      await page.getByLabel('About you').waitFor()
      expect(await page.getByLabel('About you').inputValue()).toBe('Tree')
      expect(await tools.getByRole('textbox').count()).toBe(0)
      expect(await page.evaluate(() => (window as any).calls)).toEqual(Array(2).fill({targetId:'toolPrefs:0',targetHash:'a'.repeat(64),kind:'override'}))
    } finally { await page.close() }
  })

  it('requires a fresh migration preview after a stale confirmation fails', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByLabel('About you').waitFor()
      await page.evaluate(() => (window as any).migration())
      await page.getByRole('button', { name: 'Preview old recent memories' }).click()
      await page.getByRole('button', { name: 'Back up and migrate' }).waitFor()
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{}])
      await page.evaluate(() => { (window as any).mode = 'fail' })
      await page.getByRole('button', { name: 'Back up and migrate' }).click()
      await page.getByRole('alert').waitFor()
      expect(await page.getByRole('button', { name: 'Back up and migrate' }).count()).toBe(0)
      await page.evaluate(() => { (window as any).mode = 'ok' })
      await page.getByRole('button', { name: 'Preview old recent memories' }).click()
      await page.getByRole('button', { name: 'Back up and migrate' }).click()
      await page.getByRole('status').waitFor()
      expect(await page.getByRole('status').textContent()).toContain('2')
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{}, {expectedHash:'c'.repeat(64)}, {}, {expectedHash:'c'.repeat(64)}])
    } finally { await page.close() }
  })
  it('saves a cleared form with the displayed hash', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByLabel('About you').fill('')
      await page.getByRole('group', { name: 'Tool preferences' }).getByRole('textbox').fill('')
      await page.getByRole('button', { name: 'Save profile', exact: true }).click()
      await page.waitForFunction(() => (window as any).saved === 1)
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{ expectedHash: 'a'.repeat(64), overrides: {} }])
    } finally { await page.close() }
  })

  it('keeps failed drafts and requires reloading a stale snapshot', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByLabel('About you').fill('Draft')
      await page.evaluate(() => { (window as any).mode = 'fail' })
      await page.getByRole('button', { name: 'Save profile', exact: true }).click()
      await page.getByRole('alert').waitFor()
      expect(await page.getByLabel('About you').inputValue()).toBe('Draft')
      await page.evaluate(() => { (window as any).mode = 'stale' })
      await page.getByRole('button', { name: 'Save profile', exact: true }).click()
      await page.getByRole('button', { name: 'Reload current profile' }).waitFor()
      expect(await page.getByRole('button', { name: 'Save profile', exact: true }).isDisabled()).toBe(true)
      await page.evaluate(() => { (window as any).mode = 'ok'; (window as any).context = {hash:'b'.repeat(64),overrides:{identity:'Updated'}} })
      await page.getByRole('button', { name: 'Reload current profile' }).click()
      await page.waitForFunction(() => (document.querySelector('textarea') as HTMLTextAreaElement)?.value === 'Updated')
      await page.getByRole('button', { name: 'Save profile', exact: true }).click()
      await page.waitForFunction(() => (window as any).saved === 1)
      expect((await page.evaluate(() => (window as any).calls))[2].expectedHash).toBe('b'.repeat(64))
    } finally { await page.close() }
  })

  it('blocks duplicate saves and ignores completion after closing', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByLabel('About you').fill('New identity')
      await page.evaluate(() => { (window as any).defer = true })
      await page.getByRole('button', { name: 'Save profile', exact: true }).click()
      await page.waitForFunction(() => Boolean((window as any).finish))
      expect(await page.getByRole('button', { name: 'Save profile', exact: true }).isDisabled()).toBe(true)
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('form'))
      await page.evaluate(async () => { (window as any).finish(); await new Promise(resolve => setTimeout(resolve, 20)) })
      expect(await page.evaluate(() => ({ saved: (window as any).saved, count: (window as any).calls.length }))).toEqual({ saved: 0, count: 1 })
    } finally { await page.close() }
  })
})
