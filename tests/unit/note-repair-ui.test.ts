import { beforeAll, afterAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState,useEffect} from 'react'; import {createRoot} from 'react-dom/client';
    import i18n from 'i18next';import {initReactI18next} from 'react-i18next';
    import blueprint from './src/renderer/src/i18n/locales/en/blueprint.json';
    import {NoteReviewPanel} from './src/renderer/src/components/blueprint/NoteReviewPanel';
    import {BlueprintAttention} from './src/renderer/src/components/blueprint/BlueprintAttention';
    import {BlueprintMaintenancePanel} from './src/renderer/src/components/blueprint/BlueprintMaintenancePanel';
    import {useBlueprintStore} from './src/renderer/src/stores/blueprint';
    import {useBlueprintReviewStore} from './src/renderer/src/stores/blueprint-review';
    import {useBlueprintMaintenanceStore} from './src/renderer/src/stores/blueprint-maintenance';
    import {useWorkspaceStore} from './src/renderer/src/stores/workspace';
    import {useNoteSourceStore} from './src/renderer/src/stores/note-source';
    import {useNoteRepairStore} from './src/renderer/src/stores/note-repair';
    import './src/renderer/src/styles/globals.css';import './src/renderer/src/styles/themes.generated.css';
    import './src/renderer/src/components/blueprint/blueprint.css';
    let sequence=0;Object.defineProperty(crypto,'randomUUID',{value:()=> '10000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')});
    const noteId='00000000-0000-4000-8000-000000000001',repoId='00000000-0000-4000-8000-000000000002';
    const findingIds=['00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
    const findings=['Recovery condition missing','Wrong format description'].map((summary,i)=>({id:findingIds[i],summary,category:'omission',explanation:'Evidence is missing.',suggestion:'Describe recovery.',citations:[{path:'.agents/notes/topic.md',quote:'Recovery'}],verification:'not-configured',stale:false}));
    window.view={context:{repoId,workspacePath:'C:/fixture',branch:'main'},revision:1,sourceComplete:true,activities:[],items:[{noteId,reportRevision:7,availability:'available',source:{path:'.agents/notes/topic.md'},report:{findings,coverage:'complete',limitations:[],stale:false}}]};
    const projection={id:'fixture',nodeIds:['node'],nodes:{node:{id:'node',title:'Recovery Note',sourceUri:'note://'+repoId+'/'+noteId}},noteSnapshot:{repoId,coverage:{checkoutRoot:'C:/fixture'},entries:[]}};
    useBlueprintStore.setState({currentBlueprint:projection,blueprintWorkspace:{fixture:'C:/fixture'},workspaceStates:{ws:{projectId:'fixture',state:'ok',workspacePath:'C:/fixture'}},refreshAfterAnalysis:async()=>{window.refreshes++}});
    useWorkspaceStore.setState({activeWorkspaceId:'ws',workspaces:[{id:'ws',name:'Fixture',path:'C:/fixture'},{id:'other',name:'Other',path:'C:/other'}]});
    useBlueprintReviewStore.setState({views:{'C:/fixture':structuredClone(window.view)},errors:{}});
    window.repairListeners=new Set();window.refreshes=0;window.prepares=[];window.sent=[];window.stops=0;window.chatSends=[];window.chatStops=0;
    const controller={conversationId:'chat',engineeringContext:{domain:'project',viewRef:{viewId:'workspace-dialog'},contextRevision:0},isStreaming:false,messages:[],pendingContent:'',modelOptions:[],toolTraces:[],resourceController:{resources:[{workspaceId:'ws'}],detachWorkspace:()=>{},attachWorkspace:()=>{}},setEngineeringContext:()=>{},setApprovalMode:()=>{},clear:()=>{},stop:()=>{window.stops++},repairNote:(id,text)=>{window.sent.push({id,text});return true}};
    const repairController={...controller,conversationId:'repair',engineeringContext:{domain:'project',viewRef:{viewId:'workspace-note-repair'},contextRevision:0},selectModel:()=>{},clear:()=>{},stop:()=>{window.stops++}};
    controller.send=text=>window.chatSends.push(text);controller.stop=()=>{window.chatStops++};
    window.fixtureRegistry={persistenceReady:true,bindPanelProject:context=>context.viewRef.viewId==='workspace-note-repair'?'repair':'chat',getController:id=>id==='repair'?repairController:{...controller,isStreaming:!!window.chatBusy}};
    window.setBusy=value=>{window.chatBusy=value;useNoteRepairStore.setState(state=>({cards:Object.fromEntries(Object.entries(state.cards).map(([key,card])=>[key,{...card}]))}))};
    window.sourceReads=0;window.fixtureSource={uri:'note://'+repoId+'/'+noteId,relPath:'.agents/notes/topic.md',sourceHash:'new-hash',doc:{id:noteId,title:'Recovery Note',body:'Repaired body',kind:'requirement'},raw:'Repaired body',view:{headings:[],links:[]}};
    window.retrySource=()=>useNoteSourceStore.getState().refresh('C:/fixture',window.fixtureSource.uri,true);
    window.electron={harness:{noteRead:async()=>{window.sourceReads++;if(window.holdSource)await new Promise(resolve=>{window.finishSource=resolve});if(window.failSource)throw Error('Source unavailable');return structuredClone(window.fixtureSource)}},llm:{onAgentEvent:listener=>{window.repairListeners.add(listener);return()=>window.repairListeners.delete(listener)}},blueprintReview:{readSaved:async()=>{if(window.holdSaved)await new Promise(resolve=>{window.finishSaved=resolve});if(window.failSaved)throw Error('Suggestion sync unavailable');return structuredClone(window.view)},read:async()=>{const view=structuredClone(window.view);if(window.holdRead)await new Promise(resolve=>{window.finishRead=resolve});if(window.failRead)throw Error('Suggestion sync unavailable');return view},activityRead:async()=>({root:'C:/fixture',revision:1,activities:[]}),onActivityChanged:()=>()=>{},onReadChanged:()=>()=>{},
      repairPrepare:async input=>{window.prepares.push(input);if(window.failPrepare)throw Error('Source changed');if(window.holdPrepare)await new Promise(resolve=>{window.releasePrepare=resolve});return{id:'plan-'+window.prepares.length,context:input.context,intent:input.intent,kind:input.kind,noteId,uri:'note://'+repoId+'/'+noteId,path:'.agents/notes/topic.md',title:'Recovery Note',summaries:input.kind==='structure'?['Invalid format']:findings.filter(f=>input.findingIds.includes(f.id)).map(f=>f.summary)}},
      repairDiff:async()=>({before:'Before',after:'After',path:'.agents/notes/topic.md'}),repairUndo:async id=>({id,phase:'reverted'}),cancel:async()=>{},run:async()=>{},
      repairRetryReview:async id=>{window.reviewRetries=(window.reviewRetries||0)+1;await new Promise(resolve=>{window.finishReviewRetry=resolve});window.view.items[0].report={findings:[],coverage:'complete',source:{hash:'new-hash'}};delete window.view.items[0].awaitingReview;return{id,phase:'resolved',changed:true,remaining:0,afterHash:'new-hash'}}
    }};
    window.updateRepair=update=>{const card=useNoteRepairStore.getState().cards['c:/fixture'];if(update.phase==='resolved'){window.view.revision++;window.view.items[0].report.findings=window.view.items[0].report.findings.filter(f=>!card.input.findingIds.includes(f.id))};useNoteRepairStore.getState().receive({id:card.id,...update})};
    window.pushResults=()=>useBlueprintReviewStore.getState().receiveResults(structuredClone({...window.view,revision:++window.view.revision}));
    window.refreshRepairSuggestions=()=>useNoteRepairStore.getState().refresh('C:/fixture','suggestions');
    window.refreshRepairSource=()=>useNoteRepairStore.getState().refresh('C:/fixture','source');
    window.repairCard=()=>useNoteRepairStore.getState().cards['c:/fixture'];
    window.refreshReview=()=>useBlueprintReviewStore.getState().refreshAfterChange('C:/fixture');
    window.switchWorkspace=()=>useWorkspaceStore.setState({activeWorkspaceId:'other'});
    function Fixture(){const request=useBlueprintMaintenanceStore(s=>s.openRequest);const [open,setOpen]=useState(false);useEffect(()=>{if(request)setOpen(true)},[request]);window.openRight=()=>setOpen(true);return <div style={{display:'grid',gridTemplateColumns:'360px 1fr 360px',height:'800px'}}><div style={{overflow:'auto'}}><NoteReviewPanel rootPath='C:/fixture' noteId={noteId} kind='requirement' sourceHash='hash' onLocate={()=>{}}/></div><div><BlueprintAttention blueprint={projection} workspacePath='C:/fixture'/></div>{open&&<BlueprintMaintenancePanel onClose={()=>setOpen(false)}/>}</div>}
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{blueprint}},interpolation:{escapeValue:false}}).then(()=>createRoot(document.getElementById('root')).render(<Fixture/>));
  ` }, bundle:true, write:false,outfile:'repair-ui.js',loader:{'.svg':'dataurl'},jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'fixture',setup(builder){
    builder.onLoad({filter:/[/\\]i18n[/\\]index\.ts$/},()=>({contents:"import i18n from 'i18next';export default i18n;export const changeLanguage=value=>i18n.changeLanguage(value)",loader:'ts'}));
    builder.onLoad({filter:/JanusChatProvider\.tsx$/},()=>({contents:'export const useJanusChatRegistry=()=>window.fixtureRegistry',loader:'ts'}));
    builder.onLoad({filter:/[/\\]JanusChat\.tsx$/},()=>({contents:'export function JanusChat({onSend}){return <div style={{display:"flex",flex:1,flexDirection:"column",minHeight:0}}><div style={{flex:1}}>Workspace conversation</div><textarea aria-label="Chat input"/><button onClick={()=>onSend(document.querySelector("textarea").value)}>Send chat</button></div>}',loader:'tsx'}));
    builder.onLoad({filter:/(NoteChatActivity|NoteWorkingScope)\.tsx$/},()=>({contents:'export const NoteChatActivity=()=>null;export const NoteTurnActivity=()=>null;export const NoteWorkingScope=()=>null',loader:'tsx'}));
  }}]})
  script=result.outputFiles.find(file=>file.path.endsWith('.js'))!.text;css=result.outputFiles.find(file=>file.path.endsWith('.css'))!.text
})
afterAll(async()=>{await browser?.close()})
async function mount(page: Page){page.setDefaultTimeout(5000);await page.setContent('<html data-theme="planche"><body><div id="root"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.getByRole('button',{name:'Suggestions',exact:false}).first().waitFor()}

it('opens details from the visible hint and supports keyboard collapse',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce'})
 try{
  await mount(page);await page.locator('.bp-note-review__toggle').click();await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  const card=page.locator('section.bp-note-repair'),details=card.locator('.bp-note-repair__details')
  expect(await details.isVisible()).toBe(false)
  const hint=card.locator('.bp-note-repair__details-toggle')
  await hint.click();expect(await hint.getAttribute('aria-expanded')).toBe('true');expect(await details.isVisible()).toBe(true)
  await hint.focus();await page.keyboard.press('Enter');expect(await hint.getAttribute('aria-expanded')).toBe('false');expect(await details.isVisible()).toBe(false)
 }finally{await page.close()}
})

it('retires old UI findings immediately and retries only review without another Janus repair', async () => {
 const page=await browser.newPage({reducedMotion:'reduce'})
 try {
  await mount(page); await page.getByRole('button',{name:'Suggestions 1'}).click()
  await page.locator('.bp-attention-panel article').getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.evaluate(()=>{const w=window as any; w.view.items[0].report=null;w.view.items[0].awaitingReview={hash:'new-hash'};w.pushResults();w.updateRepair({phase:'review-incomplete',changed:true,afterHash:'new-hash',error:'Missing evidence',changes:{added:3,removed:2}})})
  const card=page.locator('section.bp-note-repair')
  await card.getByText('Note updated; re-review incomplete',{exact:true}).waitFor()
  await card.getByText('Body: 3 lines added, 2 removed',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Suggestions 0'}).waitFor()
  expect(await page.locator('.bp-attention-panel__issue').count()).toBe(0)
  await card.getByRole('button',{name:'Retry review',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).reviewRetries)).toBe(1)
  expect(await page.evaluate(()=>(window as any).prepares.length)).toBe(1)
  expect(await card.getByRole('button',{name:'Retry review',exact:true}).count()).toBe(0)
  await page.evaluate(()=>(window as any).finishReviewRetry())
  await card.getByText('Repaired and review passed',{exact:true}).first().waitFor()
  expect(await page.evaluate(()=>(window as any).sent.length)).toBe(1)
  expect(await card.getByText('Missing evidence',{exact:true}).count()).toBe(0)
 } finally {await page.close()}
})

it('keeps the right result in sync when a current-version review completes from the left panel', async () => {
 const page=await browser.newPage({reducedMotion:'reduce'})
 try {
  await mount(page);await page.locator('.bp-note-review__toggle').click();await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.evaluate(()=>{const w=window as any;w.view.items[0].report=null;w.view.items[0].awaitingReview={hash:'new-hash'};w.updateRepair({phase:'review-incomplete',changed:true,afterHash:'new-hash',error:'Review unavailable'})})
  const card=page.locator('section.bp-note-repair');await card.getByRole('button',{name:'Retry review',exact:true}).waitFor()
  await page.evaluate(()=>{const w=window as any;delete w.view.items[0].awaitingReview;w.view.items[0].report={source:{hash:'new-hash'},findings:[],coverage:'complete',stale:false};w.pushResults()})
  await card.getByText('Repaired and review passed',{exact:true}).first().waitFor()
  expect(await card.getByRole('button',{name:'Retry review',exact:true}).count()).toBe(0)
 } finally {await page.close()}
})

it('moves the clicked issue card to the right, shows real phases and removes only verified suggestions',async()=>{
 const page=await browser.newPage({viewport:{width:1400,height:900}})
 try{
  await mount(page);await page.getByRole('button',{name:'Suggestions 1'}).click()
  const issue=page.locator('.bp-attention-panel article').filter({hasText:'Recovery condition missing'})
  const source=await issue.boundingBox();await issue.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await page.waitForFunction(()=>{const el=document.querySelector('.bp-note-repair--flying');return el?.getAnimations().some(a=>(a.currentTime||0)>100&&(a.currentTime||0)<350)})
  const flying=await page.locator('.bp-note-repair--flying').boundingBox();expect(flying!.x).toBeGreaterThan(source!.x)
  await mkdir('artifacts/note-repair',{recursive:true});await page.screenshot({path:'artifacts/note-repair/transfer.png'})
  const card=page.locator('section.bp-note-repair');await card.getByText('Reading Note',{exact:true}).first().waitFor();await card.getByRole('button',{name:'Recovery Note',exact:false}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  expect(await page.evaluate(()=>(window as any).prepares[0])).toMatchObject({kind:'suggestions',reportRevision:7,findingIds:['00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004']})
  await page.evaluate(()=>(window as any).updateRepair({phase:'editing',changed:true}));await card.locator('[data-active=true]').getByText('Adjusting content').waitFor()
  await page.evaluate(()=>(window as any).updateRepair({phase:'reviewing'}));await card.locator('[data-active=true]').getByText('Reviewing current Note').waitFor()
  await page.evaluate(()=>(window as any).updateRepair({phase:'resolved',changed:true,resolved:1,remaining:0}));await card.getByText('Repaired and review passed').first().waitFor()
  await expect.poll(()=>page.locator('.bp-note-review__finding').count()).toBe(0)
  await card.getByRole('button',{name:'View changes'}).click();await card.getByText('After',{exact:true}).waitFor()
  await page.waitForFunction(()=>!document.querySelector('.bp-note-repair--flying'));await page.screenshot({path:'artifacts/note-repair/resolved.png'})
 }finally{await page.close()}
})
it('supports whole-Note handoff and read-only discussion, and preserves issues on failure',async()=>{
 const page=await browser.newPage()
 try{
  await mount(page);await page.locator('.bp-note-review__toggle').click()
  await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  expect(await page.evaluate(()=>(window as any).prepares[0].findingIds.length)).toBe(2)
  await page.evaluate(()=>(window as any).updateRepair({phase:'failed',error:'Review unavailable',changed:true}))
  await page.locator('section.bp-note-repair').getByRole('button',{name:'Recovery Note',exact:false}).click();await page.getByRole('alert').getByText('Review unavailable').waitFor();expect(await page.locator('.bp-note-review__finding').count()).toBe(2)
  await page.locator('.bp-note-review__content > .bp-repair-actions').getByRole('button',{name:'Discuss with Janus'}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(2)
  expect(await page.evaluate(()=>(window as any).prepares[1].intent)).toBe('discuss')
  await page.evaluate(()=>(window as any).updateRepair({phase:'discussed'}));await page.getByText('Discussion complete',{exact:true}).waitFor()
 }finally{await page.close()}
})
it('queues behind a busy conversation and cancels a pending handoff on workspace switch',async()=>{
 const page=await browser.newPage()
 try{
  await mount(page);await page.evaluate(()=>{(window as any).setBusy(true);(window as any).holdPrepare=true});await page.locator('.bp-note-review__toggle').click();await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).prepares.length)).toBe(1)
  await page.evaluate(()=>(window as any).switchWorkspace());await page.evaluate(()=>(window as any).releasePrepare())
  await page.waitForTimeout(150);expect(await page.evaluate(()=>(window as any).sent.length)).toBe(0)
 }finally{await page.close()}
})
it('reduced motion transfers immediately, shows preparation failures and allows a fresh retry',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce'})
 try{
  await mount(page);await page.evaluate(()=>(window as any).failPrepare=true);await page.locator('.bp-note-review__toggle').click();await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await page.locator('section.bp-note-repair').getByText('Source changed').first().waitFor();expect(await page.locator('.bp-note-repair--flying').count()).toBe(0)
  await page.evaluate(()=>(window as any).failPrepare=false);await page.locator('section.bp-note-repair').getByRole('button',{name:'Recovery Note',exact:false}).click();await page.getByRole('button',{name:'Try again',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
 }finally{await page.close()}
})

it('repairs independently while chat is busy, keeps the composer usable and stops only repair',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1080,height:800}})
 try{
  await mount(page);await page.evaluate(()=>{document.documentElement.dataset.theme='dark';(window as any).setBusy(true)})
  await page.locator('.bp-note-review__toggle').click();await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  const card=page.locator('section.bp-note-repair');expect(await card.locator('.bp-note-repair__details').isVisible()).toBe(false)
  expect((await card.boundingBox())!.height).toBeLessThan(115)
  await page.getByRole('textbox',{name:'Chat input'}).fill('Continue chatting');await page.getByRole('button',{name:'Send chat'}).click()
  expect(await page.evaluate(()=>(window as any).chatSends)).toEqual(['Continue chatting'])
  await card.getByRole('button',{name:'Recovery Note',exact:false}).click()
  const input=await page.getByRole('textbox',{name:'Chat input'}).boundingBox();expect(input!.y+input!.height).toBeLessThanOrEqual(800)
  const bounds=await page.locator('section.bp-note-repair').boundingBox();expect(bounds!.width).toBeLessThanOrEqual(336)
  await page.screenshot({path:'artifacts/note-repair/dark-loading.png'})
  await page.locator('section.bp-note-repair').getByRole('button',{name:'Cancel',exact:true}).click();await page.getByText('Cancelled',{exact:true}).waitFor()
  expect(await page.evaluate(()=>(window as any).stops)).toBe(1);expect(await page.evaluate(()=>(window as any).chatStops)).toBe(0)
 }finally{await page.close()}
})

it('hands a malformed source diagnostic to the same right-panel repair card',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce'})
 try{
  await mount(page);await page.evaluate(async()=>{const w=window as any;w.view.structure={complete:true,checked:2,issues:[{path:'.agents/notes/broken.md',hash:'a'.repeat(64),code:'SCHEMA_INVALID',message:'Invalid JSON delimiter'}]};await w.refreshReview();})
  await page.getByRole('button',{name:'Suggestions 2'}).click()
  const row=page.locator('.bp-attention-panel article').filter({hasText:'.agents/notes/broken.md'});await row.getByRole('button',{name:'Fix format'}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  expect(await page.evaluate(()=>(window as any).prepares[0])).toMatchObject({kind:'structure',path:'.agents/notes/broken.md',hash:'a'.repeat(64)})
 }finally{await page.close()}
})
it('retains late host write evidence after the user has cancelled the stream',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce'})
 try{
  await mount(page);await page.locator('.bp-note-review__toggle').click();await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.locator('section.bp-note-repair').getByRole('button',{name:'Cancel',exact:true}).click()
  await page.evaluate(()=>{const w=window as any;for(const listener of w.repairListeners)listener({type:'note_repair',requestId:'old-stream',update:{id:w.sent[0].id,phase:'cancelled',changed:true}})})
  const card=page.locator('section.bp-note-repair');await card.getByRole('button',{name:'Recovery Note',exact:false}).click();await card.getByText('Note updated; re-review incomplete',{exact:true}).waitFor();await card.getByRole('button',{name:'View changes'}).waitFor()
 }finally{await page.close()}
})

it('does not redirect a retry to another branch without a new issue selection',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce'})
 try{
  await mount(page);await page.locator('.bp-note-review__toggle').click();await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.evaluate(()=>{const w=window as any;w.updateRepair({phase:'failed',error:'Branch changed'});w.view.context.branch='other'})
  await page.locator('section.bp-note-repair').getByRole('button',{name:'Recovery Note',exact:false}).click();await page.getByRole('button',{name:'Try again',exact:true}).click()
  await page.locator('[data-sync=suggestions]').getByText('工作区或分支已变化，请重新打开当前建议',{exact:false}).waitFor()
  expect(await page.evaluate(()=>(window as any).prepares.length)).toBe(1)
 }finally{await page.close()}
})


it('delivers the written Note while suggestion reads wait and reports only the failed domain', async () => {
 const page=await browser.newPage({reducedMotion:'reduce'})
 try {
  await mount(page);await page.locator('.bp-note-review__toggle').click()
  await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.evaluate(()=>{const w=window as any;w.holdSaved=true;w.updateRepair({phase:'resolved',changed:true,remaining:0})})
  await page.waitForFunction(()=>Boolean((window as any).finishSaved))
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.source?.state)).toBe('ready')
  expect(await page.evaluate(()=>(window as any).refreshes)).toBe(0)
  await page.evaluate(()=>{const w=window as any;w.failSaved=true;w.holdSaved=false;w.finishSaved()})
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.suggestions?.error)).toBe('Suggestion sync unavailable')
  // A successful model outcome alone cannot optimistically remove the stored findings.
  expect(await page.locator('.bp-note-review__finding').count()).toBe(2)
 } finally {await page.close()}
})

it('delivers verified written bytes before the re-review finishes', async () => {
 const page=await browser.newPage({reducedMotion:'reduce'})
 try {
  await mount(page);await page.locator('.bp-note-review__toggle').click()
  await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.evaluate(()=>{const w=window as any;w.updateRepair({phase:'editing',changed:true,afterHash:'new-hash'})})
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.source?.state)).toBe('ready')
  expect(await page.evaluate(()=>(window as any).repairCard().previewHash)).toBe('new-hash')
  expect(await page.evaluate(()=>(window as any).repairCard().phase)).toBe('editing')
  expect(await page.locator('.bp-note-review__finding').count()).toBe(2)
 } finally {await page.close()}
})


it('retries only the failed source, clears the old error while waiting and recovers from background delivery', async () => {
 const page=await browser.newPage({reducedMotion:'reduce'})
 try {
  await mount(page);await page.locator('.bp-note-review__toggle').click()
  await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.evaluate(()=>{const w=window as any;w.failSource=true;w.updateRepair({phase:'unresolved',changed:true,afterHash:'new-hash',remaining:1})})
  const source=page.locator('[data-sync=source]')
  await source.getByRole('button',{name:'Retry sync',exact:true}).waitFor()
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.suggestions?.state)).toBe('ready')
  await page.evaluate(()=>{const w=window as any;w.failSource=false;w.holdSource=true})
  await source.getByRole('button',{name:'Retry sync',exact:true}).click()
  await source.getByRole('button',{name:'Syncing…',exact:true}).waitFor()
  expect(await source.getByRole('button').isDisabled()).toBe(true)
  expect(await source.innerText()).not.toContain('Source unavailable')
  await page.evaluate(()=>{const w=window as any;w.holdSource=false;w.finishSource()})
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.source?.state)).toBe('ready')
  await page.evaluate(()=>{const w=window as any;w.failSource=true;void w.retrySource().catch(()=>{})})
  // Trigger a card retry failure, then let a separate successful body read heal its warning.
  await page.evaluate(async()=>{const w=window as any;w.failSource=true;await w.refreshRepairSource()})
  await source.getByRole('button',{name:'Retry sync',exact:true}).waitFor()
  await page.evaluate(async()=>{const w=window as any;w.failSource=false;await w.retrySource()})
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.source?.state)).toBe('ready')
  expect(await page.evaluate(()=>(window as any).repairCard().phase)).toBe('unresolved')
 }finally{await page.close()}
})


it('updates committed suggestions during a stuck full read and does not revive a healed warning', async () => {
 const page=await browser.newPage({reducedMotion:'reduce'})
 try {
  await mount(page);await page.locator('.bp-note-review__toggle').click()
  await page.getByRole('button',{name:'Fix this Note · 2 suggestions',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1)
  await page.evaluate(()=>{const w=window as any;w.holdRead=true;void w.refreshReview()})
  await page.waitForFunction(()=>Boolean((window as any).finishRead))
  await page.evaluate(()=>{const w=window as any;w.updateRepair({phase:'resolved',changed:true,afterHash:'new-hash',remaining:0})})
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.suggestions?.state)).toBe('ready')
  await expect.poll(()=>page.locator('.bp-note-review__finding').count()).toBe(0)
  expect(await page.evaluate(()=>(window as any).repairCard().sync.source.state)).toBe('ready')
  await page.evaluate(()=>{const w=window as any;w.holdRead=false;w.finishRead()})
  await expect.poll(()=>page.locator('.bp-note-review__finding').count()).toBe(0)
  // A late failed saved read cannot restore an error after a newer result push.
  await page.evaluate(()=>{const w=window as any;w.holdSaved=true;void w.refreshRepairSuggestions()})
  await page.waitForFunction(()=>Boolean((window as any).finishSaved))
  await page.evaluate(()=>{const w=window as any;w.pushResults();w.failSaved=true;w.holdSaved=false;w.finishSaved()})
  await expect.poll(()=>page.evaluate(()=>(window as any).repairCard().sync?.suggestions?.state)).toBe('ready')
 }finally{await page.close()}
})
