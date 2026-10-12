import { beforeAll, afterAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { build } from 'esbuild'
let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import i18n from 'i18next'; import { initReactI18next } from 'react-i18next';
    import blueprint from './src/renderer/src/i18n/locales/en/blueprint.json';
    import { NoteReviewPanel } from './src/renderer/src/components/blueprint/NoteReviewPanel';
    import { BlueprintSettingsPanel } from './src/renderer/src/components/blueprint/BlueprintSettingsPanel';
    import { BlueprintReviewActivity } from './src/renderer/src/components/blueprint/BlueprintReviewActivity';
    import { useBlueprintReviewStore } from './src/renderer/src/stores/blueprint-review';
    import { useBlueprintActivityStore } from './src/renderer/src/stores/blueprint-review-activity';
    import { useEditorStore } from './src/renderer/src/stores/editor';
    import { BlueprintAttention } from './src/renderer/src/components/blueprint/BlueprintAttention';
    import { DEFAULT_BLUEPRINT_REVIEW_SETTINGS } from './src/shared/blueprint-review-settings';
    import './src/renderer/src/styles/globals.css';
    import './src/renderer/src/styles/themes.generated.css';
    import './src/renderer/src/components/blueprint/blueprint.css';
    const noteId='00000000-0000-4000-8000-000000000001';
    window.calls={run:0,close:0,settings:0,probe:0,credentialReads:0,credentialWrites:0};window.saved=structuredClone(DEFAULT_BLUEPRINT_REVIEW_SETTINGS);window.savedCredential='';window.activityListeners=new Set();window.sourceListeners=new Set();window.readListeners=new Set();window.resultListeners=new Set();window.sourceReads=0;
    window.view={context:{repoId:noteId,workspacePath:'C:/fixture',branch:'main'},revision:1,sourceComplete:true,activities:[],items:[]};
    const findings=['First issue','Second issue'].map((summary,i)=>({id:'finding-'+i,summary,category:'omission',explanation:'A required recovery condition is missing.',suggestion:'Describe the recovery condition.',citations:[{path:'.agents/notes/module.md',quote:'Recovery is planned.'}],verification:'failed',verificationDetail:{question:'Is the issue supported?',model:'jev',error:'Verification unavailable'},stale:false}));
    window.electron={harness:{onChanged:callback=>{window.sourceListeners.add(callback);return()=>window.sourceListeners.delete(callback)}},llm:{getTerminalProviders:async()=>[{id:'provider',name:'Existing provider',enabled:true,models:['alpha','beta']}]},blueprintReview:{mcpStatus:async()=>({clients:[]}),mcpProbe:async()=>({ok:true,tools:[]}),
      onActivityChanged:callback=>{window.activityListeners.add(callback);return()=>window.activityListeners.delete(callback)},
      onResultsChanged:callback=>{window.resultListeners.add(callback);return()=>window.resultListeners.delete(callback)},
      onReadChanged:callback=>{window.readListeners.add(callback);return()=>window.readListeners.delete(callback)},
      read:async()=>{window.sourceReads++;if(window.failRead)throw Error('Source temporarily unavailable');const view=structuredClone(window.view);if(window.holdRead)await new Promise(resolve=>{window.finishRead=()=>{window.holdRead=false;resolve()}});return view},run:async()=>{window.calls.run++;window.view.items=[{noteId,reportRevision:1,availability:'available',error:null,report:{findings:structuredClone(findings),coverage:'complete',limitations:[],stale:false}}];return window.view.items[0]},
      close:async(_context,id,revision,ids)=>{window.calls.close++;const item=window.view.items.find(item=>item.noteId===id);if(item.reportRevision!==revision)throw Error('conflict');item.report.findings=item.report.findings.filter(f=>!ids.includes(f.id));item.reportRevision++;if(!item.report.findings.length)item.report=null;return 'closed'},
      cancel:async()=>{}, settingsGet:async()=>structuredClone(window.saved),settingsUpdate:async input=>{window.calls.settings++;if(window.failSave)throw Error('Disk unavailable');window.saved=structuredClone(input);return structuredClone(window.saved)},
      configurationTest:async()=>{window.calls.probe++;return window.probeResult||{generation:{status:window.saved.generation.modelId?'ready':'missing'},jev:{status:'disabled'}}},
      credentialStatus:async()=>Boolean(window.savedCredential),credentialGet:async()=>{window.calls.credentialReads++;if(window.failCredentialRead)throw Error('Credential unavailable');return window.savedCredential||null},
      credentialSet:async key=>{window.calls.credentialWrites++;window.savedCredential=key.trim()}
    }};
    window.prepareFastStatus=()=>{
      useBlueprintReviewStore.setState({views:{},errors:{}});useBlueprintActivityStore.setState({statuses:{},errors:{}});
      window.fast={root:'C:/fixture',revision:10,automaticSettings:{enabled:true,commits:3},activities:[]};window.fastReads=0;
      window.electron.blueprintReview.activityRead=async()=>{window.fastReads++;const value=structuredClone(window.fast);if(window.holdStatus)await new Promise(resolve=>{window.finishStatus=()=>{window.holdStatus=false;resolve()}});if(window.failStatus)throw Error('Status unavailable');return value};
      window.refreshStatus=()=>useBlueprintActivityStore.getState().refresh('C:/fixture');
      window.emitStatus=update=>{window.fast={...window.fast,...update,revision:window.fast.revision+1};for(const callback of window.activityListeners)callback(structuredClone(window.fast))};
    };
    window.openedFiles=[];useEditorStore.setState({openFile:async(path)=>{window.openedFiles.push(path)}});
    window.refresh=()=>useBlueprintReviewStore.getState().refresh('C:/fixture');
    window.reviewStore=useBlueprintReviewStore;window.emitResults=update=>{for(const callback of window.resultListeners)callback(structuredClone(update))};
    window.currentView=()=>useBlueprintReviewStore.getState().views['C:/fixture'];
    window.pushActivity=(automatic,activities=[])=>{window.view.automatic=automatic;window.view.activities=activities;window.view.activityRevision=(window.view.activityRevision||0)+1;for(const callback of window.activityListeners)callback({root:window.eventRoot||'C:/fixture',revision:window.view.activityRevision,automatic,activities})};
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{blueprint}},interpolation:{escapeValue:false}}).then(()=>{
      const root=createRoot(document.getElementById('root'));
      window.showSettings=()=>root.render(<BlueprintSettingsPanel/>);
      window.showActivity=(blueprint=null)=>root.render(<div style={{containerType:'inline-size'}}><header className='blueprint-workbench-topbar' style={{animation:'none'}}><span className='blueprint-workbench-switch'>Fixture workspace</span><div className='blueprint-workbench-actions'><BlueprintReviewActivity blueprint={blueprint} workspacePath='C:/fixture'/><button className='blueprint-janus-capsule'>Janus</button></div></header></div>);
      window.showAttention=()=>root.render(<header className='blueprint-workbench-topbar' style={{animation:'none'}}><span>Fixture workspace</span><div className='blueprint-workbench-actions'><BlueprintAttention blueprint={{id:'fixture',nodeIds:[],nodes:{},noteSnapshot:{coverage:{checkoutRoot:'C:/fixture'},entries:[]}}} workspacePath='C:/fixture'/><button className='blueprint-janus-capsule'>Janus</button></div></header>);
      window.showReview=(selectedId=noteId)=>root.render(<NoteReviewPanel rootPath='C:/fixture' noteId={selectedId} kind='module' sourceHash='hash' onLocate={(path,quote)=>{window.located={path,quote}}}/>);
      window.showReview();
    });
  ` }, bundle: true, write: false, outfile: 'review-ui.js', loader: { '.svg': 'dataurl' }, jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'fixture-i18n', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next';export default i18n;export const changeLanguage=(value)=>i18n.changeLanguage(value)", loader: 'ts' }))
  } }] })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })
async function mount(page: Page) { page.setDefaultTimeout(4000); await page.setContent('<div id="root"></div>'); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: script }); await page.waitForFunction(() => typeof (window as any).showSettings === 'function') }

it('manual review displays failed JEV honestly, locates evidence, and clears only explicit selections', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.getByRole('button', { name: 'Review this Note' }).waitFor()
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
    await page.getByRole('button', { name: 'Review this Note' }).click()
    await page.getByText('First issue', { exact: true }).click()
    const first = page.locator('.bp-note-review__finding').filter({ has: page.getByText('First issue', { exact: true }) })
    await first.getByText('Score unavailable', { exact: true }).waitFor()
    await first.getByRole('button', { name: /Locate source/ }).click()
    expect(await page.evaluate(() => (window as any).located)).toEqual({ path: '.agents/notes/module.md', quote: 'Recovery is planned.' })
    await first.getByRole('button', { name: 'Handled', exact: true }).click()
    await expect.poll(() => page.getByText('First issue', { exact: true }).count()).toBe(0)
    await page.getByText('Second issue', { exact: true }).click()
    await page.getByRole('button', { name: 'Decline', exact: true }).click()
    await page.getByText('No current suggestions.', { exact: false }).waitFor()
    expect(await page.evaluate(() => (window as any).calls)).toMatchObject({ run: 1, close: 2 })
  } finally { await page.close() }
})

it('settings save without a save button, probe configuration, retain default-off automation and show persistence failures', async () => {
  const page = await browser.newPage()
  try {
    await mount(page); await page.evaluate(() => (window as any).showSettings())
    await page.getByRole('button', { name: 'Suggestion provider', exact: true }).click()
    await page.getByRole('option', { name: 'Existing provider', exact: true }).click()
    await page.getByRole('button', { name: 'Suggestion model', exact: true }).click()
    await page.getByRole('option', { name: 'alpha', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).saved.generation.modelId)).toBe('alpha')
    await page.getByText('Generation: Connection available; JEV scoring: Disabled', { exact: true }).waitFor()
    expect(await page.getByRole('button', { name: /^(Save|Apply)$/ }).count()).toBe(0)
    expect(await page.evaluate(() => (window as any).saved.automatic)).toEqual({ enabled: false, commits: 5 })
    const automatic = page.getByRole('checkbox', { name: 'Automatic review', exact: true })
    expect(await automatic.isChecked()).toBe(false)
    await automatic.focus()
    await page.keyboard.press('Space')
    await expect.poll(() => page.evaluate(() => (window as any).saved.automatic.enabled)).toBe(true)
    await automatic.uncheck()
    await expect.poll(() => page.evaluate(() => (window as any).saved.automatic.enabled)).toBe(false)
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
    await page.evaluate(() => { (window as any).failSave = true })
    await page.getByRole('button', { name: 'Suggestion model', exact: true }).click()
    await page.getByRole('option', { name: 'beta', exact: true }).click()
    await page.getByRole('alert').waitFor()
    expect(await page.evaluate(() => (window as any).saved.generation.modelId)).toBe('alpha')
    expect(await page.getByRole('alert').innerText()).toContain('not applied')
  } finally { await page.close() }
})

it('keeps a typed JEV key after blur and toggles its visibility without saving again', async () => {
  const page = await browser.newPage()
  try {
    await mount(page); await page.evaluate(() => (window as any).showSettings())
    await page.getByRole('checkbox', { name: 'JEV suggestion scores (optional)', exact: true }).check()
    const input = page.getByLabel('JEV credential', { exact: true })
    await input.fill('fixture-jev-key')
    await page.getByText('JEV endpoint', { exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).savedCredential)).toBe('fixture-jev-key')
    expect(await input.inputValue()).toBe('fixture-jev-key')
    expect(await input.getAttribute('type')).toBe('password')
    const writes = await page.evaluate(() => (window as any).calls.credentialWrites)
    await page.getByRole('button', { name: 'Show JEV credential', exact: true }).click()
    expect(await input.getAttribute('type')).toBe('text')
    await page.getByRole('button', { name: 'Hide JEV credential', exact: true }).click()
    expect(await input.getAttribute('type')).toBe('password')
    expect(await page.evaluate(() => (window as any).calls)).toMatchObject({ credentialWrites: writes, credentialReads: 1 })
  } finally { await page.close() }
})

it('shows the specific connection failure in the selected language', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      ;(window as any).probeResult = { generation: { status: 'failed', reason: 'truncated', message: 'Technical fallback' }, jev: { status: 'disabled' } }
      ;(window as any).showSettings()
    })
    await page.getByText('The connection test exhausted its output budget before completing a reply.', { exact: true }).waitFor()
    expect(await page.getByText('Technical fallback', { exact: true }).count()).toBe(0)
    await page.evaluate(() => { (window as any).probeResult.generation = { status: 'failed', reason: 'authentication', message: 'Technical fallback', httpStatus: 401 } })
    await page.getByRole('button', { name: 'Check again', exact: true }).click()
    await page.getByText('The provider rejected the credentials. (HTTP 401)', { exact: true }).waitFor()
  } finally { await page.close() }
})

it('restores a saved key as a password after switching tabs and makes eye toggle the same value', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).saved.jev.enabled = true; (window as any).savedCredential = 'saved-fixture-key'; (window as any).showSettings() })
    const input = page.getByLabel('JEV credential', { exact: true })
    await input.waitFor()
    await expect.poll(() => input.inputValue()).toBe('saved-fixture-key')
    expect(await input.getAttribute('type')).toBe('password')
    expect(await page.getByRole('button', { name: 'Show JEV credential', exact: true }).getAttribute('aria-pressed')).toBe('false')
    expect(await page.evaluate(() => (window as any).calls.credentialReads)).toBe(1)
    await page.getByRole('button', { name: 'Show JEV credential', exact: true }).click()
    await expect.poll(() => input.inputValue()).toBe('saved-fixture-key')
    expect(await input.getAttribute('type')).toBe('text')
    expect(await page.getByRole('button', { name: 'Hide JEV credential', exact: true }).getAttribute('aria-pressed')).toBe('true')
    expect(await page.evaluate(() => (window as any).calls)).toMatchObject({ credentialReads: 1, credentialWrites: 0 })
    await page.evaluate(() => (window as any).showReview())
    await page.getByRole('button', { name: 'Review this Note', exact: true }).waitFor()
    await page.evaluate(() => (window as any).showSettings())
    await input.waitFor()
    await expect.poll(() => input.inputValue()).toBe('saved-fixture-key')
    expect(await input.getAttribute('type')).toBe('password')
    await page.getByRole('button', { name: 'Show JEV credential', exact: true }).click()
    expect(await input.getAttribute('type')).toBe('text')
    expect(await input.inputValue()).toBe('saved-fixture-key')
    await page.getByRole('button', { name: 'Hide JEV credential', exact: true }).click()
    expect(await input.getAttribute('type')).toBe('password')
    expect(await page.evaluate(() => (window as any).calls)).toMatchObject({ credentialReads: 2, credentialWrites: 0 })
  } finally { await page.close() }
})

it('allows replacing a credential that could not be loaded and disables eye when empty', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).saved.jev.enabled = true; (window as any).failCredentialRead = true; (window as any).showSettings() })
    const input = page.getByLabel('JEV credential', { exact: true })
    await page.getByRole('alert').waitFor()
    expect(await input.inputValue()).toBe('')
    expect(await page.getByRole('button', { name: 'Show JEV credential', exact: true }).isDisabled()).toBe(true)
    await input.fill('replacement-fixture-key')
    await expect.poll(() => page.evaluate(() => (window as any).savedCredential)).toBe('replacement-fixture-key')
    await page.getByRole('button', { name: 'Show JEV credential', exact: true }).click()
    expect(await input.getAttribute('type')).toBe('text')
    await input.fill('')
    await expect.poll(() => page.evaluate(() => (window as any).savedCredential)).toBe('')
    expect(await input.getAttribute('type')).toBe('password')
    expect(await page.getByRole('button', { name: 'Show JEV credential', exact: true }).isDisabled()).toBe(true)
  } finally { await page.close() }
})

it('MCP help supports hover, keyboard dismissal and a narrow viewport without changing settings', async () => {
  const page = await browser.newPage({ viewport: { width: 380, height: 600 } })
  try {
    await mount(page)
    await page.addStyleTag({ content: 'body { overflow: auto; height: auto; }' })
    await page.evaluate(() => (window as any).showSettings())
    const help = page.getByRole('button', { name: 'About MCP integration', exact: true })
    await help.scrollIntoViewIfNeeded()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await help.hover()
    const tip = page.getByRole('tooltip')
    await tip.waitFor()
    expect(await tip.innerText()).toContain('no automatic suggestions-only mode')
    expect(await help.getAttribute('aria-describedby')).toBe(await tip.getAttribute('id'))
    const box = (await tip.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(380)
    expect(box.y + box.height).toBeLessThanOrEqual(600)
    await tip.hover()
    await page.waitForTimeout(180)
    expect(await tip.isVisible()).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => tip.count()).toBe(0)
    await help.focus()
    await tip.waitFor()
    await page.keyboard.press('Escape')
    await expect.poll(() => tip.count()).toBe(0)
    expect(await page.evaluate(() => (window as any).calls)).toMatchObject({ run: 0, settings: 0 })
  } finally { await page.close() }
})

it('keeps enabled status, shows automatic Note progress immediately, and retains the last round after reopening', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).view.automatic = { phase: 'waiting', commits: 3, threshold: 5, remaining: 0 }; (window as any).showActivity() })
    const status = page.getByRole('status')
    await page.getByText('Automatic review enabled', { exact: true }).waitFor()
    expect(await status.innerText()).toContain('Commits 3 / 5')
    const box = (await status.boundingBox())!
    const janusBox = (await page.locator('.blueprint-janus-capsule').boundingBox())!
    expect(box.height).toBe(28)
    expect(box.height).toBe(janusBox.height)
    expect(box.y).toBe(janusBox.y)
    await status.focus()
    await page.getByRole('tooltip').waitFor()
    await page.evaluate(() => (window as any).pushActivity({ phase: 'reviewing', commits: 0, threshold: 5, remaining: 3, completed: 1, total: 4,
      currentNote: { id: 'active-note', title: 'Workspace recovery', path: '.agents/notes/recovery.md' } }, [{ noteId: 'active-note', phase: 'analyzing', trigger: 'automatic' }]))
    await page.getByText('Automatic review running', { exact: true }).waitFor()
    expect(await status.innerText()).toContain('1 / 4 Notes')
    expect(await page.getByRole('tooltip').innerText()).toContain('Analyzing content · Workspace recovery')
    await page.evaluate(() => (window as any).pushActivity({ phase: 'waiting', commits: 0, threshold: 5, remaining: 0,
      lastRun: { finishedAt: '2026-10-10T10:00:00Z', outcome: 'reviewed', reviewed: 4, findings: 2, failed: 0, incomplete: 0 } }))
    await page.getByText(/Reviewed 4 Notes · 2 suggestions/).waitFor()
    expect(await status.innerText()).toContain('Automatic review enabled')
    await page.evaluate(() => (window as any).showSettings())
    await page.getByText('Commits per check', { exact: true }).waitFor()
    expect(await page.evaluate(() => (window as any).activityListeners.size)).toBe(0)
    await page.evaluate(() => (window as any).showActivity())
    await status.focus()
    await page.getByText(/Reviewed 4 Notes · 2 suggestions/).waitFor()
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
  } finally { await page.close() }
})

it('does not subscribe or display automatic review for referenced foreign checkouts', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      const win = window as any
      win.view.automatic = { phase: 'waiting', commits: 0, threshold: 5, remaining: 0 }
      win.reviewRoots = []
      const read = win.electron.blueprintReview.read
      win.electron.blueprintReview.read = async (root: string) => { win.reviewRoots.push(root); return read(root) }
      win.showActivity({ noteSnapshot: { coverage: { checkoutRoot: 'C:/fixture' }, entries: [] },
        composition: { checkouts: [{ snapshot: { coverage: { checkoutRoot: 'C:/foreign' }, entries: [] } }] } })
    })
    await page.getByText('Automatic review enabled', { exact: true }).waitFor()
    expect(await page.getByRole('status').count()).toBe(1)
    expect(await page.evaluate(() => (window as any).reviewRoots)).toEqual(['C:/fixture'])
    expect(await page.getByRole('status').innerText()).not.toContain('foreign')
  } finally { await page.close() }
})

it('does not overwrite a pushed activity with a delayed read and distinguishes manual review', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).view.automatic = { phase: 'waiting', commits: 0, threshold: 5, remaining: 0 }; (window as any).showActivity() })
    await page.getByText('Automatic review enabled', { exact: true }).waitFor()
    await page.evaluate(() => { (window as any).eventRoot = 'c:' + String.fromCharCode(92) + 'FIXTURE' + String.fromCharCode(92); (window as any).holdRead = true; void (window as any).refresh() })
    await page.waitForFunction(() => typeof (window as any).finishRead === 'function')
    await page.evaluate(() => (window as any).pushActivity({ phase: 'reviewing', commits: 0, threshold: 5, remaining: 1, completed: 0, total: 1,
      currentNote: { id: 'active-note', title: 'Recovery', path: '.agents/notes/recovery.md' } }, [{ noteId: 'active-note', phase: 'verifying', trigger: 'automatic' }]))
    await page.getByText('Automatic review running', { exact: true }).waitFor()
    await page.evaluate(() => (window as any).finishRead())
    await page.getByRole('status').focus()
    await page.getByRole('tooltip').waitFor()
    await expect.poll(() => page.getByRole('tooltip').innerText()).toContain('Verifying evidence · Recovery')
    await page.evaluate(() => (window as any).pushActivity({ phase: 'disabled', commits: 0, threshold: 5, remaining: 0 }, [{ noteId: 'manual-note', phase: 'analyzing', trigger: 'manual' }]))
    await page.getByText('Manual review running', { exact: true }).first().waitFor()
    expect(await page.getByRole('status').innerText()).not.toContain('Automatic review running')
  } finally { await page.close() }
})

it('shows localized unavailable reasons and no-change feedback without overflowing a narrow toolbar', async () => {
  const page = await browser.newPage({ viewport: { width: 380, height: 600 }, reducedMotion: 'reduce' })
  try {
    await mount(page)
    await page.evaluate(() => { document.documentElement.dataset.theme = 'planche'; (window as any).view.automatic = { phase: 'unavailable', reason: 'no-git', error: 'Raw technical detail', commits: 0, threshold: 5, remaining: 0 }; (window as any).showActivity({ noteSnapshot: { coverage: { checkoutRoot: 'c:' + String.fromCharCode(92) + 'FIXTURE' + String.fromCharCode(92) }, entries: [] } }) })
    const status = page.getByRole('status')
    await status.waitFor()
    await status.focus()
    await page.getByRole('tooltip').waitFor()
    expect(await page.getByRole('tooltip').innerText()).toContain('This project is not using Git yet')
    expect(await status.innerText()).not.toContain('Raw technical detail')
    const box = (await status.boundingBox())!
    const janusBox = (await page.locator('.blueprint-janus-capsule').boundingBox())!
    expect(box.height).toBe(28)
    expect(box.height).toBe(janusBox.height)
    expect(box.y).toBe(janusBox.y)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(380)
    await status.focus()
    await page.getByRole('tooltip').waitFor()
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('tooltip').count()).toBe(0)
    await page.evaluate(() => (window as any).pushActivity({ phase: 'waiting', commits: 0, threshold: 5, remaining: 0,
      lastRun: { finishedAt: '2026-10-10T10:00:00Z', outcome: 'no-changes', reviewed: 0, findings: 0, failed: 0, incomplete: 0 } }))
    await status.focus()
    await page.getByText(/No Note changes this round/).waitFor()
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
  } finally { await page.close() }
})

it('shows enabled/loading before Notes arrive, keeps early progress and rejects stale status responses', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).prepareFastStatus(); (window as any).holdRead = true; (window as any).showActivity() })
    const status = page.getByRole('status')
    await page.getByText('Automatic review enabled', { exact: true }).waitFor()
    expect(await status.innerText()).toContain('Loading status')
    expect(await page.evaluate(() => (window as any).holdRead)).toBe(true)
    await page.evaluate(() => { (window as any).holdStatus = true; void (window as any).refreshStatus() })
    await page.waitForFunction(() => typeof (window as any).finishStatus === 'function')
    await page.evaluate(() => (window as any).emitStatus({ automatic: { phase: 'reviewing', commits: 0, threshold: 3, remaining: 2, completed: 1, total: 3 }, activities: [] }))
    await page.getByText('Automatic review running', { exact: true }).waitFor()
    expect(await status.innerText()).toContain('1 / 3 Notes')
    await page.evaluate(() => { (window as any).finishStatus(); (window as any).finishRead() })
    await expect.poll(() => status.innerText()).toContain('1 / 3 Notes')
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
  } finally { await page.close() }
})

it('keeps enabled status on load failure, recovers, and follows configuration changes without a Note refresh', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).prepareFastStatus(); (window as any).holdRead = true; (window as any).showActivity() })
    await page.getByText('Automatic review enabled', { exact: true }).waitFor()
    await page.evaluate(() => { (window as any).failStatus = true; return (window as any).refreshStatus() })
    const status = page.getByRole('status')
    expect(await status.innerText()).toContain('Automatic review enabled')
    expect(await status.innerText()).toContain('Review status unavailable')
    await page.evaluate(() => { (window as any).failStatus = false; return (window as any).refreshStatus() })
    await expect.poll(() => status.innerText()).toContain('Loading status')
    await page.evaluate(() => (window as any).emitStatus({ automaticSettings: { enabled: false, commits: 3 }, automatic: { phase: 'disabled', commits: 0, threshold: 3, remaining: 0 } }))
    await expect.poll(() => status.count()).toBe(0)
    await page.evaluate(() => (window as any).emitStatus({ automaticSettings: { enabled: true, commits: 3 } }))
    await page.getByText('Automatic review enabled', { exact: true }).waitFor()
    expect(await status.innerText()).toContain('Loading status')
    expect(await page.evaluate(() => (window as any).holdRead)).toBe(true)
    await page.evaluate(() => (window as any).finishRead())
  } finally { await page.close() }
})

it('keeps the review bar within the narrow header alongside both discovery buttons', async () => {
  const page = await browser.newPage({ viewport: { width: 380, height: 600 }, reducedMotion: 'reduce' })
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).prepareFastStatus(); (window as any).holdRead = true; document.documentElement.dataset.theme = 'planche'; (window as any).showAttention() })
    const bar = page.getByRole('button', { name: 'Automatic review details', exact: true })
    await page.getByText('Automatic review enabled', { exact: true }).waitFor()
    const bounds = (await bar.boundingBox())!, header = (await page.locator('header.blueprint-workbench-topbar').boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(260)
    expect(await page.getByText('Automatic review enabled', { exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect((await page.locator('.blueprint-janus-capsule').boundingBox())!.y).toBe(bounds.y)
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(380)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(header.y + header.height)
    expect(await page.getByRole('button', { name: /Updates/ }).isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: /With suggestions/ }).isVisible()).toBe(true)
    await page.screenshot({ path: '.agents/.local/review-status/narrow-header.png' })
    await bar.click()
    await page.getByRole('dialog', { name: 'Automatic review details', exact: true }).waitFor()
    expect(await page.getByRole('dialog').innerText()).toContain('Syncing Note sources')
    await page.evaluate(() => (window as any).finishRead())
  } finally { await page.close() }
})

it('fills an already-open review list when the slower Note read returns', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      ;(window as any).prepareFastStatus()
      ;(window as any).holdRead = true
      const targets = Array.from({ length: 7 }, (_, index) => ({
        noteId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        title: `Retry Note ${index + 1}`, state: 'failed', error: 'Review interrupted', path: `.agents/notes/note-${index + 1}.md`,
      }))
      ;(window as any).view.automatic = { context: (window as any).view.context, phase: 'waiting', commits: 0, threshold: 3, remaining: 0, targets,
        lastRun: { finishedAt: '2026-10-10T10:00:00Z', outcome: 'failed', reviewed: 0, findings: 0, failed: 7, incomplete: 0 } }
      ;(window as any).fast.automatic = (window as any).view.automatic
      ;(window as any).showAttention()
    })
    const bar = page.getByRole('button', { name: 'Automatic review details', exact: true })
    await bar.waitFor()
    await bar.click()
    const details = page.getByRole('dialog', { name: 'Automatic review details', exact: true })
    await expect.poll(() => details.locator('article').count()).toBe(7)
    expect(await page.evaluate(() => (window as any).holdRead)).toBe(true)
    expect(await details.innerText()).toContain('Syncing Note sources')
    expect(await details.innerText()).not.toContain('Current attention: 7 failed')
    expect(await details.innerText()).not.toContain('Previous automatic round: 0 findings · 7 failed')
    await details.getByText('Run details', { exact: true }).click()
    expect(await details.innerText()).toContain('Previous automatic round: 0 findings · 7 failed')
    await page.evaluate(() => (window as any).finishRead())
    await expect.poll(() => details.locator('article').count()).toBe(7)
    expect(await details.getByText('Retry Note 7').count()).toBe(1)
    expect(await details.innerText()).not.toContain('No Notes to show')
  } finally { await page.close() }
})

it('fills an already-open review list when review targets arrive after the Note view', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      ;(window as any).prepareFastStatus()
      ;(window as any).holdStatus = true
      ;(window as any).showAttention()
    })
    await page.waitForFunction(() => typeof (window as any).finishStatus === 'function')
    await page.evaluate(() => (window as any).refresh())
    const bar = page.getByRole('button', { name: 'Automatic review details', exact: true })
    await bar.click()
    const details = page.getByRole('dialog', { name: 'Automatic review details', exact: true })
    expect(await details.locator('article').count()).toBe(0)
    await page.evaluate(() => {
      const context = (window as any).view.context
      const targets = Array.from({ length: 5 }, (_, index) => ({
        noteId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        title: `Delayed retry ${index + 1}`, path: `.agents/notes/note-${index + 1}.md`,
        state: index ? 'incomplete' : 'failed', ...(index ? {} : { error: 'Review interrupted' }),
      }))
      ;(window as any).fast.automatic = { context, phase: 'waiting', commits: 0, threshold: 3, remaining: 0, targets,
        lastRun: { finishedAt: '2026-10-10T10:00:00Z', outcome: 'reviewed', reviewed: 0, findings: 0, failed: 7, incomplete: 0 } }
      ;(window as any).finishStatus()
      ;(window as any).emitStatus({ automatic: (window as any).fast.automatic })
    })
    await details.getByText('Delayed retry 5').waitFor()
    expect(await details.locator('article').count()).toBe(5)
    expect(await details.innerText()).not.toContain('Current attention: 1 failed · 4 with incomplete coverage')
    expect(await details.innerText()).not.toContain('Previous automatic round: 0 findings · 7 failed')
    await details.getByText('Run details', { exact: true }).click()
    expect(await details.innerText()).toContain('Previous automatic round: 0 findings · 7 failed')
  } finally { await page.close() }
})


it('filters actual outcomes and refreshes recovery details after an older in-flight read', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      const w = window as any
      w.prepareFastStatus()
      const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
      w.view.items = [{ noteId: ids[0], reportRevision: 1, error: 'Old failure', report: null },
        { noteId: ids[1], reportRevision: 2, report: { coverage: 'complete', findings: [{ summary: 'Existing suggestion' }] } },
        { noteId: 'never-reviewed', reportRevision: 99, report: null }]
      w.view.automatic = { context: w.view.context, phase: 'failed', commits: 0, threshold: 3, remaining: 0,
        targets: ids.map((noteId, index) => ({ noteId, title: 'Note ' + index, state: index ? 'reviewed' : 'failed', commit: 'a'.repeat(40), reportRevision: index + 1 })) }
      w.fast.automatic = w.view.automatic
      w.showAttention()
    })
    await page.getByRole('button', { name: 'Automatic review details', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Needs retry 1', exact: true }).waitFor()
    expect(await dialog.locator('article').count()).toBe(1)
    expect(await dialog.getByText('never-reviewed').count()).toBe(0)
    await page.evaluate(() => {
      const w = window as any, automatic = structuredClone(w.view.automatic)
      automatic.phase = 'reviewing'; automatic.targets[0].state = 'reviewing'; automatic.targets[0].retrying = true
      w.view.automatic = automatic; w.emitStatus({ automatic })
    })
    await dialog.getByRole('button', { name: 'Needs retry 1', exact: true }).waitFor()
    expect(await dialog.locator('article').count()).toBe(1)
    await page.evaluate(() => { const w = window as any; w.holdRead = true; void w.refresh() })
    await page.waitForFunction(() => typeof (window as any).finishRead === 'function')
    await page.evaluate(() => {
      const w = window as any
      const automatic = structuredClone(w.view.automatic)
      automatic.phase = 'waiting'; delete automatic.targets[0].retrying; automatic.targets[0].state = 'reviewed'; automatic.targets[0].reportRevision = 8
      w.view.automatic = automatic
      w.view.items[0] = { ...w.view.items[0], error: null, reportRevision: 8, report: { coverage: 'complete', findings: [] } }
      w.emitStatus({ automatic })
    })
    await dialog.getByRole('button', { name: 'Needs retry 0', exact: true }).waitFor()
    expect(await dialog.locator('article').count()).toBe(0)
    await dialog.getByRole('button', { name: 'Review completed 2', exact: true }).click()
    expect(await dialog.locator('article').count()).toBe(2)
    expect(await dialog.innerText()).not.toContain('Old failure')
    expect(await dialog.getByText('Existing suggestion').count()).toBe(0)
    await page.evaluate(() => (window as any).finishRead())
    await expect.poll(() => page.evaluate(() => (window as any).currentView().items[0].reportRevision)).toBe(8)
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
  } finally { await page.close() }
})


it('shows manual progress before concurrent automatic progress and keeps one left action', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      const w = window as any
      w.view.activities = [{ noteId: '00000000-0000-4000-8000-000000000001', trigger: 'manual', phase: 'structure' }]
      w.view.automatic = { phase: 'reviewing', commits: 0, threshold: 5, remaining: 1, total: 5, completed: 2 }
      w.showActivity()
    })
    await page.getByText('Manual review running', { exact: true }).waitFor()
    expect(await page.getByText('Automatic review running', { exact: true }).count()).toBe(0)
    await page.evaluate(() => (window as any).showReview())
    await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor()
    expect(await page.getByRole('button', { name: 'Review this Note', exact: true }).count()).toBe(0)
  } finally { await page.close() }
})

it('shows two completed round headings and moves technical causes into details', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      const w = window as any
      w.view.automatic = { context: w.view.context, phase: 'failed', commits: 0, threshold: 5, remaining: 0,
        rounds: [{ id: 1, finishedAt: '2026-10-10T10:00:00Z' }, { id: 2, finishedAt: '2026-10-10T11:00:00Z' }],
        targets: [{ noteId: 'one', title: 'Older Note', commit: 'a'.repeat(40), round: 1, state: 'reviewed' },
          { noteId: 'two', title: 'Latest Note', commit: 'b'.repeat(40), round: 2, state: 'reviewed' },
          { noteId: 'three', title: 'Retry Note', commit: 'b'.repeat(40), state: 'failed', error: 'Review agent did not complete a source operation' }] }
      w.showAttention()
    })
    await page.getByRole('button', { name: 'Automatic review details', exact: true }).click()
    const dialog = page.getByRole('dialog')
    expect(await dialog.innerText()).not.toContain('Review agent did not complete a source operation')
    await dialog.getByText('Review material operation incomplete', { exact: true }).click()
    expect(await dialog.innerText()).toContain('Review agent did not complete a source operation')
    await dialog.getByRole('button', { name: 'Review completed 2', exact: true }).click()
    expect(await dialog.locator('h3').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('Latest round · 1'), expect.stringContaining('Previous round · 1')]))
  } finally { await page.close() }
})

it('keeps malformed known identities actionable even when the semantic source is unavailable', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      const w = window as any, id = '00000000-0000-4000-8000-000000000001'
      w.view.sourceComplete = false
      w.view.items = [{ noteId: id, availability: 'unavailable', source: { path: '.agents/notes/broken.md' }, report: null }]
      w.view.structure = { complete: true, checked: 1, issues: [{ noteId: id, path: '.agents/notes/broken.md', code: 'SCHEMA_INVALID', message: 'Missing required section' }] }
      w.showAttention()
    })
    const suggestions = page.locator('.bp-attention__triggers button').nth(1)
    await page.waitForFunction(() => document.querySelectorAll('.bp-attention__triggers button')[1]?.textContent?.includes('1'))
    await suggestions.click()
    const target = page.getByRole('dialog').getByRole('button', { name: /broken.md/ })
    expect(await target.isEnabled()).toBe(true)
    expect(await target.textContent()).toContain('Invalid structure')
    await target.click()
    expect(await page.evaluate(() => (window as any).openedFiles)).toEqual(['C:/fixture/.agents/notes/broken.md'])
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
  } finally { await page.close() }
})


it('keeps commit count alongside retries and refreshes automatic status without waiting for sources', async () => {
  const page = await browser.newPage({ viewport: { width: 380, height: 720 } })
  try {
    await mount(page)
    await page.evaluate(() => {
      const w = window as any; w.prepareFastStatus()
      w.view.automatic = { context: w.view.context, phase: 'failed', commits: 2, threshold: 5, remaining: 0,
        targets: [{ noteId: 'legacy-failure', title: 'Historical failure', state: 'failed', error: 'Original error' }] }
      w.fast.automatic = w.view.automatic; w.showAttention()
    })
    const trigger = page.getByRole('button', { name: 'Automatic review details', exact: true })
    await page.getByText('Commits 2 / 5', { exact: true }).waitFor()
    expect(await trigger.getByLabel('Needs retry 1').count()).toBe(1)
    const countBox = (await page.getByText('Commits 2 / 5', { exact: true }).boundingBox())!
    const triggerBox = (await trigger.boundingBox())!
    expect(countBox.x + countBox.width).toBeLessThanOrEqual(triggerBox.x + triggerBox.width)
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Needs retry 1', exact: true }).waitFor()
    await page.evaluate(() => { const w = window as any; w.holdRead = true; w.holdStatus = true; void w.refresh() })
    await dialog.getByRole('button', { name: 'Refresh list', exact: true }).click()
    const refreshing = dialog.getByRole('button', { name: 'Refreshing...', exact: true })
    await refreshing.waitFor()
    expect(await refreshing.isDisabled()).toBe(true)
    expect(await refreshing.getAttribute('aria-busy')).toBe('true')
    expect(await refreshing.locator('svg').evaluate(element => getComputedStyle(element).animationName)).not.toBe('none')
    await page.waitForFunction(() => typeof (window as any).finishRead === 'function' && typeof (window as any).finishStatus === 'function')
    await page.evaluate(() => (window as any).finishStatus())
    await expect.poll(() => dialog.getByRole('button', { name: 'Refresh list', exact: true }).isEnabled()).toBe(true)
    expect(await page.evaluate(() => (window as any).holdRead)).toBe(true)
    await page.evaluate(() => (window as any).finishRead())
    await page.evaluate(() => { const w = window as any; w.failStatus = true })
    await dialog.getByRole('button', { name: 'Refresh list', exact: true }).click()
    await dialog.getByText('Status unavailable', { exact: true }).waitFor()
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
  } finally { await page.close() }
})

it('shows source loading instead of an empty suggestions list on first open', async () => {
  const page = await browser.newPage()
  try {
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.evaluate(() => { const w = window as any; w.prepareFastStatus(); w.holdRead = true; w.showAttention() })
    await page.getByRole('button', { name: /^With suggestions/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Syncing Note sources', { exact: false }).waitFor()
    expect(await dialog.locator('.bp-attention-panel__empty').count()).toBe(0)
    await page.evaluate(() => (window as any).finishRead())
    await dialog.locator('.bp-attention-panel__empty').waitFor()
  } finally { await page.close() }
})

it.each(['Updates', 'With suggestions'])('ends a stuck %s refresh, retains results and ignores its late response after retry', async label => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.evaluate(() => { const w = window as any; w.showAttention() })
    await page.getByRole('button', { name: new RegExp('^' + label) }).click()
    const dialog = page.getByRole('dialog')
    await page.evaluate(() => { (window as any).holdRead = true })
    await dialog.getByRole('button', { name: 'Refresh list', exact: true }).click()
    await dialog.getByRole('button', { name: 'Refreshing...', exact: true }).waitFor()
    await page.waitForFunction(() => typeof (window as any).finishRead === 'function')
    await page.clock.runFor(15001)
    await dialog.getByText('Refresh timed out. Existing results are retained; please try again.', { exact: true }).waitFor()
    expect(await dialog.getByRole('button', { name: 'Refresh list', exact: true }).isEnabled()).toBe(true)
    expect(await page.evaluate(() => (window as any).currentView().revision)).toBe(1)
    await page.evaluate(() => { const w = window as any; w.finishOldRead = w.finishRead; w.holdRead = false; w.view.revision = 9 })
    await dialog.getByRole('button', { name: 'Refresh list', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).currentView().revision)).toBe(9)
    await page.evaluate(() => (window as any).finishOldRead())
    expect(await page.evaluate(() => (window as any).currentView().revision)).toBe(9)
    expect(await dialog.locator('.bp-attention-panel__refreshing').count()).toBe(0)
  } finally { await page.close() }
})

it('ends a stuck automatic status refresh and allows a successful retry', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.evaluate(() => { const w = window as any; w.prepareFastStatus(); w.showAttention() })
    await page.getByRole('button', { name: 'Automatic review details', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await page.evaluate(() => { (window as any).holdStatus = true })
    await dialog.getByRole('button', { name: 'Refresh list', exact: true }).click()
    await dialog.getByRole('button', { name: 'Refreshing...', exact: true }).waitFor()
    await page.waitForFunction(() => typeof (window as any).finishStatus === 'function')
    await page.clock.runFor(15001)
    await dialog.getByText('Refresh timed out. Existing results are retained; please try again.', { exact: true }).waitFor()
    expect(await dialog.getByRole('button', { name: 'Refresh list', exact: true }).isEnabled()).toBe(true)
    await page.evaluate(() => { const w = window as any; w.holdStatus = false; w.fast.revision = 20 })
    await dialog.getByRole('button', { name: 'Refresh list', exact: true }).click()
    await expect.poll(() => dialog.getByText('Refresh timed out.', { exact: false }).count()).toBe(0)
    expect(await page.evaluate(() => (window as any).calls.run)).toBe(0)
  } finally { await page.close() }
})

it('refreshes changed Note sources before polling and follows an older in-flight read', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.waitForFunction(() => (window as any).sourceListeners.size === 1)
    await page.evaluate(() => { const w = window as any; w.holdRead = true; void w.refresh() })
    await page.waitForFunction(() => typeof (window as any).finishRead === 'function')
    await page.evaluate(() => {
      const w = window as any; w.view.revision = 8
      for (const callback of w.sourceListeners) callback({ root: 'c:\\fixture', rev: 8 })
      w.finishRead()
    })
    await expect.poll(() => page.evaluate(() => (window as any).currentView().revision)).toBe(8)
    // No clock advancement: the source event, rather than the 10-second fallback, produced this read.
    await page.evaluate(() => (window as any).showSettings())
    await page.waitForFunction(() => (window as any).sourceListeners.size === 0)
  } finally { await page.close() }
})

it('shows saved counts and rows before source validation and fills the open list on completion', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.evaluate(() => {
      const w = window as any; w.prepareFastStatus()
      const entry = { noteId: 'saved', hash: 'a'.repeat(64), path: '.agents/notes/saved.md', unread: true, available: true, change: 'modified' }
      const saved = { ...w.view, sourcesPending: true, sourceComplete: false, updates: { ready: true, complete: false, revision: 1, entries: [entry] } }
      w.electron.blueprintReview.readSaved = async () => structuredClone(saved)
      w.view.updates = { ready: true, complete: true, revision: 2, entries: [entry, { ...entry, noteId: 'new', path: '.agents/notes/new.md' }] }
      w.holdRead = true; w.showAttention()
    })
    const updates = page.getByRole('button', { name: 'Updates 1', exact: true })
    await updates.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /saved.md/ }).waitFor()
    await dialog.getByText('Syncing Note sources', { exact: false }).waitFor()
    expect(await dialog.locator('.bp-attention-panel__empty').count()).toBe(0)
    await page.evaluate(() => (window as any).finishRead())
    await page.getByRole('button', { name: 'Updates 2', exact: true }).waitFor()
    await dialog.getByRole('button', { name: /new.md/ }).waitFor()
    expect(await dialog.locator('article').count()).toBe(2)
  } finally { await page.close() }
})

it('keeps counts consistent with retained rows after sync failure, incomplete scans and reading errors', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.evaluate(async () => {
      const w = window as any
      w.view.updates = { ready: true, complete: true, revision: 2, entries: [{ noteId: 'one', hash: 'a'.repeat(64), path: '.agents/notes/one.md', unread: true, available: true, change: 'modified' }] }
      w.view.items = [{ noteId: 'one', source: { path: '.agents/notes/one.md' }, report: { findings: [{ id: 'finding', summary: 'Saved suggestion' }] } }]
      await w.refresh(); w.showAttention()
    })
    await page.getByRole('button', { name: 'Updates 1', exact: true }).waitFor()
    await page.getByRole('button', { name: 'With suggestions 1', exact: true }).waitFor()
    await page.evaluate(async () => { const w = window as any; w.failRead = true; await w.refresh() })
    await page.getByRole('button', { name: 'Updates 1', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Source temporarily unavailable', { exact: true }).waitFor()
    expect(await dialog.locator('article').count()).toBe(1)
    expect(await page.getByRole('button', { name: 'With suggestions 1', exact: true }).count()).toBe(1)
    await page.evaluate(async () => {
      const w = window as any; w.failRead = false; w.view.sourceComplete = false; w.view.updates.complete = false; await w.refresh()
      delete w.view.updates; w.view.updatesError = 'Reading state unavailable'; await w.refresh()
    })
    await dialog.getByText('Reading state unavailable', { exact: true }).waitFor()
    expect(await page.getByRole('button', { name: 'Updates 1', exact: true }).count()).toBe(1)
    expect(await page.getByRole('button', { name: 'With suggestions 1', exact: true }).count()).toBe(1)
    expect(await dialog.locator('article').count()).toBe(1)
  } finally { await page.close() }
})

it('does not rescan sources when switching Note details or receiving acknowledgement receipts', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await mount(page); await page.evaluate(() => (window as any).refresh())
    const reads = await page.evaluate(() => (window as any).sourceReads)
    for (const id of ['second', 'third', 'first']) {
      await page.evaluate(id => (window as any).showReview(id), id)
      await page.getByRole('button', { name: 'Review this Note', exact: true }).waitFor()
    }
    await page.evaluate(() => {
      const w = window as any
      for (const listener of w.readListeners) listener({ context: w.view.context, updates: { ready: true, complete: true, revision: 9, entries: [] } })
    })
    await expect.poll(() => page.evaluate(() => (window as any).currentView().updates.revision)).toBe(9)
    expect(await page.evaluate(() => (window as any).sourceReads)).toBe(reads)
  } finally { await page.close() }
})

it('ignores a saved snapshot arriving after the current source result', async () => {
  const page = await browser.newPage()
  try {
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.evaluate(async () => {
      const w = window as any; w.prepareFastStatus()
      const old = { ...w.view, sourcesPending: true, revision: 1 }
      w.electron.blueprintReview.readSaved = () => new Promise(resolve => { w.finishSaved = () => resolve(old) })
      w.view = { ...w.view, revision: 9, context: { ...w.view.context, branch: 'new-branch' } }
      await w.refresh(); w.finishSaved()
    })
    expect(await page.evaluate(() => (window as any).currentView())).toMatchObject({ revision: 9, context: { branch: 'new-branch' } })
    expect(await page.evaluate(() => (window as any).currentView().sourcesPending)).toBeUndefined()
  } finally { await page.close() }
})


it('shares committed suggestions across checkout aliases and ignores older reads and foreign results', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.getByRole('button', { name: 'Review this Note' }).click()
    await page.getByText('First issue', { exact: true }).waitFor()
    await page.evaluate(() => {
      const w = window as any, view = structuredClone(w.currentView())
      w.reviewStore.setState({ views: { 'C:/fixture': view, 'c:/fixture/': structuredClone(view) } })
      w.holdRead = true; void w.refresh()
    })
    await page.waitForFunction(() => Boolean((window as any).finishRead))
    await page.evaluate(() => { const w = window as any; w.emitResults({ context: w.view.context, revision: 4, items: [] }) })
    await page.getByText('No current suggestions.', { exact: false }).waitFor()
    expect(await page.evaluate(() => (window as any).reviewStore.getState().views['c:/fixture/'].items)).toEqual([])
    await page.evaluate(async () => { const w = window as any; w.finishRead(); await w.refresh() })
    expect(await page.evaluate(() => (window as any).currentView().revision)).toBe(4)
    expect(await page.getByText('First issue', { exact: true }).count()).toBe(0)
    await page.evaluate(() => {
      const w = window as any
      for (const context of [w.view.context, { ...w.view.context, branch: 'other' }, { ...w.view.context, repoId: 'another-repo' }]) {
        w.emitResults({ context, revision: context === w.view.context ? 2 : 10, items: w.view.items })
      }
      w.showAttention()
    })
    await expect.poll(() => page.locator('.bp-attention__triggers button').nth(1).innerText()).toMatch(/0$/)
    expect(await page.evaluate(() => (window as any).currentView().items)).toEqual([])
    await page.evaluate(() => (window as any).showSettings())
    await expect.poll(() => page.evaluate(() => (window as any).resultListeners.size)).toBe(0)
  } finally { await page.close() }
})


it('fills saved reading counts when committed suggestions arrive before the startup cache', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await mount(page); await page.evaluate(() => (window as any).refresh())
    await page.evaluate(() => {
      const w = window as any; w.prepareFastStatus(); w.holdRead = true
      w.electron.blueprintReview.readSaved = () => new Promise(resolve => {
        w.finishSaved = () => resolve({ ...w.view, sourceComplete: false, sourcesPending: true,
          updates: { ready: true, complete: false, revision: 1, entries: [{ noteId: 'saved', hash: 'a'.repeat(64), path: '.agents/notes/saved.md', unread: true, available: true }] } })
      })
      w.showAttention()
    })
    await page.waitForFunction(() => Boolean((window as any).finishSaved))
    await page.evaluate(() => {
      const w = window as any; w.emitResults({ context: w.view.context, revision: 8, items: [] }); w.finishSaved()
    })
    await page.getByRole('button', { name: 'Updates 1', exact: true }).waitFor()
    expect(await page.evaluate(() => (window as any).currentView().revision)).toBe(8)
    await page.evaluate(() => (window as any).finishRead())
  } finally { await page.close() }
})

it('merges reading and suggestion revisions independently across checkout aliases', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    const views = await page.evaluate(() => {
      const w = window as any, view = { ...w.currentView(), revision: 8, items: [],
        updates: { ready: true, complete: true, revision: 3, entries: [] } }
      w.reviewStore.setState({ views: { 'C:/fixture': view, 'c:/fixture/': structuredClone(view) } })
      w.emitResults({ context: view.context, revision: 7, items: [{ noteId: 'obsolete' }],
        updates: { ...view.updates, revision: 4, entries: [{ noteId: 'written', unread: true }] } })
      return w.reviewStore.getState().views
    })
    for (const root of ['C:/fixture', 'c:/fixture/']) expect(views[root]).toMatchObject({
      revision: 8, items: [], updates: { revision: 4, entries: [{ noteId: 'written', unread: true }] },
    })
  } finally { await page.close() }
})

it('shares saved refreshes across checkout aliases without overwriting a changed branch', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.evaluate(() => {
      const w = window as any, view = structuredClone(w.currentView())
      w.reviewStore.setState({ views: { 'C:/fixture': view, 'c:/fixture/': structuredClone(view) } })
      w.electron.blueprintReview.readSaved = async () => ({ ...w.view, revision: 8, items: [] })
      return w.reviewStore.getState().refreshSaved('C:/fixture')
    })
    expect(await page.evaluate(() => (window as any).reviewStore.getState().views['c:/fixture/'].revision)).toBe(8)
    await page.evaluate(async () => {
      const w = window as any
      w.electron.blueprintReview.readSaved = () => new Promise(resolve => { w.finishSaved = () => resolve({ ...w.view, revision: 9 }) })
      const pending = w.reviewStore.getState().refreshSaved('C:/fixture')
      await Promise.resolve()
      const views = w.reviewStore.getState().views
      w.reviewStore.setState({ views: { ...views, 'c:/fixture/': { ...views['c:/fixture/'], context: { ...w.view.context, branch: 'other' } } } })
      w.finishSaved(); await pending
    })
    const views = await page.evaluate(() => (window as any).reviewStore.getState().views)
    expect(views['C:/fixture'].revision).toBe(9)
    expect(views['c:/fixture/']).toMatchObject({ revision: 8, context: { branch: 'other' } })
  } finally { await page.close() }
})
