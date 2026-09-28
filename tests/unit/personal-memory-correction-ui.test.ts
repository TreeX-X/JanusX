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
      import {UserPersonaTool} from './src/renderer/src/components/knowledge/UserPersonaTool'
      window.calls=[];window.opens=[];window.reads=0;window.mode='proposed'
      window.memory={id:'old',content:'Use pnpm',contentHash:'a'.repeat(64),confirmed:true,observationIds:[]}
      window.electron={knowledge:{
        userMemoryOverview:async()=>{window.reads++;return {profile:{version:1,updatedAt:'2026-09-28'},habits:window.forgotten?[]:[window.memory],recent:window.events??[],pendingHabitCount:0}},
        forgetPersonalMemory:async input=>{window.calls.push(input);if(window.mode==='stale')throw Error('stale');if(window.defer)await new Promise(resolve=>window.finish=resolve);if(input.kind==='episode')window.events=[];else window.forgotten=true},
        proposePersonalMemoryCorrection:async input=>{window.calls.push(input);if(window.mode==='stale')throw Error('Personal correction target changed');if(window.defer)await new Promise(resolve=>window.finish=resolve);return {candidateId:'correction',status:window.mode}}
      }}
      const root=createRoot(document.getElementById('root'))
      window.renderActive=active=>root.render(<UserPersonaTool active={active}/>)
      window.unmount=()=>root.render(null)
      i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(()=>window.renderActive(true))
    ` },
    bundle: true, write: false, outfile: 'personal-correction-test.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'test-host', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage = lang => i18n.changeLanguage(lang)", loader: 'ts' }))
      builder.onLoad({ filter: /[/\\]stores[/\\]right-tools\.ts$/ }, () => ({ contents: 'const state={openTool:id=>window.opens.push(id)};export const useRightToolStore=select=>select(state)', loader: 'ts' }))
    } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
})
afterAll(async () => { await browser?.close() })

describe('personal memory correction UI', () => {
  it('forgets a selected recent episode with its displayed source hash', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Correct this memory', exact: true }).waitFor()
      await page.evaluate(() => { (window as any).events=[{id:'recent',content:'Recent event',contentHash:'b'.repeat(64),createdAt:'2026-09-29',expiresAt:'2099-01-01',tags:[]}];(window as any).renderActive(false) })
      await page.evaluate(() => (window as any).renderActive(true))
      await page.getByText('Recent event', {exact:true}).waitFor()
      await page.getByRole('button', { name: 'Forget this memory', exact: true }).last().click()
      await page.getByRole('button', { name: 'Confirm forgetting', exact: true }).click()
      await page.getByRole('button', { name: 'Correct this memory', exact: true }).waitFor()
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{targetId:'recent',targetHash:'b'.repeat(64),kind:'episode'}])
      expect(await page.getByText('Recent event',{exact:true}).count()).toBe(0)
    } finally { await page.close() }
  })
  it('requires explicit forgetting confirmation, retains failure, and refreshes after retry', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Forget this memory', exact: true }).click()
      expect(await page.evaluate(() => (window as any).calls)).toEqual([])
      await page.evaluate(() => { (window as any).mode = 'stale' })
      await page.getByRole('button', { name: 'Confirm forgetting', exact: true }).click()
      await page.getByRole('alert').waitFor()
      await page.evaluate(() => { (window as any).mode = 'proposed'; (window as any).defer = true })
      await page.getByRole('button', { name: 'Confirm forgetting', exact: true }).click()
      expect(await page.getByRole('button', { name: 'Confirm forgetting', exact: true }).isDisabled()).toBe(true)
      await page.evaluate(() => (window as any).finish())
      await page.getByRole('button', { name: 'Refresh Knowledge Engine', exact: true }).waitFor()
      expect(await page.getByRole('button', { name: 'Forget this memory', exact: true }).count()).toBe(0)
      expect(await page.evaluate(() => (window as any).calls)).toEqual([
        { targetId: 'old', targetHash: 'a'.repeat(64) }, { targetId: 'old', targetHash: 'a'.repeat(64) },
      ])
    } finally { await page.close() }
  })
  it('does not reopen review after the user closes the tool during submission', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Correct this memory', exact: true }).click()
      await page.getByLabel('Corrected content').fill('Use npm')
      await page.evaluate(() => { (window as any).defer = true })
      await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
      await page.evaluate(() => (window as any).unmount())
      await page.waitForFunction(() => document.getElementById('root')!.children.length === 0)
      await page.evaluate(async () => { (window as any).finish(); await new Promise(resolve => setTimeout(resolve, 0)) })
      expect(await page.evaluate(() => (window as any).opens)).toEqual([])
    } finally { await page.close() }
  })
  it('preserves a draft across activation, blocks duplicate submissions, and opens review without changing the displayed fact', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Correct this memory', exact: true }).click()
      expect(await page.getByRole('button', { name: 'Submit for review', exact: true }).isDisabled()).toBe(true)
      await page.getByLabel('Corrected content').fill('Use npm')
      await page.evaluate(() => (window as any).renderActive(false))
      await page.evaluate(() => (window as any).renderActive(true))
      await page.waitForFunction(() => (window as any).reads >= 2)
      expect(await page.getByLabel('Corrected content').inputValue()).toBe('Use npm')
      await page.evaluate(() => { (window as any).defer = true })
      await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
      expect(await page.getByRole('button', { name: 'Submit for review', exact: true }).isDisabled()).toBe(true)
      expect(await page.getByLabel('Corrected content').isDisabled()).toBe(true)
      await page.evaluate(() => (window as any).finish())
      await page.waitForFunction(() => (window as any).opens.length === 1)
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{ targetId: 'old', targetHash: 'a'.repeat(64), content: 'Use npm' }])
      expect(await page.evaluate(() => (window as any).opens)).toEqual(['review'])
      expect(await page.locator('body').innerText()).toContain('Use pnpm')
    } finally { await page.close() }
  })

  it('retains text after stale rejection and refreshes the target when the editor is reopened', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Correct this memory', exact: true }).click()
      await page.getByLabel('Corrected content').fill('My correction')
      await page.evaluate(() => { (window as any).mode = 'stale' })
      await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
      await page.getByRole('alert').waitFor()
      expect(await page.getByLabel('Corrected content').inputValue()).toBe('My correction')
      expect(await page.evaluate(() => (window as any).opens)).toEqual([])
      await page.evaluate(() => { (window as any).memory = { ...(window as any).memory, content: 'Updated source', contentHash: 'b'.repeat(64) }; (window as any).mode = 'rejected' })
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByRole('button', { name: 'Correct this memory', exact: true }).click()
      expect(await page.getByLabel('Corrected content').inputValue()).toBe('Updated source')
      await page.getByLabel('Corrected content').fill('Different correction')
      await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
      await page.getByText('This correction was already processed or rejected. Change the content before submitting again.', { exact: true }).waitFor()
      expect((await page.evaluate(() => (window as any).calls))[1].targetHash).toBe('b'.repeat(64))
    } finally { await page.close() }
  })
})
