import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  await mkdir('artifacts/knowledge-s4-browser', { recursive: true })
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client'
    import i18n from 'i18next';import {initReactI18next} from 'react-i18next'
    import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'
    import zhKnowledge from './src/renderer/src/i18n/locales/zh-CN/knowledge.json'
    import {KnowledgeWorkbench} from './src/renderer/src/components/knowledge/KnowledgeWorkbench'
    import {AuditDetail} from './src/renderer/src/components/knowledge/AuditDetail'
    import {useExperimentalStore} from './src/renderer/src/stores/experimental'
    import {useAssistantStore} from './src/renderer/src/stores/assistant'
    import './src/renderer/src/styles/globals.css';import './src/renderer/src/styles/themes.generated.css'
    const provenance={workspaceId:'project',workspaceName:'Project Alpha',workspacePath:'/project',createdAt:'2026-10-06T00:00:00Z',actor:'Reviewer',source:'manual',sourceObservationIds:['evidence-1'],fileRefs:['src/backup.ts']}
    window.events=Array.from({length:35},(_,i)=>({id:'event-'+i,action:'candidate_applied',targetType:'fact',targetId:'candidate-main',displayTitle:'Archive policy '+i,provenance:{...provenance,...(i===34?{workspaceId:'second',workspaceName:'Second project'}:{})},before:{content:'Old saved text',status:'proposed',unchanged:'Same saved field'},after:{content:'New saved text',status:'applied',unchanged:'Same saved field',appliedId:'fact-main'}}))
    window.events[2]={...window.events[2],action:'habit_candidate_proposed',targetId:'habits:2',displayTitle:undefined,before:null,after:{count:2}}
    window.events[3]={...window.events[3],action:'future-action',targetType:'future-type',before:undefined,after:undefined,displayTitle:undefined}
    window.events[4]={...window.events[4],displayTitle:'Long readable title '.repeat(10),before:null,after:{content:'<img src=x onerror="window.injected=true">'+'Long saved source '.repeat(400)}}
    window.requests=[];window.objectReads=0;window.features=useExperimentalStore;window.assistant=useAssistantStore
    window.electron={knowledge:{
      listAudit:async()=>[],auditPage:async query=>{
        window.requests.push(query)
        const items=window.events.filter(item=>(!query.workspaceId||item.provenance.workspaceId===query.workspaceId)&&(!query.action||item.action===query.action))
        const offset=Number(query.cursor??0);const selected=structuredClone(items.slice(offset,offset+30))
        if(window.delayPage)await new Promise(resolve=>window.releasePage=resolve)
        if(window.failPage)throw Error('offline')
        return {items:selected,total:items.length,byAction:{},workspaces:[{id:'project',name:'Project Alpha'},{id:'second',name:'Second project'}],nextCursor:offset+30<items.length?String(offset+30):undefined}
      },
      listCandidates:async()=>{window.objectReads++;if(window.delayObject)await new Promise(resolve=>window.releaseObject=resolve);return []},listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],
      listObservations:async()=>[],retentionStats:async()=>({}),listTruth:async()=>({facts:window.missingObject?[]:[{id:'fact-main',scope:'project',status:'active',content:'CURRENT content is different',concepts:[],tags:[],files:[],confidence:1,version:2,provenance:{...provenance,workspaceId:window.wrongWorkspace?'other':'project'}}],wikiPages:[],graphEdges:[]}),
      getSettings:async()=>({mode:'auto'}),listConflicts:async()=>[],processingStats:async()=>null,
      automationStatus:async()=>({reviewStateVersion:1,reviewEnabled:true,enabled:false,running:false,stages:{extraction:'rules-only',entryReview:'manual',wikiGeneration:'manual',wikiReview:'manual'},queue:[],tasks:[],counts:{},total:0}),
      observationRevocations:async()=>({items:[],total:0}),
      userMemoryOverview:async()=>({profile:{},habits:[],recent:[],pendingHabitCount:0})
    }}
    useExperimentalStore.setState({loaded:true,knowledge:true,persona:true})
    useAssistantStore.setState({workbenchDomain:'engineering'})
    const root=createRoot(document.getElementById('root'))
    window.show=()=>root.render(<KnowledgeWorkbench isOpen onClose={()=>root.render(null)}/>)
    window.detail=()=>root.render(<div style={{height:'100vh'}}><AuditDetail event={window.events[4]} onClose={()=>root.render(null)}/></div>)
    window.unmount=()=>root.render(null);window.language=lng=>i18n.changeLanguage(lng)
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge},'zh-CN':{knowledge:zhKnowledge}},initImmediate:false})
    window.show()
  ` }, bundle: true, write: false, outfile: 'audit-ui.js', jsx: 'automatic', format: 'iife', loader: { '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'i18n', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next';export default i18n;export const changeLanguage=()=>{}", loader: 'ts' }))
  } }] })
  script = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })
async function mount(page: Page) {
  page.setDefaultTimeout(5000)
  await page.route('http://localhost/audit', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://localhost/audit')
  await page.addStyleTag({ content: css + '\nbody{margin:0}*{box-sizing:border-box}' })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.addScriptTag({ content: script })
  await page.getByRole('button', { name: 'View records', exact: true }).click()
  await page.getByRole('tab', { name: 'Operation audit', exact: true }).click()
  await page.getByText('Loaded 30 of 35 events', { exact: true }).waitFor()
}

it('paginates and filters by workspace/action, with distinct selection for two events on one object', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  try {
    await mount(page)
    await page.locator('[data-audit-id="event-0"]').click()
    const detail=page.getByRole('region',{name:'Audit details',exact:true})
    await detail.waitFor()
    expect(await page.locator('[data-audit-id="event-0"]').getAttribute('aria-pressed')).toBe('true')
    await page.locator('[data-audit-id="event-1"]').click()
    expect(await page.locator('[data-audit-id="event-0"]').getAttribute('aria-pressed')).toBe('false')
    expect(await page.locator('[data-audit-id="event-1"]').getAttribute('aria-pressed')).toBe('true')
    await detail.getByRole('button',{name:'Close details',exact:true}).click()
    await page.getByRole('button',{name:'Load more',exact:true}).click()
    await page.getByText('Loaded 35 of 35 events',{exact:true}).waitFor()
    expect(await page.locator('[data-audit-id]').count()).toBe(35)
    await page.getByLabel('Project',{exact:true}).selectOption('second')
    await page.getByText('Loaded 1 of 1 events',{exact:true}).waitFor()
    expect(await page.locator('[data-audit-id]').getAttribute('data-audit-id')).toBe('event-34')
    await page.getByLabel('Action',{exact:true}).selectOption('candidate_rejected')
    await page.getByText('Loaded 0 of 0 events',{exact:true}).waitFor()
    const requests=await page.evaluate(()=>(window as any).requests)
    expect(requests.at(-1)).toMatchObject({domain:'engineering',workspaceId:'second',action:'candidate_rejected'})
    expect(requests.at(-1).cursor).toBeUndefined()
  } finally {await page.close()}
})

it('preserves snapshots, folds unchanged values and shows current objects separately with workspace checks', async () => {
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'})
  try {
    await mount(page);await page.locator('[data-audit-id="event-0"]').click()
    const detail=page.getByRole('region',{name:'Audit details',exact:true})
    await detail.getByText('Old saved text',{exact:true}).waitFor()
    await detail.getByText('New saved text',{exact:true}).waitFor()
    expect(await detail.getByText('Same saved field',{exact:true}).isVisible()).toBe(false)
    await detail.getByText('Unchanged fields',{exact:true}).click()
    await detail.getByText('Same saved field',{exact:true}).waitFor()
    await detail.getByText('Source references',{exact:true}).click()
    expect(await detail.innerText()).toContain('evidence-1')
    await detail.getByRole('button',{name:'View current object',exact:true}).click()
    await detail.getByRole('heading',{name:'Current object · read only',exact:true}).waitFor()
    expect(await detail.innerText()).toContain('CURRENT content is different')
    expect(await detail.innerText()).toContain('Old saved text')
    expect(await detail.getByRole('button',{name:/Approve|Reject|Archive/}).count()).toBe(0)
    await page.evaluate(()=>{(window as any).wrongWorkspace=true})
    await detail.getByRole('button',{name:'View current object',exact:true}).click()
    await detail.getByText(/The current object is unavailable/).waitFor()
    expect(await detail.getByRole('heading',{name:'Current object · read only',exact:true}).count()).toBe(0)
    await page.evaluate(()=>window.dispatchEvent(new Event('janusx-memory-changed')))
    await page.waitForTimeout(300)
    expect(await page.locator('[data-audit-id="event-0"]').getAttribute('aria-pressed')).toBe('true')
    expect(await detail.innerText()).toContain('Old saved text')
  } finally {await page.close()}
})

it('explains count-only and missing/unknown events without misleading object links or translation keys', async () => {
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'})
  try {
    await mount(page);await page.locator('[data-audit-id="event-2"]').click()
    const detail=page.getByRole('region',{name:'Audit details',exact:true})
    await detail.getByText(/This event records a batch of 2 items/).waitFor()
    expect(await detail.getByRole('button',{name:'View current object',exact:true}).count()).toBe(0)
    await page.locator('[data-audit-id="event-3"]').click()
    await detail.getByRole('heading',{name:'Recorded operation',exact:true}).waitFor()
    await detail.getByText('This event did not record a content snapshot.',{exact:true}).waitFor()
    expect(await detail.innerText()).not.toContain('auditView.')
    expect(await detail.innerText()).not.toContain('future-action')
    await detail.getByText('Technical details',{exact:true}).click()
    expect(await detail.innerText()).toContain('future-action')
  } finally {await page.close()}
})

it('retains loaded pages after errors and ignores delayed pages and object results after selection changes', async () => {
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'})
  try {
    await mount(page)
    await page.evaluate(()=>{(window as any).failPage=true})
    await page.getByRole('button',{name:'Load more',exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click()})
    await page.getByRole('alert').filter({hasText:'Could not read audit records'}).waitFor()
    expect(await page.evaluate(()=>(window as any).requests.length)).toBe(2)
    expect(await page.locator('[data-audit-id]').count()).toBe(30)
    await page.evaluate(()=>{(window as any).failPage=false;(window as any).delayPage=true})
    await page.getByRole('button',{name:'Load more',exact:true}).click()
    await page.waitForFunction(()=>!!(window as any).releasePage)
    await page.evaluate(()=>{(window as any).delayPage=false})
    await page.getByLabel('Project',{exact:true}).selectOption('second')
    await page.getByText('Loaded 1 of 1 events',{exact:true}).waitFor()
    await page.evaluate(()=>(window as any).releasePage())
    await page.waitForTimeout(100)
    expect(await page.locator('[data-audit-id]').count()).toBe(1)
    await page.getByLabel('Project',{exact:true}).selectOption('')
    await page.locator('[data-audit-id="event-0"]').click()
    await page.evaluate(()=>{(window as any).delayObject=true})
    await page.getByRole('button',{name:'View current object',exact:true}).click()
    await page.waitForFunction(()=>!!(window as any).releaseObject)
    await page.locator('[data-audit-id="event-3"]').click()
    await page.evaluate(()=>(window as any).releaseObject())
    expect(await page.getByRole('region',{name:'Audit details',exact:true}).innerText()).not.toContain('CURRENT content')
    await page.evaluate(()=>{(window as any).failPage=true})
    await page.getByRole('button',{name:'Refresh records',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'Could not read audit records'}).waitFor()
    await expect.poll(()=>page.locator('[data-audit-id]').count()).toBe(0)
    expect(await page.getByText('Loaded 0 of 0 events',{exact:true}).count()).toBe(0)
    await page.evaluate(()=>{(window as any).failPage=false})
    await page.getByRole('button',{name:'Refresh records',exact:true}).click()
    await page.getByText('Loaded 30 of 35 events',{exact:true}).waitFor()
  } finally {await page.close()}
})

it('localizes the audit list, filters and saved changes in Chinese',async()=>{
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'})
  try {
    await mount(page);await page.evaluate(async()=>{await (window as any).language('zh-CN');document.documentElement.dataset.theme='planche'})
    await page.locator('[data-audit-id="event-0"]').click()
    const detail=page.getByRole('region',{name:'审计详情',exact:true})
    await detail.getByRole('heading',{name:'应用候选',exact:true}).waitFor()
    await detail.getByText('变更前',{exact:true}).first().waitFor()
    await page.getByLabel('工程',{exact:true}).waitFor()
    await page.screenshot({path:'artifacts/knowledge-s4-browser/audit-zh-desktop.png',animations:'disabled'})
  }finally{await page.close()}
})

for(const theme of ['dark','planche']) for(const width of [320,390,640,1280]) {
  it(`reads ${theme} audit details at ${width}px with bounded text and keyboard close`,async()=>{
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'})
    try {
      await mount(page)
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme)
      if(width<640) await page.evaluate(()=>(window as any).detail())
      else {
        await page.locator('[data-audit-id="event-4"]').focus()
        await page.keyboard.press('Enter')
      }
      const detail=page.getByRole('region',{name:'Audit details',exact:true})
      await detail.waitFor()
      await detail.getByText('Show full value',{exact:true}).first().click()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
      expect(await detail.locator('img').count()).toBe(0)
      expect(await page.evaluate(()=>(window as any).injected)).toBeUndefined()
      expect(await detail.getByRole('button',{name:'Close details',exact:true}).isVisible()).toBe(true)
      await page.screenshot({path:'artifacts/knowledge-s4-browser/audit-'+theme+'-'+width+'.png',animations:'disabled'})
      await detail.focus();await page.keyboard.press('Escape')
      await detail.waitFor({state:'detached'})
      if(width>=640) expect(await page.locator('[data-audit-id="event-4"]').evaluate(el=>el===document.activeElement)).toBe(true)
    } finally {await page.close()}
  })
}
