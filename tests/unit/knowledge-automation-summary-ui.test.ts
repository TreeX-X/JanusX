import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'

let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client'
    import i18n from 'i18next';import {initReactI18next} from 'react-i18next'
    import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'
    import zhKnowledge from './src/renderer/src/i18n/locales/zh-CN/knowledge.json'
    import settings from './src/renderer/src/i18n/locales/en/settings.json'
    import {AutomationStatus} from './src/renderer/src/components/knowledge/AutomationStatus'
    import {AssistantTool} from './src/renderer/src/components/knowledge/AssistantTool'
    import {KnowledgeWorkbench} from './src/renderer/src/components/knowledge/KnowledgeWorkbench'
    import {refreshKnowledgeAutomation} from './src/renderer/src/services/knowledge-automation'
    import {useExperimentalStore} from './src/renderer/src/stores/experimental'
    import {useAssistantStore} from './src/renderer/src/stores/assistant'
    import {useAppStore} from './src/renderer/src/stores/app'
    import {defaultKnowledgeAutomation} from './src/shared/knowledge-automation'
    import './src/renderer/src/styles/globals.css';import './src/renderer/src/styles/themes.generated.css'
    const counts={pending:0,running:0,succeeded:0,failed:0,'needs-review':0,cancelled:0}
    window.current={reviewStateVersion:1,reviewEnabled:true,enabled:true,running:false,queue:[],tasks:[],counts,total:0,
      stages:{extraction:'rules-only',entryReview:'automatic',wikiGeneration:'automatic',wikiReview:'automatic'}}
    window.reads=0;window.calls=[];window.refresh=refreshKnowledgeAutomation
    window.electron={llm:{getTerminalProviders:async()=>[]},knowledge:{
      automationStatus:async()=>{window.reads++;const captured=structuredClone(window.current);if(window.delay)await new Promise(resolve=>window.release=resolve);if(window.fail)throw Error('offline');return captured},
      automationRetry:async id=>{window.calls.push(['retry',id]);if(window.failRetry)throw Error('stale');window.current.queue=window.current.queue.map(task=>task.id===id?{...task,status:'pending',canRetry:false}:task)},
      automationRun:async()=>window.calls.push(['run']),
      listCandidates:async()=>[],listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],listObservations:async()=>[],
      listAudit:async()=>[],auditPage:async()=>({items:[],total:0,byAction:{},workspaces:[]}),observationRevocations:async()=>({total:0,items:[]}),retentionStats:async()=>({}),listTruth:async()=>({facts:[],wikiPages:[],graphEdges:[]}),listConflicts:async()=>[],
      getSettings:async()=>({enabled:true,mode:'auto',automation:{...defaultKnowledgeAutomation(),enabled:true}}),processingStats:async()=>null,
      externalMcpStatus:async()=>null,localResourcesStatus:async()=>({supported:true,phase:'idle',receivedBytes:0,totalBytes:0}),
      userMemoryOverview:async()=>({profile:{identity:'Tester',formatPrefs:[],toolPrefs:[]},habits:[],recent:[],pendingHabitCount:0}),
      getPersonalSettings:async()=>({captureConversations:true,inferEngineeringHabits:false,useInChat:true,episodeTtlDays:60})
    }}
    useExperimentalStore.setState({loaded:true,knowledge:true,persona:true})
    window.features=useExperimentalStore;window.assistant=useAssistantStore;window.app=useAppStore
    function Integrated(){const open=useAppStore(s=>s.activeWorkbench)==='knowledge';return <><div id='assistant'><AssistantTool active workspaceId='project' workspacePath='/project'/></div><KnowledgeWorkbench isOpen={open} onClose={()=>useAppStore.getState().setActiveWorkbench(null)}/></>}
    const root=createRoot(document.getElementById('root'))
    window.summaries=(count=2)=>root.render(<>{Array.from({length:count},(_,i)=><div key={i} className='summary-host'><AutomationStatus active/></div>)}</>)
    window.integrated=()=>root.render(<Integrated/>);window.hide=()=>root.render(null)
    window.language=lng=>i18n.changeLanguage(lng)
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge,settings},'zh-CN':{knowledge:zhKnowledge}},initImmediate:false})
    window.summaries()
  ` }, bundle: true, write: false, outfile: 'summary.js', jsx: 'automatic', format: 'iife', loader: { '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'i18n', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next';export default i18n;export const changeLanguage=()=>{}", loader: 'ts' }))
  } }] })
  script = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })

async function mount(page: Page) {
  page.setDefaultTimeout(5000)
  await page.clock.install()
  await page.route('http://localhost/summary', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://localhost/summary')
  await page.addStyleTag({ content: css + '\nbody{margin:0}#assistant{width:min(390px,100vw);height:100vh}.summary-host{width:320px}*{box-sizing:border-box}' })
  await page.addScriptTag({ content: script })
  await page.getByText('Automation enabled · waiting for new material', { exact: true }).nth(1).waitFor()
}

it('shares reads, polls running work at 2 seconds and idle work at 10 seconds, and cancels on hide/unmount', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    expect(await page.evaluate(() => (window as any).reads)).toBe(1)
    await page.clock.runFor(9000)
    expect(await page.evaluate(() => (window as any).reads)).toBe(1)
    await page.clock.runFor(1100)
    await expect.poll(() => page.evaluate(() => (window as any).reads)).toBe(2)
    await page.evaluate(async () => { const w=window as any; w.current.running=true; await w.refresh() })
    await page.clock.runFor(1900)
    expect(await page.evaluate(() => (window as any).reads)).toBe(3)
    await page.clock.runFor(200)
    await expect.poll(() => page.evaluate(() => (window as any).reads)).toBe(4)
    await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange')) })
    await page.clock.runFor(20000)
    expect(await page.evaluate(() => (window as any).reads)).toBe(4)
    await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange')) })
    await expect.poll(() => page.evaluate(() => (window as any).reads)).toBe(5)
    await page.evaluate(() => (window as any).hide())
    await page.locator('[data-automation-summary]').waitFor({ state:'detached' })
    await page.clock.runFor(20000)
    expect(await page.evaluate(() => (window as any).reads)).toBe(5)
  } finally { await page.close() }
})

it('does not overlap slow reads or reuse a late result after domain closure', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => { const w=window as any;w.delay=true;void w.refresh();void w.refresh() })
    await page.waitForFunction(() => !!(window as any).release)
    await page.clock.runFor(30000)
    expect(await page.evaluate(() => (window as any).reads)).toBe(2)
    await page.evaluate(() => (window as any).hide())
    await page.locator('[data-automation-summary]').waitFor({ state:'detached' })
    await page.evaluate(() => { const w=window as any;w.delay=false;w.current.enabled=false;w.release();w.summaries(1) })
    await page.getByText('Automatic processing is off', { exact:true }).waitFor()
    expect(await page.evaluate(() => (window as any).reads)).toBe(3)
    await page.evaluate(async () => { const w=window as any;w.fail=true;await w.refresh() })
    await page.getByRole('alert').getByText('Processing status unavailable').waitFor()
    expect(await page.getByText('Automatic processing is off',{exact:true}).count()).toBe(0)
    await page.evaluate(() => { (window as any).fail=false })
    await page.getByRole('button',{name:'Refresh status',exact:true}).click()
    await page.getByText('Automatic processing is off',{exact:true}).waitFor()
  } finally { await page.close() }
})

it('distinguishes partial setup, rules only, queued work, current exceptions and actual completion time', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(async () => { const w=window as any;w.current.stages={extraction:'rules-only',entryReview:'manual',wikiGeneration:'manual',wikiReview:'manual'};await w.refresh() })
    await page.getByText('Rule extraction enabled · reviews are manual',{exact:true}).nth(1).waitFor()
    await page.evaluate(async () => { const w=window as any;w.current.stages.entryReview='unconfigured';await w.refresh() })
    await page.getByRole('status').filter({hasText:'Setup needed: Entry review'}).nth(1).waitFor()
    await page.evaluate(async () => { const w=window as any;w.current.stages.entryReview='automatic';w.current.queue=[{id:'work',stage:'entryReview',status:'pending',subject:'internal-id',displayTitle:'Readable title'}];await w.refresh() })
    await page.getByText('Tasks queued · 1',{exact:true}).nth(1).waitFor()
    expect(await page.locator('[data-automation-summary]').first().innerText()).not.toContain('internal-id')
    await page.evaluate(async () => { const w=window as any;w.current.queue=[];w.current.counts.failed=25;w.current.lastCompletedAt='2026-10-06T01:02:03Z';await w.refresh() })
    expect(await page.getByRole('button',{name:'Attention 25',exact:true}).count()).toBe(0)
    // A partially manual setup retains its configuration hint rather than claiming full automation.
    await page.getByText('Partly automatic',{exact:true}).nth(1).waitFor()
    await page.evaluate(async () => { const w=window as any;w.current.stages.wikiGeneration='automatic';w.current.stages.wikiReview='automatic';await w.refresh() })
    await page.getByText(/Last completed/).nth(1).waitFor()
    await page.evaluate(async () => { const w=window as any;w.current.running=true;w.current.queue=[];await w.refresh() })
    await page.getByText('Checking processing tasks',{exact:true}).nth(1).waitFor()
    expect(await page.locator('body').innerText()).not.toContain('100%')
  } finally { await page.close() }
})

async function seedTasks(page: Page) {
  await page.evaluate(async () => {
    const w=window as any
    const task={id:'current-failure',stage:'entryReview',workspaceId:'project',subject:'internal-candidate',status:'failed',canRetry:true,reason:'Missing source context',displayTitle:'Backup policy'}
    w.current.queue=[task];w.current.tasks=[{...task,updatedAt:'2026-10-06T01:00:00Z',model:{provider:'external',model:'test'}},{...task,id:'historical-failure',subject:'old-internal-id',displayTitle:undefined,reason:'Old failure',updatedAt:'2026-10-05T01:00:00Z',model:{provider:'external',model:'test'}}]
    w.current.counts.failed=2;w.current.total=2
    await w.refresh();w.integrated()
  })
  await page.locator('#assistant [data-automation-summary]').waitFor()
}

it('shows the same long, readable running subject in Chinese in the assistant and workbench', async () => {
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'})
  try {
    await mount(page);await seedTasks(page)
    await page.evaluate(async()=>{
      const w=window as any;await w.language('zh-CN');document.documentElement.dataset.theme='dark'
      w.current.running=true
      w.current.queue.push({id:'running',subject:'internal-id-'+ 'x'.repeat(300),workspaceId:'project',stage:'wikiReview',status:'running',displayTitle:'备份手册的长期保存与恢复策略'.repeat(6)})
      await w.refresh()
    })
    const sidebar=page.locator('#assistant [data-automation-summary]')
    await sidebar.getByRole('button',{name:'查看记录',exact:true}).click()
    await page.clock.runFor(1000)
    const summaries=page.locator('[data-automation-summary]')
    await expect.poll(()=>summaries.count()).toBe(2)
    const labels=await summaries.locator('button[title]').evaluateAll(items=>items.filter(item=>item.textContent?.includes('正在处理')).map(item=>item.getAttribute('title')))
    expect(labels).toHaveLength(2)
    expect(labels[0]).toBe(labels[1])
    expect(labels[0]).toContain('备份手册')
    expect(await summaries.first().innerText()).not.toContain('internal-id-')
    for(const summary of await summaries.all()) {
      expect(await summary.evaluate(el=>el.scrollWidth<=el.clientWidth && el.getBoundingClientRect().height<=64)).toBe(true)
      expect(await summary.locator('svg').evaluateAll(items=>items.every(item=>getComputedStyle(item).animationName==='none'))).toBe(true)
    }
    await page.screenshot({path:'artifacts/knowledge-s3-browser/running-zh-desktop.png',animations:'disabled'})
  } finally {await page.close()}
})

for (const theme of ['dark','planche']) for (const width of [320,390,640,1280]) {
  it(`keeps ${theme} summary compact at ${width}px and opens the correct record filter`, async () => {
    const page=await browser.newPage({viewport:{width,height:720},reducedMotion:'reduce'})
    try {
      await mount(page);await seedTasks(page)
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme)
      const summary=page.locator('#assistant [data-automation-summary]')
      expect(await summary.locator('details').count()).toBe(0)
      expect(await summary.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(64)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({path:`artifacts/knowledge-s3-browser/sidebar-${theme}-${width}.png`,animations:'disabled'})
      const attention=summary.getByRole('button',{name:'Attention 1',exact:true})
      await page.keyboard.press('Tab');await attention.focus()
      expect(await attention.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none')
      await page.keyboard.press('Enter')
      await page.clock.runFor(1000)
      const records=page.getByRole('region',{name:'Processing records',exact:true})
      await records.getByText('Backup policy',{exact:true}).waitFor()
      expect(await records.getByText('Old failure',{exact:true}).count()).toBe(0)
      expect(await records.getByRole('button',{name:'Needs attention',exact:true}).getAttribute('aria-pressed')).toBe('true')
      if (width>=640) {
        const top=page.locator('[data-domain="engineering"]').filter({has:page.locator(':scope > [data-automation-summary]')})
        expect(await top.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(72)
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
        await page.screenshot({path:`artifacts/knowledge-s3-browser/workbench-${theme}-${width}.png`,animations:'disabled'})
      }
      await records.getByRole('button',{name:'All tasks',exact:true}).click()
      await records.getByText('Old failure',{exact:true}).waitFor()
      expect(await records.getByRole('button',{name:'Review again',exact:true}).count()).toBe(1)
      if (width===1280 && theme==='dark') {
        await page.getByRole('button',{name:'Operation audit',exact:true}).click()
        await records.waitFor({state:'detached'})
        expect(await page.getByText('Old failure',{exact:true}).count()).toBe(0)
        await page.getByRole('button',{name:'Processing records',exact:true}).click()
        await records.getByText('Old failure',{exact:true}).waitFor()
      }
      await records.getByRole('button',{name:'Review again',exact:true}).click()
      await expect.poll(()=>page.evaluate(()=>(window as any).calls)).toEqual([['retry','current-failure'],['run']])
    } finally {await page.close()}
  })
}

it('keeps one assistant summary across subpages, uses the settings destination, and stops reading when engineering is disabled', async () => {
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  try {
    await mount(page);await seedTasks(page)
    for(const section of ['personal','review','engineering']) {
      await page.evaluate(section=>(window as any).assistant.getState().setSection(section),section)
      await expect.poll(()=>page.locator('#assistant [data-automation-summary]').count()).toBe(1)
    }
    await page.locator('#assistant').getByRole('button',{name:'Automation settings',exact:true}).click()
    await page.clock.runFor(1000)
    await page.getByRole('heading',{name:'Saved processing modes',exact:true}).waitFor()
    expect(await page.getByText('Scope and processing stages',{exact:true}).count()).toBe(0)
    await page.evaluate(()=>{const w=window as any;w.features.setState({knowledge:false});w.app.getState().setActiveWorkbench(null)})
    await page.locator('[data-automation-summary]').waitFor({state:'detached'})
    const count=await page.evaluate(()=>(window as any).reads)
    await page.clock.runFor(20000)
    expect(await page.evaluate(()=>(window as any).reads)).toBe(count)
  } finally {await page.close()}
})
