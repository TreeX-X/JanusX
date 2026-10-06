import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'

let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client'
    import i18n from 'i18next'; import {initReactI18next} from 'react-i18next'
    import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'
    import {MemoryReviewTool} from './src/renderer/src/components/knowledge/MemoryReviewTool'
    import {Inspector,KnowledgeWorkbench} from './src/renderer/src/components/knowledge/KnowledgeWorkbench'
    import {useKnowledgeAutomation,refreshKnowledgeAutomation} from './src/renderer/src/services/knowledge-automation'
    import {useExperimentalStore} from './src/renderer/src/stores/experimental'
    import {reviewCandidateInput} from './src/shared/review-candidate-snapshot'
    import './src/renderer/src/styles/globals.css'
    import './src/renderer/src/styles/themes.generated.css'
    const candidate = {id:'candidate',type:'fact',status:'proposed',derivation:'deterministic',evidence:{observationIds:[]},
      fact:{id:'fact',content:'Keep backups for seven days.',scope:'project',kind:'procedure',files:[],concepts:[],tags:[],
        provenance:{workspaceId:'project',workspaceName:'Project',fileRefs:[],sourceObservationIds:[]}},
      decision:{status:'old',reason:'Old advisory reason',scorer:{provider:'laya'},answers:[]}}
    window.item = candidate; window.pages=[]; window.reads = 0; window.actions = []
    window.current={reviewStateVersion:1,reviewEnabled:true,enabled:true,running:false,queue:[],tasks:[],total:0,
      stages:{extraction:'rules-only',entryReview:'automatic',wikiGeneration:'automatic',wikiReview:'automatic'},
      counts:{pending:0,running:0,succeeded:0,failed:0,'needs-review':0,cancelled:0}}
    window.refresh = refreshKnowledgeAutomation
    window.setTask = async status => {
      window.current.queue=[{id:'current-task',stage:'entryReview',subject:'candidate',workspaceId:'project',
        candidateHash:(await reviewCandidateInput(window.item)).candidateHash,status,canRetry:status==='failed',reason:status==='failed'?'Missing source context':undefined}]
      await window.refresh()
    }
    window.electron={knowledge:{
      listCandidates:async()=>window.item.type==='fact'?[structuredClone(window.item)]:[],
      listWikiPatchCandidates:async()=>window.item.type==='wiki-patch'?[structuredClone(window.item)]:[],
      listGraphCandidates:async()=>window.item.type==='graph-edge'?[structuredClone(window.item)]:[],
      listTruth:async()=>{if(window.failTruth)throw Error('unavailable');return {facts:[],wikiPages:structuredClone(window.pages),graphEdges:[]}},
      listObservations:async()=>[],listAudit:async()=>[],retentionStats:async()=>({}),getSettings:async()=>({mode:'auto'}),listConflicts:async()=>[],processingStats:async()=>null,
      noteWikiStatuses:async()=>{if(window.failNotes)throw Error('Note read failed');return (window.item.sourceNoteRefs??[]).map(ref=>({...ref,status:window.noteState??'fresh'}))},
      observationRevocationContext:async input=>{window.sourceReads=(window.sourceReads??[]).concat([input]);const result={content:window.sourceBody??'Full source text',revoked:!!window.revoked};if(window.delaySource)await new Promise(resolve=>window.releaseSource=resolve);if(window.failSource)throw Error('source failed');return result},
      automationStatus:async()=>{window.reads++;const captured=structuredClone(window.current);if(window.delay)await new Promise(resolve=>window.release=resolve);if(window.fail)throw Error('unavailable');return captured},
      automationRetry:async id=>{window.actions.push(['retry',id]);window.current.queue[0].status='pending';window.current.queue[0].canRetry=false},
      automationRun:async()=>{window.actions.push(['run'])},
      factReviewContext:async()=>structuredClone(window.conflictContext??{targets:[],competing:[]}),
      applyCandidate:async input=>{window.actions.push(['approve',input])},rejectCandidate:async input=>{window.actions.push(['reject',input])}
    }}
    useExperimentalStore.setState({loaded:true,knowledge:true,persona:false})
    function Detail(){const {status}=useKnowledgeAutomation(true);const [version,setVersion]=React.useState(0);window.redraw=()=>setVersion(v=>v+1)
      const snapshot={factCandidates:window.item.type==='fact'?[window.item]:[],wikiPatches:window.item.type==='wiki-patch'?[window.item]:[],graphCandidates:window.item.type==='graph-edge'?[window.item]:[],wikiPages:window.pages,conflicts:[],usingDemoData:false}
      return <div style={{height:'100%'}} data-version={version}><Inspector automation={status} record={window.detailClosed?null:window.record??{id:window.item.id,reviewType:window.item.type,status:window.item.status}} snapshot={snapshot} busy={!!window.busy} error='' onApprove={replacement=>window.actions.push(['approve',replacement])} onReject={()=>window.actions.push(['reject'])} onRevoke={()=>window.actions.push(['revoke'])} onCloseDetail={()=>{window.detailClosed=true;window.redraw()}}/></div>}
    const root=createRoot(document.getElementById('root'))
    window.show=()=>root.render(<><div id='sidebar'><MemoryReviewTool active domain='engineering'/></div><div id='inspector'><Detail/></div></>)
    window.hide=()=>root.render(null)
    window.showWorkbench=()=>root.render(<KnowledgeWorkbench isOpen onClose={()=>window.workbenchClosed=true}/>)
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(window.show)
  ` }, loader: { '.svg': 'dataurl' }, bundle: true, write: false, outfile: 'review-state-ui.js', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'i18n-fixture', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage=()=>{}", loader: 'ts' }))
  } }] })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })

async function useLongCandidate(page: Page, kind: 'fact' | 'wiki-patch' = 'fact') {
  await page.evaluate(kind => {
    const w = window as any
    const provenance = { workspaceId: 'project', workspaceName: 'Project', fileRefs: [], sourceObservationIds: ['source-1'] }
    const content = '# Backup policy\n\n' + 'Keep backups for thirty days. '.repeat(120) + '\n\n' + 'long-id-'.repeat(90)
    const evidence = { observationIds: ['source-1'], sources: [{ observationId: 'source-1', workspaceId: 'project', speaker: 'user', authority: 'user', excerpt: '<script>sourceAttack()</script> Source excerpt' }] }
    w.item = kind === 'fact' ? { ...w.item, conflicts: [], evidence, fact: { ...w.item.fact, content, provenance } } : {
      id: 'wiki-candidate', type: kind, status: 'proposed', derivation: 'llm', conflicts: [], evidence, provenance,
      title: 'Backup policy draft', pageSlug: 'backup', confidence: 1, expectedVersion: 3, reviewMode: 'full-page',
      patchMarkdown: content + '\n\n| Field | Value |\n| --- | --- |\n| Retention | Thirty days |\n\n```js\n' + 'longCode'.repeat(100) + '\n```\n\n<script>window.attacked=true</script>\n\n[unsafe](javascript:alert(1))\n\n![remote](https://example.invalid/pixel.png)',
      rationale: 'Review the new retention policy and relationship.', sourceFactIds: ['source-fact'],
      sourceNoteRefs: [{ uri: 'note://repo/source', sourceHash: 'recorded-hash' }],
      relations: [{ type: 'depends_on', target: { workspaceId: 'project', slug: 'policy', title: 'Retention policy', version: 2, contentHash: 'a'.repeat(64) }, sourceFactIds: ['source-fact'], reason: 'Backups follow the retention policy.' }],
    }
    w.pages = [{ workspaceId: 'project', slug: 'backup', title: 'Backup policy', markdown: '# Published baseline\nSeven days.', version: 3, status: 'published', sourceFactIds: ['old-fact'], tags: [], relations: [] }]
    w.sourceBody = 'Full source line\n'.repeat(300) + 'END-OF-SOURCE'
    w.redraw(); window.dispatchEvent(new Event('janusx-memory-changed'))
  }, kind)
  await page.locator(`[data-review-type="${kind}"]`).nth(1).waitFor({ state: 'attached' })
}

for (const theme of ['dark', 'planche']) {
  for (const width of [320, 390]) {
    it(`keeps long Wiki reading and actions reachable in ${theme} at ${width}px`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 720 } })
      try {
        await mount(page)
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
        await page.addStyleTag({ content: '#root{display:block;height:100vh}#sidebar{width:100%;height:100%}#inspector{display:none}' })
        await useLongCandidate(page, 'wiki-patch')
        const card = page.locator('#sidebar article')
        const approve = card.getByRole('button', { name: 'Approve and publish', exact: true })
        await expect.poll(() => approve.isEnabled()).toBe(true)
        const reading = card.getByLabel('Knowledge and evidence', { exact: true })
        await reading.locator('summary').filter({ hasText: 'Read full source' }).click()
        await reading.getByText('END-OF-SOURCE', { exact: false }).waitFor()
        await expect.poll(() => approve.isEnabled()).toBe(true)
        expect(await card.locator('table').count()).toBe(1)
        expect(await card.locator('img,script,a[href^="javascript:"]').count()).toBe(0)
        expect(await page.evaluate(() => (window as any).attacked)).toBeUndefined()
        const geometry = await card.evaluate(element => {
          const footer = element.querySelector('footer')!.getBoundingClientRect()
          const box = element.getBoundingClientRect()
          const read = element.querySelector('[aria-label="Knowledge and evidence"]')!
          return { footerInside: footer.bottom <= box.bottom + 1, readingScrolls: read.scrollHeight > read.clientHeight, overflow: element.scrollWidth > element.clientWidth, viewportOverflow: document.documentElement.scrollWidth > innerWidth }
        })
        expect(geometry).toEqual({ footerInside: true, readingScrolls: true, overflow: false, viewportOverflow: false })
        await page.keyboard.press('Tab')
        await approve.focus()
        expect(await approve.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
        await page.screenshot({ path: `artifacts/knowledge-s2-browser/sidebar-${theme}-${width}.png`, animations: 'disabled' })
      } finally { await page.close() }
    })
  }
}

it('compares the published Wiki version and relationship bindings, blocking stale or unreadable sources', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  try {
    await mount(page); await useLongCandidate(page, 'wiki-patch')
    const detail = page.locator('#inspector')
    const approve = detail.getByRole('button', { name: 'Approve and publish', exact: true })
    const compare = detail.locator('details').filter({ has: page.locator('summary', { hasText: 'Compare with published page' }) })
    await compare.locator(':scope > summary').click()
    await compare.getByText('Seven days.', { exact: true }).waitFor()
    await compare.getByRole('heading', { name: 'Proposed replacement', exact: true }).waitFor()
    await expect.poll(() => approve.isEnabled()).toBe(true)
    await detail.getByText('Relationship source bindings', { exact: true }).first().click()
    await detail.getByText('wiki://project/policy', { exact: true }).first().waitFor()
    await compare.locator(':scope > summary').click()
    await page.evaluate(() => { (window as any).pages[0].version = 4 })
    await compare.locator(':scope > summary').click()
    await detail.getByText('The published version changed. Create a proposal from the current page before publishing.').waitFor()
    expect(await approve.isDisabled()).toBe(true)
    await page.evaluate(() => { const w = window as any; w.item.expectedVersion = 4; w.failNotes = true; w.redraw() })
    await detail.getByText('Note read failed').waitFor()
    expect(await approve.isDisabled()).toBe(true)
    await page.evaluate(() => { (window as any).failNotes = false })
    await detail.getByRole('button', { name: 'Refresh source', exact: true }).click()
    await expect.poll(() => approve.isEnabled()).toBe(true)
    await page.evaluate(() => { (window as any).noteState = 'changed' })
    await detail.getByRole('button', { name: 'Refresh source', exact: true }).click()
    await expect.poll(() => approve.isDisabled()).toBe(true)
  } finally { await page.close() }
})

it('invalidates replacement confirmation on source failure, candidate change and busy transitions', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).conflictContext = { targets: [{ id: 'old', hash: 'target-hash', version: 2, content: 'Old policy' }], competing: [] } })
    await useLongCandidate(page)
    const detail = page.locator('#inspector')
    const confirm = detail.getByRole('checkbox')
    const approve = detail.getByRole('button', { name: /^Approve/ })
    await confirm.check()
    await expect.poll(() => approve.isEnabled()).toBe(true)
    await page.evaluate(() => { (window as any).failSource = true })
    await detail.locator('summary').filter({ hasText: 'Read full source' }).click()
    await detail.getByText('Source unavailable or ambiguous. Refresh to read it again.').waitFor()
    expect(await approve.isDisabled()).toBe(true)
    await expect.poll(() => confirm.isChecked()).toBe(false)
    await page.evaluate(() => { (window as any).failSource = false })
    await detail.getByRole('button', { name: 'Refresh source', exact: true }).click()
    await detail.getByText('END-OF-SOURCE', { exact: false }).waitFor()
    await confirm.check()
    await page.evaluate(() => { const w = window as any; w.busy = true; w.redraw() })
    await expect.poll(() => approve.isDisabled()).toBe(true)
    await page.evaluate(() => { const w = window as any; w.busy = false; w.redraw() })
    await confirm.waitFor()
    await expect.poll(() => confirm.isChecked()).toBe(false)
    await confirm.check()
    await page.evaluate(() => { const w = window as any; w.item.evidence.observationIds = ['new-source']; w.item.evidence.sources = []; w.redraw() })
    await confirm.waitFor()
    await expect.poll(() => confirm.isChecked()).toBe(false)
    await page.evaluate(() => { (window as any).revoked = true })
    await detail.locator('summary').filter({ hasText: 'Read full source' }).click()
    await detail.getByText('This source has been withdrawn.').waitFor()
    expect(await approve.isDisabled()).toBe(true)
  } finally { await page.close() }
})

it('discards late evidence and restores keyboard focus when closing a read-only record', async () => {
  const page = await browser.newPage()
  try {
    await mount(page); await useLongCandidate(page)
    await page.evaluate(() => { const w = window as any; w.delaySource = true; w.sourceBody = 'OLD SOURCE' })
    const detail = page.locator('#inspector')
    await detail.locator('summary').filter({ hasText: 'Read full source' }).click()
    await page.waitForFunction(() => !!(window as any).releaseSource)
    await page.evaluate(() => { const w = window as any; w.item.evidence.observationIds = ['new-source']; w.item.evidence.sources = []; w.redraw() })
    await detail.locator('summary').filter({ hasText: 'new-source' }).waitFor()
    await page.evaluate(() => (window as any).releaseSource())
    expect(await detail.innerText()).not.toContain('OLD SOURCE')
    await page.evaluate(() => { const w = window as any; w.detailClosed = true; w.redraw() })
    await detail.getByRole('button', { name: 'Close detail', exact: true }).waitFor({ state: 'detached' })
    const trigger = page.locator('#sidebar').getByRole('button', { name: 'Refresh Knowledge Engine', exact: true })
    await trigger.focus()
    await page.evaluate(() => {
      const w = window as any
      w.record = { id: 'audit', recordType: 'audit', kind: 'fact', workspaceId: 'project', status: 'active', title: 'Past operation', body: 'Historic event', tags: [], sourceIds: [], fileRefs: [] }
      w.detailClosed = false; w.redraw()
    })
    const close = detail.getByRole('button', { name: 'Close detail', exact: true })
    await expect.poll(() => close.evaluate(element => document.activeElement === element)).toBe(true)
    expect(await detail.getByRole('button').count()).toBe(1)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    await close.waitFor({ state: 'detached' })
    expect(await trigger.evaluate(element => document.activeElement === element)).toBe(true)
  } finally { await page.close() }
})

it('offers only applicable actions for settled facts, legacy graph records, published pages and audit events', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    const detail = page.locator('#inspector')
    for (const status of ['applied', 'rejected']) {
      await page.evaluate(status => { const w = window as any; w.item.status = status; w.redraw() }, status)
      await detail.locator(`[data-review-state="${status === 'applied' ? 'succeeded' : 'rejected'}"]`).waitFor()
      expect(await detail.getByRole('button', { name: /Approve|Reject|Archive/ }).count()).toBe(0)
      const history = detail.locator('details').filter({ has: page.locator('summary', { hasText: 'Historical scoring' }) })
      expect(await history.getAttribute('open')).toBeNull()
    }
    await page.evaluate(() => {
      const w = window as any
      w.item = { id: 'old-edge', type: 'graph-edge', status: 'proposed', derivation: 'deterministic', evidence: { observationIds: [] }, edge: { from: 'one', to: 'two', type: 'related_to', workspaceId: 'project', sourceFactIds: [] } }
      w.redraw()
    })
    await detail.locator('[data-review-state="legacy"]').waitFor()
    expect(await detail.getByRole('button', { name: /Approve|Reject|Archive/ }).count()).toBe(0)
    await useLongCandidate(page, 'wiki-patch')
    await page.evaluate(() => {
      const w = window as any
      w.record = { id: 'backup', kind: 'wiki', pageSlug: 'backup', workspaceId: 'project', status: 'published', title: 'Backup policy', body: 'fallback', tags: [], sourceIds: [], fileRefs: [] }
      w.redraw()
    })
    await detail.getByRole('heading', { name: 'Published baseline' }).waitFor()
    expect(await detail.getByRole('button', { name: /Approve|Reject/ }).count()).toBe(0)
    expect(await detail.getByRole('button', { name: 'Archive', exact: true }).count()).toBe(1)
    await page.evaluate(() => { const w = window as any; w.record.recordType = 'audit'; w.redraw() })
    await detail.getByText('This event records a past operation and is read-only.').waitFor()
    expect(await detail.getByRole('button').count()).toBe(1)
  } finally { await page.close() }
})

for (const width of [640, 1280]) {
  for (const theme of ['dark', 'planche']) {
    it(`opens the full workbench with usable review actions at ${width}px in ${theme}`, async () => {
      const page = await browser.newPage({ viewport: { width, height: width === 640 ? 720 : 900 } })
      try {
        await mount(page); await useLongCandidate(page, 'wiki-patch')
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; (window as any).showWorkbench() }, theme)
        await page.clock.runFor(1000)
        const card = page.locator('article[data-review-type="wiki-patch"]')
        await card.waitFor()
        const approve = card.getByRole('button', { name: 'Approve and publish', exact: true })
        await expect.poll(() => approve.isEnabled()).toBe(true)
        const box = await approve.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y + box!.height).toBeLessThan(width === 640 ? 720 : 900)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/knowledge-s2-browser/workbench-${theme}-${width}.png`, animations: 'disabled' })
        if (width === 1280 && theme === 'dark') {
          expect(await page.getByText('Published Wiki', { exact: true }).count()).toBe(0)
          expect(await card.innerText()).not.toContain('100%')
          await approve.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
          await expect.poll(() => page.evaluate(() => (window as any).actions.filter((action: string[]) => action[0] === 'approve').length)).toBe(1)
          expect(await page.evaluate(() => (window as any).actions[0][1])).toMatchObject({ type: 'wiki-patch', id: 'wiki-candidate', candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
        }
      } finally { await page.close() }
    })
  }
}
async function mount(page: Page) {
  page.setDefaultTimeout(4000)
  await page.clock.install()
  await page.route('http://localhost/review-state', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://localhost/review-state')
  await page.addStyleTag({ content: css + '\n#root{display:flex;height:900px;gap:20px}#sidebar,#inspector{width:390px}body{margin:0}' })
  await page.addScriptTag({ content: script })
  await page.locator('[data-review-state="manual"]').nth(1).waitFor()
}
it('shows identical current states and actions in the real sidebar and workbench inspector', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  try {
    await mount(page)
    expect(await page.evaluate(() => (window as any).reads)).toBe(1)
    for (const status of ['pending','running','needs-review','failed']) {
      await page.evaluate(status => (window as any).setTask(status), status)
      await page.locator(`[data-review-state="${status}"]`).nth(1).waitFor()
      for (const parent of ['#sidebar','#inspector']) {
        expect(await page.locator(parent).getByRole('button',{name:'Approve',exact:true}).count()).toBe(['needs-review','failed'].includes(status) ? 1 : 0)
        expect(await page.locator(parent).getByRole('button',{name:/Score again|Queue LLM refinement/}).count()).toBe(0)
      }
    }
    await page.locator('#inspector').getByText('Missing source context',{exact:true}).waitFor()
    await page.locator('#inspector').getByRole('button',{name:'Review again',exact:true}).click()
    await expect.poll(() => page.evaluate(() => (window as any).actions)).toEqual([['retry','current-task'],['run']])
    await page.locator('[data-review-state="pending"]').nth(1).waitFor()
  } finally { await page.close() }
})
it('invalidates changed proposals and failed status reads without reusing old scores', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => (window as any).setTask('needs-review'))
    await page.evaluate(() => { const w=window as any; w.item.fact.content='Keep backups for thirty days.';w.redraw();window.dispatchEvent(new Event('janusx-memory-changed')) })
    await page.locator('[data-review-state="unknown"]').nth(1).waitFor()
    expect(await page.getByRole('button',{name:'Approve',exact:true}).count()).toBe(0)
    expect(await page.getByText('Historical scoring (not the current review result)',{exact:true}).count()).toBe(2)
    await page.evaluate(async () => { const w=window as any;await w.setTask('failed');w.fail=true;await w.refresh() })
    await page.locator('[data-review-state="unknown"]').nth(1).waitFor()
    expect(await page.getByRole('button',{name:'Review again',exact:true}).count()).toBe(0)
  } finally { await page.close() }
})
it('coalesces reads and ignores late results after closing, then refreshes on reopening', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {const w=window as any;w.delay=true;void w.refresh();void w.refresh()})
    await page.waitForFunction(() => typeof (window as any).release === 'function')
    expect(await page.evaluate(() => (window as any).reads)).toBe(2)
    await page.evaluate(() => window.dispatchEvent(new Event('janusx-memory-changed')))
    await page.evaluate(() => (window as any).hide())
    await page.locator('#sidebar').waitFor({state:'detached'})
    await page.evaluate(() => {const w=window as any;w.release();w.delay=false;w.current.reviewEnabled=false})
    await page.clock.runFor(15000)
    expect(await page.evaluate(() => (window as any).reads)).toBe(2)
    await page.evaluate(() => (window as any).show())
    await page.locator('[data-review-state="disabled"]').nth(1).waitFor()
    expect(await page.evaluate(() => (window as any).reads)).toBe(3)
  } finally { await page.close() }
})
