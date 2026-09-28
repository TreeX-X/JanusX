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
      import {MemoryReviewTool} from './src/renderer/src/components/knowledge/MemoryReviewTool'
      const candidate = (id, scope) => ({id,type:'fact',status:'proposed',derivation:'deterministic',evidence:{observationIds:['obs']},fact:{content:id,scope,kind:'preference',provenance:{workspaceId:scope==='user'?'user':'project-a',fileRefs:[]}}})
      window.items = [candidate('private-choice','user'),candidate('project-rule','project')]
      window.calls = []; window.failLoad = false; window.failAction = false; window.defer = false
      window.electron = {knowledge:{
        listCandidates:async()=>{if(window.failLoad)throw Error('unavailable');return window.items},
        listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],
        applyCandidate:async input=>{window.calls.push(input);if(window.failAction)throw Error('review failed');if(window.defer)await new Promise(resolve=>window.finish=resolve);window.items=window.items.filter(item=>item.id!==input.id)},
        rejectCandidate:async input=>{window.calls.push(input);window.items=window.items.filter(item=>item.id!==input.id)}
      }}
      i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(()=>createRoot(document.getElementById('root')).render(<MemoryReviewTool active={true}/>))
    ` },
    bundle: true, write: false, outfile: 'memory-review-test.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'test-i18n-init', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage = lang => i18n.changeLanguage(lang)", loader: 'ts' }))
    } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
})
afterAll(async () => { await browser?.close() })

describe('memory review browser interactions', () => {
  it('filters without changing ownership, blocks duplicate actions, and updates both counts', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Personal memory 1', exact: true }).click()
      expect(await page.locator('article').count()).toBe(1)
      expect(await page.locator('article').innerText()).toContain('private-choice')
      await page.evaluate(() => { (window as any).defer = true })
      await page.getByRole('button', { name: 'Approve', exact: true }).click()
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled()).toBe(true)
      await page.evaluate(() => (window as any).finish())
      await page.getByRole('button', { name: 'Personal memory 0', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Engineering knowledge 1', exact: true }).click()
      await page.getByRole('button', { name: 'Reject', exact: true }).click()
      await page.getByRole('button', { name: 'All 0', exact: true }).waitFor()
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{ type: 'fact', id: 'private-choice' }, { type: 'fact', id: 'project-rule' }])
    } finally { await page.close() }
  })

  it('keeps failed reviews visible and requires a successful refresh before retrying', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.evaluate(() => { (window as any).failAction = true })
      await page.getByRole('button', { name: 'Approve', exact: true }).first().click()
      await page.getByRole('alert').waitFor()
      expect(await page.locator('article').count()).toBe(2)
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).first().isDisabled()).toBe(true)
      await page.evaluate(() => { (window as any).failLoad = true })
      await page.getByRole('button', { name: 'Refresh Knowledge Engine' }).click()
      await page.getByText('Knowledge workbench load failed', { exact: true }).waitFor()
      expect(await page.getByRole('button', { name: 'All 0', exact: true }).count()).toBe(0)
      await page.evaluate(() => { (window as any).failLoad = false })
      await page.getByRole('button', { name: 'Refresh Knowledge Engine' }).click()
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).first().isEnabled()).toBe(true)
    } finally { await page.close() }
  })
})
