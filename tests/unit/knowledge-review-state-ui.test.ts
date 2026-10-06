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
    import {Inspector} from './src/renderer/src/components/knowledge/KnowledgeWorkbench'
    import {useKnowledgeAutomation,refreshKnowledgeAutomation} from './src/renderer/src/services/knowledge-automation'
    import {useExperimentalStore} from './src/renderer/src/stores/experimental'
    import {reviewCandidateInput} from './src/shared/review-candidate-snapshot'
    import './src/renderer/src/styles/globals.css'
    const candidate = {id:'candidate',type:'fact',status:'proposed',derivation:'deterministic',evidence:{observationIds:[]},
      fact:{id:'fact',content:'Keep backups for seven days.',scope:'project',kind:'procedure',files:[],concepts:[],tags:[],
        provenance:{workspaceId:'project',workspaceName:'Project',fileRefs:[],sourceObservationIds:[]}},
      decision:{status:'old',reason:'Old advisory reason',scorer:{provider:'laya'},answers:[]}}
    window.item = candidate; window.reads = 0; window.actions = []
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
      listCandidates:async()=>[structuredClone(window.item)], listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],
      automationStatus:async()=>{window.reads++;const captured=structuredClone(window.current);if(window.delay)await new Promise(resolve=>window.release=resolve);if(window.fail)throw Error('unavailable');return captured},
      automationRetry:async id=>{window.actions.push(['retry',id]);window.current.queue[0].status='pending';window.current.queue[0].canRetry=false},
      automationRun:async()=>{window.actions.push(['run'])},
      factReviewContext:async()=>({targets:[],competing:[]}),
      applyCandidate:async input=>{window.actions.push(['approve',input])},rejectCandidate:async input=>{window.actions.push(['reject',input])}
    }}
    useExperimentalStore.setState({loaded:true,knowledge:true,persona:false})
    function Detail(){const {status}=useKnowledgeAutomation(true);const [version,setVersion]=React.useState(0);window.redraw=()=>setVersion(v=>v+1)
      const snapshot={factCandidates:[window.item],wikiPatches:[],graphCandidates:[],conflicts:[],usingDemoData:false}
      return <div data-version={version}><Inspector automation={status} record={{id:'candidate',reviewType:'fact',status:'proposed'}} snapshot={snapshot} busy={false} error='' onApprove={()=>{}} onReject={()=>{}} onRevoke={()=>{}} onCloseDetail={()=>{}}/></div>}
    const root=createRoot(document.getElementById('root'))
    window.show=()=>root.render(<><div id='sidebar'><MemoryReviewTool active domain='engineering'/></div><div id='inspector'><Detail/></div></>)
    window.hide=()=>root.render(null)
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(window.show)
  ` }, loader: { '.svg': 'dataurl' }, bundle: true, write: false, outfile: 'review-state-ui.js', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'i18n-fixture', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage=()=>{}", loader: 'ts' }))
  } }] })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })
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
