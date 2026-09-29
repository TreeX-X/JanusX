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
      import {reviewCandidateInput} from './src/shared/review-candidate-snapshot'
      const candidate = (id, scope) => ({id,type:'fact',status:'proposed',derivation:'deterministic',evidence:{observationIds:['obs']},fact:{content:id,scope,kind:'preference',provenance:{workspaceId:scope==='user'?'user':'project-a',fileRefs:[]}}})
      window.items = [candidate('private-choice','user'),candidate('project-rule','project')]
      window.calls = []; window.failLoad = false; window.failAction = false; window.defer = false
      const checkSnapshot = async input => {
        const current = window.items.find(item => item.id === input.id)
        if (!current || (await reviewCandidateInput(current)).candidateHash !== input.candidateHash) throw Error('Candidate changed')
      }
      window.electron = {knowledge:{
        candidateAction:async input=>{window.calls.push(input);if(window.defer)await new Promise(resolve=>window.finish=resolve)},
        importLegacyPersonalMemory:async()=>{window.imports=(window.imports||0)+1;window.items.push({...candidate('old-profile','user'),legacySource:{kind:'profile',id:'identity',hash:'source'}});return {created:1,remaining:0}},
        listCandidates:async()=>{if(window.failLoad)throw Error('unavailable');return window.items},
        listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],
        applyCandidate:async input=>{window.calls.push(input);await checkSnapshot(input);if(window.failAction)throw Error(typeof window.failAction==='string'?window.failAction:'review failed');if(window.defer)await new Promise(resolve=>window.finish=resolve);window.items=window.items.filter(item=>item.id!==input.id)},
        rejectCandidate:async input=>{window.calls.push(input);await checkSnapshot(input);window.items=window.items.filter(item=>item.id!==input.id)}
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
  it('retains the displayed snapshot until refresh after a background edit', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.evaluate(() => {
        const state = window as any
        state.items = state.items.map((item: any) => item.id === 'private-choice' ? { ...item, fact: { ...item.fact, content: 'Updated private preference' } } : item)
      })
      await page.getByRole('button', { name: 'Approve', exact: true }).first().click()
      await page.getByRole('alert').waitFor()
      expect(await page.locator('article').first().innerText()).toContain('private-choice')
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).first().isDisabled()).toBe(true)
      await page.getByRole('button', { name: 'Refresh Knowledge Engine' }).click()
      await page.getByText('Updated private preference', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Approve', exact: true }).first().click()
      await page.getByRole('button', { name: 'All 1', exact: true }).waitFor()
      const calls = await page.evaluate(() => (window as any).calls)
      expect(calls[0].candidateHash).not.toBe(calls[1].candidateHash)
    } finally { await page.close() }
  })
  it('submits a hashed candidate action without approval and blocks duplicate actions', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/memory', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/memory')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.evaluate(() => { (window as any).defer = true })
      const card = page.locator('article').filter({ hasText: 'private-choice' })
      await card.getByRole('button', { name: 'Queue LLM refinement', exact: true }).click()
      await page.waitForFunction(() => (window as any).calls.length === 1)
      expect(await card.getByRole('button', { name: 'Approve', exact: true }).isDisabled()).toBe(true)
      const calls = await page.evaluate(() => (window as any).calls)
      expect(calls).toEqual([{ candidateId: 'private-choice', candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/), action: 'refine' }])
      await page.waitForFunction(() => typeof (window as any).finish === 'function')
      await page.evaluate(() => (window as any).finish())
      await page.getByText(/Refinement submitted/).waitFor()
      expect(await page.locator('article').count()).toBe(2)
    } finally { await page.close() }
  })
  it('imports old records into the personal review filter without automatically approving them', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Import old personal records for review', exact: true }).click()
      await page.getByText('Added 1 records for review; 0 more can be imported.', { exact: true }).waitFor()
      expect(await page.getByRole('button', { name: 'Personal memory 2', exact: true }).getAttribute('aria-pressed')).toBe('true')
      expect(await page.locator('article').count()).toBe(2)
      const legacy = page.locator('article').filter({ hasText: 'old-profile' })
      expect(await legacy.innerText()).toContain('confirm its content again')
      expect(await page.evaluate(() => (window as any).calls)).toEqual([])
      await legacy.getByRole('button', { name: 'Approve', exact: true }).click()
      await page.getByRole('button', { name: 'Personal memory 1', exact: true }).waitFor()
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{ type: 'fact', id: 'old-profile', candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/) }])
    } finally { await page.close() }
  })
  it('filters without changing ownership, blocks duplicate actions, and updates both counts', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Personal memory 1', exact: true }).click()
      expect(await page.locator('article').count()).toBe(1)
      expect(await page.locator('article').innerText()).toContain('private-choice')
      await page.evaluate(() => { (window as any).defer = true })
      await page.getByRole('button', { name: 'Approve', exact: true }).click()
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled()).toBe(true)
      await page.waitForFunction(() => typeof (window as any).finish === 'function')
      await page.evaluate(() => (window as any).finish())
      await page.getByRole('button', { name: 'Personal memory 0', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Engineering knowledge 1', exact: true }).click()
      await page.getByRole('button', { name: 'Reject', exact: true }).click()
      await page.getByRole('button', { name: 'All 0', exact: true }).waitFor()
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{ type: 'fact', id: 'private-choice', candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/) }, { type: 'fact', id: 'project-rule', candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/) }])
    } finally { await page.close() }
  })

  it('keeps failed reviews visible and requires a successful refresh before retrying', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
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
      await page.evaluate(() => { (window as any).failAction = 'Legacy memory source changed' })
      await page.getByRole('button', { name: 'Approve', exact: true }).first().click()
      await page.getByText('The old source changed or the candidate no longer matches. Refresh, reject the old candidate, then import the records again.', { exact: true }).waitFor()
    } finally { await page.close() }
  })
})
