import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import { build } from 'esbuild'

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
      import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'
      import {useExperimentalStore} from './src/renderer/src/stores/experimental'
      useExperimentalStore.setState({loaded:true,knowledge:true,persona:true})
      import {MemoryReviewTool} from './src/renderer/src/components/knowledge/MemoryReviewTool'
      import {reviewCandidateInput} from './src/shared/review-candidate-snapshot'
      import {useAssistantPendingCount} from './src/renderer/src/components/knowledge/useAssistantPendingCount'
      import './src/renderer/src/styles/globals.css'
      import './src/renderer/src/styles/themes.generated.css'
      const candidate = (id, scope) => ({id,type:'fact',status:'proposed',derivation:'deterministic',evidence:{observationIds:['obs']},fact:{content:id,scope,kind:'preference',provenance:{workspaceId:scope==='user'?'user':'project-a',fileRefs:[]}}})
      window.items = [candidate('private-choice','user'),candidate('project-rule','project')]
      window.calls = []; window.failLoad = false; window.failAction = false; window.defer = false
      window.autoStatus ??= {reviewStateVersion:1,enabled:false,running:false,stages:{extraction:'rules-only',entryReview:'automatic',wikiGeneration:'automatic',wikiReview:'automatic'},queue:[],counts:{pending:0,running:0,succeeded:0,'needs-review':0,failed:0,cancelled:0},total:0,tasks:[]}
      const checkSnapshot = async input => {
        const current = window.items.find(item => item.id === input.id)
        if (!current || (await reviewCandidateInput(current)).candidateHash !== input.candidateHash) throw Error('Candidate changed')
      }
      window.electron = {knowledge:{
        automationStatus:async()=>{if(window.failStatus)throw Error('unavailable');const value=structuredClone(window.autoStatus);for(const task of value.queue){const item=window.items.find(row=>row.id===task.subject);if(item){task.workspaceId=item.fact.provenance.workspaceId;task.candidateHash=(await reviewCandidateInput(item)).candidateHash}}return value},
        automationRun:async()=>{window.calls.push('run')},
        factReviewContext:async()=>{if(window.failContext)throw Error('unavailable');return window.conflictContext ?? {targets:[],competing:[]}},
        candidateAction:async input=>{window.calls.push(input);if(window.defer)await new Promise(resolve=>window.finish=resolve)},
        importLegacyPersonalMemory:async()=>{window.imports=(window.imports||0)+1;window.items.push({...candidate('old-profile','user'),legacySource:{kind:'profile',id:'identity',hash:'source'}});return {created:1,remaining:0}},
        listCandidates:async()=>{if(window.failLoad)throw Error('unavailable');return window.items},
        listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],
        applyCandidate:async input=>{window.calls.push(input);await checkSnapshot(input);if(window.failAction)throw Error(typeof window.failAction==='string'?window.failAction:'review failed');if(window.defer)await new Promise(resolve=>window.finish=resolve);window.items=window.items.filter(item=>item.id!==input.id)},
        rejectCandidate:async input=>{window.calls.push(input);await checkSnapshot(input);window.items=window.items.filter(item=>item.id!==input.id)}
      }}
      function Badge(){const count=useAssistantPendingCount();return <output hidden aria-label='Human review badge'>{count??'unknown'}</output>}
      i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(()=>createRoot(document.getElementById('root')).render(<>{window.showBadge&&<Badge/>}<MemoryReviewTool active={true}/></>))
    ` },
    bundle: true, write: false, outfile: 'memory-review-test.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'test-i18n-init', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage = lang => i18n.changeLanguage(lang)", loader: 'ts' }))
    } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })

describe('memory review browser interactions', () => {
  it('separates automatic candidates and human counts, then follows failures and personal filtering', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 850 } })
    page.setDefaultTimeout(4000)
    try {
      await page.clock.install()
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.addStyleTag({ content: css + '\n#root{height:100vh}body{margin:0}*{box-sizing:border-box}' })
      await page.evaluate(() => { (window as any).showBadge = true; document.documentElement.dataset.theme = 'dark' })
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.evaluate(() => {
        const state = window as any
        state.autoStatus.enabled = true
        state.autoStatus.queue = [{stage:'entryReview',subject:'project-rule',status:'pending'}]
      })
      await page.clock.runFor(15050)
      await page.getByRole('heading', { name: 'Pending candidates · 2' }).waitFor()
      expect(await page.getByLabel('Human review badge').innerText()).toBe('1')
      await page.getByText('Waiting for new material', { exact: true }).waitFor({ state: 'hidden' })
      expect(await page.getByText('Tasks queued · 1', { exact: true }).isVisible()).toBe(true)
      expect(await page.getByRole('button', { name: 'Run once now', exact: true }).isVisible()).toBe(false)
      await page.getByText('Queued for automatic review', { exact: true }).waitFor()
      const automatic = page.locator('article').filter({ hasText: 'project-rule' })
      expect(await automatic.getByRole('button').count()).toBe(0)
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).count()).toBe(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({path:'artifacts/memory-domain-acceptance/review-automation-queued.png',animations:'disabled'})
      await page.getByRole('button', { name: 'Personal memory 1', exact: true }).click()
      expect(await page.getByRole('region', { name: 'Automation progress' }).count()).toBe(0)
      await page.getByText('Personal memories need your confirmation and are excluded from automatic project review.', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'All 2', exact: true }).click()
      await page.evaluate(() => { (window as any).autoStatus.queue[0].status = 'needs-review' })
      await page.clock.runFor(15050)
      await page.getByRole('heading', { name: 'Pending candidates · 2' }).waitFor()
      expect(await page.getByLabel('Human review badge').innerText()).toBe('2')
      expect(await page.getByText('Processing automatically · 1', { exact: true }).count()).toBe(0)
      expect(await automatic.getByRole('button', { name: 'Approve', exact: true }).isEnabled()).toBe(true)
      expect(await page.evaluate(() => (window as any).calls)).toEqual([])
    } finally { await page.close() }
  })

  it('shows configured stages, live execution and unknown status without treating historical failures as current', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 850 }, reducedMotion: 'reduce' })
    page.setDefaultTimeout(4000)
    try {
      await page.clock.install()
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.addStyleTag({ content: css + '\n#root{height:100vh}body{margin:0}*{box-sizing:border-box}' })
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.evaluate(() => {
        const state = window as any
        state.autoStatus.enabled = true
        state.autoStatus.stages.wikiReview = 'manual'
        state.autoStatus.running = true
        state.autoStatus.queue = [{stage:'entryReview',subject:'project-rule',status:'running'}]
        state.autoStatus.counts.failed = 8
        document.documentElement.dataset.theme = 'planche'
      })
      await page.clock.runFor(10050)
      const automation = page.getByRole('region', { name: 'Automation progress', exact: true })
      await automation.getByText('Partly automatic', { exact: true }).waitFor()
      expect(await automation.getByText('Processing: Entry review', { exact: true }).isVisible()).toBe(true)
      expect(await automation.getByText(/Current tasks:/).count()).toBe(0)
      expect(await automation.getByText('Scope and processing stages', { exact: true }).count()).toBe(0)
      expect(await automation.getByRole('button', { name: 'Automation settings', exact: true }).isVisible()).toBe(true)
      expect(await automation.getByRole('button', { name: 'Run once now', exact: true }).count()).toBe(0)
      expect(await automation.locator('svg').evaluateAll(items => items.every(item => getComputedStyle(item).animationName === 'none'))).toBe(true)
      await page.screenshot({path:'artifacts/memory-domain-acceptance/review-automation-running.png',animations:'disabled'})
      await page.evaluate(() => { (window as any).failStatus = true })
      await page.clock.runFor(10050)
      await automation.getByRole('alert').waitFor()
      await page.getByRole('heading', { name: 'Pending candidates · 2' }).waitFor()
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).count()).toBe(1)
      await page.getByText('Review status unavailable. Refresh to continue.', { exact: true }).waitFor()
      await page.evaluate(() => { const state=window as any; state.failStatus=false; state.autoStatus.enabled=false; state.autoStatus.running=false; state.autoStatus.queue=[] })
      await page.clock.runFor(10050)
      await automation.getByText('Automatic processing is off', { exact: true }).waitFor()
      expect(await automation.getByRole('button', { name: 'Run once now', exact: true }).count()).toBe(0)
      await page.getByRole('heading', { name: 'Pending candidates · 2' }).waitFor()
    } finally { await page.close() }
  })

  it('shows the old value and requires explicit replacement confirmation', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.evaluate(() => { (window as any).conflictContext = { factKey: 'response.language', targets: [{ id: 'old', hash: 'a'.repeat(64), content: 'Default output language: Chinese', version: 3 }], competing: [{ id: 'peer', content: 'Default output language: English' }] } })
      await page.addScriptTag({ content: script })
      const card = page.locator('article').first()
      await card.getByText('Default output language: Chinese', { exact: true }).waitFor()
      expect(await card.innerText()).toContain('Current fact · version 3')
      expect(await card.innerText()).toContain('Other pending values')
      expect(await card.getByRole('button', { name: 'Approve replacement', exact: true }).isDisabled()).toBe(true)
      await card.getByRole('checkbox').check()
      await card.getByRole('button', { name: 'Approve replacement', exact: true }).click()
      await page.getByRole('button', { name: 'All 1', exact: true }).waitFor()
      const calls = await page.evaluate(() => (window as any).calls)
      expect(calls[0].replacement).toEqual({ id: 'old', hash: 'a'.repeat(64) })
    } finally { await page.close() }
  })

  it('blocks approval on a failed conflict read and retries without changing the candidate', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.evaluate(() => { (window as any).failContext = true })
      await page.addScriptTag({ content: script })
      const card = page.locator('article').first()
      await card.getByRole('alert').waitFor()
      expect(await card.getByRole('button', { name: 'Approve', exact: true }).isDisabled()).toBe(true)
      expect(await page.evaluate(() => (window as any).calls)).toEqual([])
      await page.evaluate(() => { (window as any).failContext = false })
      await card.getByRole('button', { name: 'Refresh conflict check' }).click()
      await page.waitForFunction(() => [...document.querySelectorAll('article button')].some(button => button.textContent === 'Approve' && !(button as HTMLButtonElement).disabled))
      expect(await card.getByRole('button', { name: 'Approve', exact: true }).isEnabled()).toBe(true)
    } finally { await page.close() }
  })
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
  it('removes obsolete scoring and refinement actions', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/memory', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/memory')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      const card = page.locator('article').filter({ hasText: 'project-rule' })
      await card.getByRole('button', { name: 'Approve', exact: true }).waitFor()
      expect(await card.getByRole('button', { name: /Score|refinement/i }).count()).toBe(0)
      expect(await page.evaluate(() => (window as any).calls)).toEqual([])
    } finally { await page.close() }
  })
  it('imports old records into the personal review filter without automatically approving them', async () => {
    const page = await browser.newPage()
    try {
      await page.route('http://localhost/review', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
      await page.goto('http://localhost/review')
      await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'All 2', exact: true }).waitFor()
      await page.locator('footer').getByText('More actions', { exact: true }).click()
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
