import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import './src/renderer/src/styles/globals.css'
    import './src/renderer/src/styles/themes.generated.css'
    import React from 'react'; import {createRoot} from 'react-dom/client'; import i18n from 'i18next'; import {initReactI18next} from 'react-i18next'
    import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'; import settings from './src/renderer/src/i18n/locales/en/settings.json'; import common from './src/renderer/src/i18n/locales/en/common.json'
    import {AssistantTool} from './src/renderer/src/components/knowledge/AssistantTool'
    import {KnowledgeWorkbench} from './src/renderer/src/components/knowledge/KnowledgeWorkbench'
    import {ExternalMcpPanel} from './src/renderer/src/components/ExternalMcpPanel'
    import {useExperimentalStore} from './src/renderer/src/stores/experimental'
    import {useAssistantStore} from './src/renderer/src/stores/assistant'
    import {useRightToolStore} from './src/renderer/src/stores/right-tools'
    window.calls=[];window.features=useExperimentalStore;window.assistant=useAssistantStore;window.dock=useRightToolStore
    useExperimentalStore.setState({loaded:true,knowledge:true,persona:true,load:async()=>{}})
    const candidate=(id,scope)=>({id,type:'fact',status:'proposed',derivation:'deterministic',evidence:{observationIds:[]},fact:{id,content:id,kind:'preference',scope,confidence:0.9,tags:[],concepts:[],provenance:{workspaceId:scope==='user'?'user':'project',sourceObservationIds:[],fileRefs:[],createdAt:'2026-10-04'}}})
    window.reviewItems=[];window.delayCandidates=false
    window.electron={knowledge:{
      userMemoryOverview:async()=>({profile:{identity:'Tree',formatPrefs:['Concise answers'],toolPrefs:['TypeScript']},habits:[{id:'memory-1',content:'Prefer explicit error handling and complete source references.',confirmed:true,contentHash:'hash',observationIds:['source-1'],lastSeenAt:'2026-10-04'},{id:'memory-2',content:'May prefer compact examples.',confirmed:false,contentHash:'hash',observationIds:[]}],recent:[{id:'recent-1',content:'Investigating terminal MCP coverage.',createdAt:'2026-10-04',expiresAt:'2026-12-03',contentHash:'hash',tags:[]}],pendingHabitCount:1}),
      listCandidates:async()=>{if(window.delayCandidates)await new Promise(resolve=>window.finishCandidates=resolve);return structuredClone(window.reviewItems)},listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],
      listObservations:async()=>[],listAudit:async()=>[],retentionStats:async()=>null,listTruth:async()=>({facts:[],wikiPages:[],graphEdges:[]}),getSettings:async()=>({mode:'deterministic-only'}),listConflicts:async()=>[],processingStats:async()=>null,
      factReviewContext:async()=>({targets:[],competing:[],blocked:false}),
      personalProfileEditContext:async()=>({hash:'profile-hash',overrides:{identity:'Tree',formatPrefs:['Concise answers'],toolPrefs:['TypeScript']}}),
      savePersonalProfile:async input=>{window.calls.push(input)},
      automationStatus:async()=>({enabled:false,running:false,counts:{pending:0,running:0,succeeded:0,'needs-review':0,failed:0,cancelled:0},total:0,tasks:[]}),
      getPersonalSettings:async()=>({captureConversations:true,inferEngineeringHabits:false,useInChat:true,episodeTtlDays:60}),
      externalMcpStatus:async()=>({entry:'C:/app/knowledge-mcp.js',entryExists:true,isPackaged:false,clients:[{id:'codex',label:'Codex',support:'automatic',registered:true,current:false,configPath:'config.toml'},{id:'pi',label:'Pi',support:'unverified',registered:false,configPath:''},...[['claude-code','Claude Code'],['opencode','OpenCode'],['janus','Janus CLI'],['dsh','DeepSeek / dsh']].map(([id,label])=>({id,label,support:['claude-code','opencode'].includes(id)?'automatic':'unverified',registered:false,configPath:''}))]}),
      registerExternalMcp:async id=>{window.calls.push(id);return {ok:true,configPath:'config.toml'}},
      probeExternalMcp:async()=>({ok:true,stage:'query',tools:[]}),
    }}
    window.seedReview=()=>window.reviewItems=[candidate('Engineering review item','project'),candidate('Personal review one','user'),candidate('Personal review two','user')]
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge,settings,common}},interpolation:{escapeValue:false}}).then(()=>{
      const root=createRoot(document.getElementById('root'))
      window.show=mode=>{if(mode==='board'){useAssistantStore.setState({workbenchDomain:'personal'});root.render(<KnowledgeWorkbench isOpen onClose={()=>root.render(null)}/>)}else if(mode==='mcp')root.render(<ExternalMcpPanel/>);else root.render(<AssistantTool active workspaceId={null} workspacePath={null}/>)}
      window.show(window.mode)
    })
  ` }, loader: { '.svg': 'dataurl' }, bundle: true, write: false, outfile: 'assistant-ui.js', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'i18n-fixture', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n;export const changeLanguage=()=>{}", loader: 'ts' }))
  } }] })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })
async function mount(page: Page, mode: string) {
  page.setDefaultTimeout(4000)
  await page.route('http://localhost/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://localhost/')
  await page.setContent('<div id="root"></div>')
  await page.addStyleTag({ content: css + '\n*{box-sizing:border-box}body{margin:0}#root{height:100vh}:root{--shell-accent:#ff7830;--text:#ddd;--text-secondary:#bbb;--text-dim:#888;--border:#333}' })
  await page.evaluate(value => { (window as any).mode = value }, mode)
  await page.addScriptTag({ content: script })
}
it('combines three sections and follows independent switches and legacy review jumps', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
  try {
    await mount(page, 'assist')
    await page.getByRole('button', {name:'Profile',exact:true}).click()
    await page.getByText('Tree', {exact:true}).waitFor()
    await page.evaluate(() => (window as any).dock.getState().openTool('review'))
    await expect.poll(() => page.getByRole('button',{name:'Review',exact:true}).getAttribute('aria-pressed')).toBe('true')
    await page.evaluate(() => (window as any).features.setState({knowledge:false}))
    expect(await page.getByRole('button',{name:'Knowledge',exact:true}).count()).toBe(0)
    await page.getByRole('button',{name:'Profile',exact:true}).click()
    await page.getByText('Tree',{exact:true}).waitFor()
    await page.evaluate(() => (window as any).features.setState({persona:false}))
    expect(await page.getByRole('region',{name:'Assistant',exact:true}).count()).toBe(0)
    await page.evaluate(() => (window as any).features.setState({knowledge:true}))
    await page.getByRole('button',{name:'Knowledge',exact:true}).waitFor()
    expect(await page.getByRole('button',{name:'Profile',exact:true}).count()).toBe(0)
  } finally { await page.close() }
})
it('uses the full workbench for searchable memory cards, readable details and narrow layouts', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await mount(page, 'board')
    await page.getByRole('searchbox',{name:'Search personal memories'}).waitFor()
    await mkdir('artifacts/memory-domain-acceptance',{recursive:true})
    await page.evaluate(() => document.documentElement.dataset.theme='dark')
    await page.waitForTimeout(350)
    await page.screenshot({path:'artifacts/memory-domain-acceptance/personal-board-overview.png'})
    const shell = page.getByRole('region',{name:'Knowledge & memory'})
    expect((await shell.boundingBox())!.width).toBeGreaterThan(1300)
    await page.getByRole('searchbox').fill('explicit')
    await page.getByRole('button').filter({hasText:'Prefer explicit error handling'}).click()
    await page.getByRole('complementary',{name:'Read details'}).waitFor()
    await page.getByText('Source',{exact:true}).click()
    expect(await page.getByRole('complementary').innerText()).toContain('source-1')
    await mkdir('artifacts/memory-domain-acceptance',{recursive:true})
    await page.screenshot({path:'artifacts/memory-domain-acceptance/personal-board-wide.png'})
    await page.setViewportSize({width:640,height:720})
    await page.evaluate(() => document.documentElement.dataset.theme='planche')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({path:'artifacts/memory-domain-acceptance/personal-board-narrow.png'})
    await page.getByRole('button',{name:'Back',exact:true}).click()
    await page.getByRole('searchbox').fill('')
    await page.getByRole('button',{name:'Recent memories 1',exact:true}).click()
    await page.getByText('Investigating terminal MCP coverage.',{exact:true}).waitFor()
  } finally { await page.close() }
})
it('shares the workbench shell across domains, isolates review queues and shows real loading feedback', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await mount(page, 'board')
    await page.getByRole('searchbox').waitFor()
    await page.evaluate(() => { (window as any).seedReview(); document.documentElement.dataset.theme = 'dark' })
    const shell = page.getByRole('region', { name: 'Knowledge & memory', exact: true })
    const before = (await shell.boundingBox())!
    const domains = page.getByRole('navigation', { name: 'Knowledge & memory', exact: true })
    await page.evaluate(() => (window as any).delayCandidates = true)
    await domains.getByRole('button', { name: 'Project knowledge', exact: true }).click()
    await page.getByRole('status', { name: 'Loading knowledge records' }).waitFor()
    expect(await page.getByRole('group', { name: 'Memory scope' }).count()).toBe(0)
    await page.evaluate(() => { (window as any).delayCandidates = false; (window as any).finishCandidates() })
    await page.getByRole('button').filter({ hasText: 'Engineering review item' }).waitFor()
    await page.getByRole('button').filter({ hasText: 'Engineering review item' }).click()
    await page.getByRole('article').waitFor()
    const engineeringCardStyle = await page.getByRole('article').evaluate(element => {
      const style = getComputedStyle(element)
      return [style.borderRadius, style.borderTopWidth, style.padding, style.backgroundColor]
    })
    expect(await page.getByText('Personal review one', { exact: true }).count()).toBe(0)
    const after = (await shell.boundingBox())!
    expect(after).toEqual(before)
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/unified-engineering.png', animations: 'disabled' })
    await domains.getByRole('button', { name: 'Personal profile', exact: true }).click()
    await page.getByRole('searchbox').waitFor()
    await page.getByRole('navigation', { name: 'Personal profile', exact: true }).getByRole('button', { name: 'Personal memory review', exact: true }).click()
    await page.getByText('Personal review one', { exact: true }).waitFor()
    const cards = page.getByRole('article')
    expect(await cards.count()).toBe(2)
    expect(await cards.first().evaluate(element => {
      const style = getComputedStyle(element)
      return [style.borderRadius, style.borderTopWidth, style.padding, style.backgroundColor]
    })).toEqual(engineeringCardStyle)
    const first = (await cards.nth(0).boundingBox())!
    const second = (await cards.nth(1).boundingBox())!
    expect(Math.abs(first.y - second.y)).toBeLessThan(2)
    expect(second.x).toBeGreaterThan(first.x)
    expect(await page.getByText('Engineering review item', { exact: true }).count()).toBe(0)
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/unified-personal-review.png', animations: 'disabled' })
    await page.setViewportSize({ width: 640, height: 720 })
    await page.evaluate(() => document.documentElement.dataset.theme = 'planche')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/unified-review-narrow.png', animations: 'disabled' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await domains.getByRole('button', { name: 'Project knowledge', exact: true }).click()
    await page.getByRole('button').filter({ hasText: 'Engineering review item' }).waitFor()
    expect(await page.locator('[data-domain="engineering"]').evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running' && ['memory-content-in', 'knowledge-workbench-in'].some(name => (animation as CSSAnimation).animationName?.includes(name))))).toBe(false)
  } finally { await page.close() }
})

it('keeps sidebar profile editing and compact review usable at 320 pixels', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 760 } })
  try {
    await mount(page, 'assist')
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    await page.getByText('Tree', { exact: true }).waitFor()
    expect(await page.getByText('source-1', { exact: true }).isVisible()).toBe(false)
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/assistant-profile-compact.png', animations: 'disabled' })
    await page.getByRole('button', { name: 'Edit personal profile', exact: true }).click()
    const form = page.getByRole('form', { name: 'Edit personal profile', exact: true })
    await form.getByRole('textbox').first().fill('Updated identity')
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/assistant-profile-editor.png', animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await form.getByRole('button', { name: 'Save profile', exact: true }).click()
    await page.getByText('Tree', { exact: true }).waitFor()
    expect(await page.evaluate(() => (window as any).calls.at(-1))).toMatchObject({ expectedHash: 'profile-hash', overrides: { identity: 'Updated identity' } })
    await page.evaluate(() => { (window as any).seedReview(); document.documentElement.dataset.theme = 'planche' })
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page.getByText('Personal review one', { exact: true }).waitFor()
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/assistant-review-compact.png', animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await page.close() }
})

it('allows stale client repair and distinguishes service checks from client verification', async () => {
  const page = await browser.newPage()
  try {
    await mount(page,'mcp')
    await page.getByRole('button',{name:'Update configuration',exact:true}).click()
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['codex'])
    await page.getByRole('button',{name:'Test service connection',exact:true}).click()
    await page.getByText('Service handshake, five tools and query passed. External client connection is not verified.',{exact:true}).waitFor()
    expect(await page.getByText('Client MCP integration is not verified. No configuration will be written.',{exact:true}).count()).toBe(3)
    expect(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    await page.setViewportSize({width:800,height:1000})
    await page.evaluate(() => document.documentElement.dataset.theme='dark')
    await page.screenshot({path:'artifacts/memory-domain-acceptance/mcp-settings-cards-dark.png',fullPage:true})
    await page.setViewportSize({width:420,height:800})
    await page.evaluate(() => document.documentElement.dataset.theme='planche')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({path:'artifacts/memory-domain-acceptance/mcp-settings-cards-planche.png',fullPage:true})
  } finally { await page.close() }
})
