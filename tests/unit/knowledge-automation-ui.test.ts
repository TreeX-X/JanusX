import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { build } from 'esbuild'
let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] })
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import './src/renderer/src/styles/globals.css'
    import './src/renderer/src/styles/themes.generated.css'
    import React from 'react'; import {createRoot} from 'react-dom/client'; import i18n from 'i18next'; import {initReactI18next} from 'react-i18next'
    import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'; import settings from './src/renderer/src/i18n/locales/en/settings.json'; import common from './src/renderer/src/i18n/locales/en/common.json'; import team from './src/renderer/src/i18n/locales/en/team.json'
    import {KnowledgeWorkbench} from './src/renderer/src/components/knowledge/KnowledgeWorkbench'
    import {KnowledgeSettingsPanel} from './src/renderer/src/components/KnowledgeSettingsPanel'
    import {AppSettingsModal} from './src/renderer/src/components/AppSettingsModal'
    import {RightDock} from './src/renderer/src/components/right-tools/RightDock'
    import {useExperimentalStore} from './src/renderer/src/stores/experimental'
    import {useRightToolStore} from './src/renderer/src/stores/right-tools'
    import {defaultKnowledgeAutomation} from './src/shared/knowledge-automation'
    const counts={pending:0,running:0,succeeded:0,'needs-review':0,failed:0,cancelled:0}
    window.calls=[];window.config={enabled:true,mode:'deterministic-only',autoAcceptDeterministicFacts:false,automation:defaultKnowledgeAutomation()}
    window.localResult='pass';window.resources={supported:true,phase:'idle',receivedBytes:0,totalBytes:0}
    const disabledLocal=()=>{window.config.automation.local.enabled=false;Object.values(window.config.automation.stages).forEach(stage=>{if(stage.provider==='local')stage.provider='off'})}
    const status=()=>({enabled:window.config.automation.enabled,running:false,counts,total:0,tasks:[]})
    window.featureWrites=[];window.featureSave='pass';window.settingsCloseCount=0
    window.electron={experimental:{update:async partial=>{window.featureWrites.push(partial);if(window.featureSave==='wait')await new Promise(resolve=>window.finishFeatureSave=resolve);if(window.featureSave==='fail')throw new Error('save failed');return {...useExperimentalStore.getState(),...partial}}},llm:{getTerminalProviders:async()=>[{id:'external',name:'My provider',modelId:'chosen-reviewer',enabled:true}]},knowledge:{
      getPersonalSettings:async()=>window.personalSettings ?? {captureConversations:true,inferEngineeringHabits:false,useInChat:true,episodeTtlDays:60},
      updatePersonalSettings:async partial=>{window.personalSettings={...await window.electron.knowledge.getPersonalSettings(),...partial};return window.personalSettings},
      userMemoryOverview:async()=>({profile:{identity:'Tree',formatPrefs:['Concise'],toolPrefs:[]},habits:[],recent:[],pendingHabitCount:0}),
      listCandidates:async()=>[],listWikiPatchCandidates:async()=>[],listGraphCandidates:async()=>[],
      getSettings:async()=>window.config,updateSettings:async(value)=>{window.calls.push('save');value.automation.local=window.config.automation.local;window.config=value;return structuredClone(value)},externalMcpStatus:async()=>null,
      automationStatus:async()=>status(),automationRun:async()=>{window.calls.push('run');return status()},automationRetry:async()=>{},
      localResourcesStatus:async()=>structuredClone(window.resources),installLocalResources:async()=>{window.calls.push('install');window.resources.phase='downloading';window.resources.totalBytes=100;return structuredClone(window.resources)},
      jevCredentialStatus:async()=>({configured:false}),setJevCredential:async()=>{},stopLocalModel:async()=>{window.calls.push('stop');disabledLocal();if(['checking','downloading','verifying','extracting'].includes(window.resources.phase))window.resources.phase='cancelled'},
      configureLocalModel:async(local)=>{window.calls.push('check');if(window.localResult==='wait')await new Promise(resolve=>window.finishCheck=resolve);const ok=window.localResult!=='fail';if(ok)window.config.automation.local=local;return {settings:structuredClone(window.config),report:{ok,reason:ok?undefined:'local-memory-insufficient',mode:'gpu',availableMemoryMiB:16000,availableVramMiB:6000,modelContextTokens:262144,recommendedContextTokens:32768,selectedContextTokens:32768,supportedContextTokens:[32768]}}}
    }}
    useExperimentalStore.setState({loaded:true,knowledge:true,persona:true,load:async()=>{}})
    window.features=useExperimentalStore;window.dock=useRightToolStore
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge,settings,common,team}},interpolation:{escapeValue:false}}).then(()=>{
      window.root=createRoot(document.getElementById('root'))
      window.showMemory=()=>window.root.render(<KnowledgeWorkbench isOpen onClose={()=>window.root.render(null)}/>)
      window.root.render(window.gates?<><AppSettingsModal isOpen initialTab='knowledge' onClose={()=>{window.settingsCloseCount++}}/><RightDock effectiveCollapsed={false} effectiveMaxWidth={600} forcedCollapsed={false} onResizingChange={()=>{}}/></>:<KnowledgeSettingsPanel/>)
    })
  ` }, loader: { '.svg': 'dataurl' }, bundle: true, write: false, outfile: 'automation-ui.js', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'fixtures', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n;export const changeLanguage=()=>{}", loader: 'ts' }))
    builder.onLoad({ filter: /[/\\](GeneralSettingsPanel|NotificationSettingsPanel|LlmConfigModal|ModelCatalogPanel|AgentSettingsPanel|UsageStatsPanel|HostedSettingsPanel|TeamSettingsPanel)\.tsx$/ }, args => {
      const name = args.path.split(/[/\\]/).at(-1)!.replace('.tsx', '')
      return { contents: `import React from 'react';export function ${name}(){return <div>${name}</div>}`, loader: 'tsx' }
    })
    builder.onLoad({ filter: /[/\\]RightToolHost\.tsx$/ }, () => ({ contents: `import React from 'react';export function RightToolHost({openToolIds}){return <>{openToolIds.map(toolId=><div key={toolId} data-tool={toolId}>{toolId}</div>)}</>}`, loader: 'tsx' }))
  } }] })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text; css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })
async function mount(page: Page, gates = false) {
  page.setDefaultTimeout(4000); await page.setContent('<div id="root"></div>'); await page.addStyleTag({ content: css + '\n:root{--shell-accent:#ff7830;--so-body-pad-x:16px;--so-body-pad-y:16px}*{box-sizing:border-box}body{margin:0;padding:16px}#root{max-width:800px}' })
  await page.evaluate(value => { (window as any).gates = value }, gates); await page.addScriptTag({ content: script })
  await page.getByRole('heading', { name: 'Knowledge automation', exact: true }).waitFor()
}
it('configures all four stages, excludes Jev generation, saves before running and supports external-only', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  try {
    await mount(page)
    await page.evaluate(() => document.documentElement.dataset.theme='dark')
    await page.locator('#root').screenshot({path:'artifacts/memory-domain-acceptance/knowledge-settings-cards-dark.png',animations:'disabled'})
    await page.evaluate(() => document.documentElement.dataset.theme='planche')
    const extraction = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: 'Model-assisted extraction (optional)' }) })
    expect(await extraction.innerText()).toContain('Rules only (automatic)')
    expect(await extraction.innerText()).toContain('basic rule extraction runs automatically without a model')
    for (const stage of ['Model-assisted extraction (optional)','Entry review','Wiki generation','Wiki review']) {
      await page.getByRole('button', { name: stage, exact: true }).scrollIntoViewIfNeeded()
      await page.waitForTimeout(100)
      await page.getByRole('button', { name: stage, exact: true }).click()
      await expect.poll(() => page.getByRole('option', { name: 'Jev review', exact: true }).count()).toBe(stage.includes('review') ? 1 : 0)
      await page.getByRole('option', { name: 'External model', exact: true }).click()
      const field = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: stage }) })
      await field.getByRole('button', { name: 'External provider' }).click()
      await page.getByRole('option', { name: 'My provider', exact: true }).click()
    }
    expect(await page.getByText('Disabled', { exact: true }).count()).toBeGreaterThan(0)
    expect(await page.evaluate(() => (window as any).calls)).toEqual([])
    await page.getByRole('checkbox', { name: 'Enable automatic review and publication' }).check()
    await page.getByRole('button', { name: 'Process pending', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).calls)).toEqual(['save','run'])
    expect(await page.evaluate(() => Object.values((window as any).config.automation.stages).every((stage: any) => stage.provider === 'external' && stage.model === 'chosen-reviewer'))).toBe(true)
  } finally { await page.close() }
})
it('keeps the native checkbox hidden when automation is disabled, while retaining keyboard switching', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    const capture = page.getByRole('checkbox').first()
    const automation = page.getByRole('checkbox', { name: 'Enable automatic review and publication' })
    await capture.uncheck()
    expect(await automation.isDisabled()).toBe(true)
    expect(await automation.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
    const track = automation.locator('xpath=following-sibling::span')
    expect(await track.evaluate(element => getComputedStyle(element).opacity)).toBe('0.4')
    await capture.check()
    await automation.focus(); await automation.press('Space')
    expect(await automation.isChecked()).toBe(true)
    expect(await track.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect(await page.evaluate(() => (window as any).config.automation.enabled)).toBe(true)
  } finally { await page.close() }
})
it('keeps personal review when knowledge closes and blocks review when both domains close', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, true)
    await page.evaluate(() => (window as any).dock.getState().openTool('review'))
    await page.locator('[data-tool="assist"]').waitFor()
    await page.evaluate(() => (window as any).features.getState().apply({ knowledge: false }))
    await expect.poll(() => page.getByRole('heading', { name: 'Knowledge automation', exact: true }).count()).toBe(0)
    expect(await page.locator('[data-tool="assist"]').count()).toBe(1)
    expect(await page.getByText('GeneralSettingsPanel', { exact: true }).count()).toBe(1)
    await page.evaluate(() => { const dock=(window as any).dock.getState();dock.openTool('review');dock.activateTool('review');dock.toggleFromRail('review');dock.openTool('persona') })
    expect(await page.evaluate(() => (window as any).dock.getState().openToolIds)).toEqual(['assist'])
    await page.evaluate(() => (window as any).features.getState().apply({ persona: false }))
    await expect.poll(() => page.locator('[data-tool="assist"]').count()).toBe(0)
    await page.evaluate(() => (window as any).dock.getState().openTool('review'))
    expect(await page.evaluate(() => (window as any).dock.getState().openToolIds)).toEqual([])
    await page.evaluate(() => (window as any).features.getState().apply({ knowledge: true }))
    expect(await page.locator('[data-tool="assist"]').count()).toBe(0)
  } finally { await page.close() }
})

it('groups settings navigation, hides empty memory groups and keeps narrow navigation reachable', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
  try {
    await mount(page, true)
    const navigation = page.getByRole('navigation', { name: 'Settings', exact: true })
    const memory = navigation.getByRole('region', { name: 'Knowledge & memory', exact: true })
    const models = navigation.getByRole('region', { name: 'Models & usage', exact: true })
    expect(await memory.locator('[data-tab]').count()).toBe(2)
    expect(await models.locator('[data-tab]').evaluateAll(elements => elements.map(element => element.getAttribute('data-tab')))).toEqual(['llm', 'models', 'usage'])
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/settings-groups-dark.png', animations: 'disabled' })
    await page.setViewportSize({ width: 1200, height: 520 })
    await navigation.locator('[data-tab="hosted"]').click()
    expect(await navigation.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/settings-scrollbar-dark.png', animations: 'disabled' })
    await page.evaluate(() => document.documentElement.dataset.theme = 'planche')
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/settings-scrollbar-planche.png', animations: 'disabled' })
    await page.setViewportSize({ width: 1200, height: 850 })
    await models.locator('[data-tab="llm"]').click()
    await page.getByText('LlmConfigModal', { exact: true }).waitFor()
    await models.locator('[data-tab="usage"]').click()
    await page.getByText('UsageStatsPanel', { exact: true }).waitFor()
    expect(await models.locator('[data-tab="usage"]').getAttribute('aria-current')).toBe('page')
    await memory.locator('[data-tab="personal"]').click()
    await page.evaluate(() => (window as any).features.getState().apply({ knowledge: false }))
    await expect.poll(() => memory.locator('[data-tab]').count()).toBe(1)
    expect(await memory.locator('[data-tab="personal"]').getAttribute('aria-current')).toBe('page')
    await page.evaluate(() => (window as any).features.getState().apply({ persona: false }))
    await expect.poll(() => memory.count()).toBe(0)
    await page.getByText('GeneralSettingsPanel', { exact: true }).waitFor()
    await page.evaluate(() => (window as any).features.getState().apply({ knowledge: true, persona: false }))
    await expect.poll(() => memory.locator('[data-tab]').count()).toBe(1)
    expect(await memory.locator('[data-tab="knowledge"]').count()).toBe(1)
    await page.setViewportSize({ width: 640, height: 720 })
    await page.evaluate(() => document.documentElement.dataset.theme = 'planche')
    await navigation.locator('[data-tab="hosted"]').click()
    await page.getByText('HostedSettingsPanel', { exact: true }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/settings-groups-narrow.png', animations: 'disabled' })
  } finally { await page.close() }
})

it('requires confirmation for both directions of every experimental feature and cancels without closing settings', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
  try {
    await mount(page, true)
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
    await page.locator('[data-tab="experimental"]').click()
    for (const key of ['blueprint', 'knowledge', 'roundtable', 'persona', 'remoteControl', 'teamCollab']) {
      for (const value of [true, false]) {
        await page.evaluate(({ key, value }) => (window as any).features.getState().apply({ [key]: !value }), { key, value })
        const input = page.getByRole('checkbox').nth(['blueprint', 'knowledge', 'roundtable', 'persona', 'remoteControl', 'teamCollab'].indexOf(key))
        const before = await page.evaluate(() => (window as any).featureWrites.length)
        // The visible switch track dispatches a real checkbox click.
        await input.locator('..').click()
        const dialog = page.locator('dialog')
        await dialog.waitFor()
        expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
        const bounds = (await dialog.boundingBox())!
        const viewport = page.viewportSize()!
        expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThan(2)
        expect(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2)).toBeLessThan(2)
        expect(await input.isChecked()).toBe(!value)
        expect(await page.evaluate(() => (window as any).featureWrites.length)).toBe(before)
        if (key === 'blueprint' && value) {
          expect(await dialog.innerText()).toContain('WorkflowX')
          await page.screenshot({ path: 'artifacts/memory-domain-acceptance/experimental-confirm-dark.png', animations: 'disabled' })
        }
        await page.keyboard.press('Escape')
        await expect.poll(() => dialog.count()).toBe(0)
        expect(await page.evaluate(() => (window as any).settingsCloseCount)).toBe(0)
        expect(await page.evaluate(() => (window as any).featureWrites.length)).toBe(before)
        await input.locator('..').click()
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        expect(await input.isChecked()).toBe(!value)
        await input.locator('..').click()
        await dialog.getByRole('button', { name: value ? 'Enable feature' : 'Disable feature', exact: true }).click()
        await expect.poll(() => input.isChecked()).toBe(value)
        expect(await page.evaluate(() => (window as any).featureWrites.at(-1))).toEqual({ [key]: value })
      }
    }
  } finally { await page.close() }
})

it('keeps feature state on save failure and prevents repeated submissions while saving', async () => {
  const page = await browser.newPage({ viewport: { width: 640, height: 720 } })
  try {
    await mount(page, true)
    await page.locator('[data-tab="experimental"]').click()
    await page.evaluate(() => { (window as any).featureSave = 'wait'; document.documentElement.dataset.theme = 'planche' })
    const input = page.getByRole('checkbox').first()
    const original = await input.isChecked()
    await input.locator('..').click()
    const dialog = page.locator('dialog')
    const bounds = (await dialog.boundingBox())!
    expect(Math.abs(bounds.x + bounds.width / 2 - 320)).toBeLessThan(2)
    expect(Math.abs(bounds.y + bounds.height / 2 - 360)).toBeLessThan(2)
    await page.screenshot({ path: 'artifacts/memory-domain-acceptance/experimental-confirm-planche.png', animations: 'disabled' })
    await dialog.getByRole('button', { name: original ? 'Disable feature' : 'Enable feature' }).click()
    expect(await dialog.getByRole('button', { name: 'Cancel' }).isDisabled()).toBe(true)
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => (window as any).featureWrites.length)).toBe(1)
    await page.evaluate(() => { (window as any).featureSave = 'fail'; (window as any).finishFeatureSave() })
    await expect.poll(() => dialog.count()).toBe(0)
    expect(await input.isChecked()).toBe(original)
    await page.getByRole('alert').waitFor()
    await page.evaluate(() => (window as any).featureSave = 'pass')
    await input.locator('..').click()
    await dialog.getByRole('button', { name: original ? 'Disable feature' : 'Enable feature' }).click()
    await expect.poll(() => input.isChecked()).toBe(!original)
  } finally { await page.close() }
})

it('opens engineering settings directly inside the knowledge workbench', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
  try {
    await mount(page, true)
    await page.evaluate(() => (window as any).showMemory())
    await page.getByRole('navigation', { name: 'Knowledge & memory', exact: true }).getByRole('button', { name: 'Project knowledge', exact: true }).click()
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await page.getByRole('heading', { name: 'Knowledge automation', exact: true }).waitFor()
    const recording = page.getByRole('checkbox', { name: 'Enable knowledge recording', exact: true })
    await recording.uncheck()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).config.enabled)).toBe(false)
    expect(await page.evaluate(() => (window as any).features.getState().persona)).toBe(true)
  } finally { await page.close() }
})

it('requires passing checks before offering local stages and disables immediately without Save', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    const stage = page.getByRole('button', { name: 'Entry review', exact: true })
    await stage.click()
    expect(await page.getByRole('option', { name: 'Local model', exact: true }).count()).toBe(0)
    await page.keyboard.press('Escape')
    await page.getByText('Local service', { exact: true }).click()
    await page.evaluate(() => (window as any).localResult = 'fail')
    await page.getByRole('button', { name: 'Check and enable', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Not enough available resources' }).waitFor()
    expect(await page.evaluate(() => (window as any).config.automation.local.enabled)).toBe(false)
    await page.evaluate(() => (window as any).localResult = 'pass')
    await page.getByRole('button', { name: 'Check and enable', exact: true }).click()
    await page.getByText('Checks passed, enabled · 32K tokens', { exact: true }).waitFor()
    await stage.scrollIntoViewIfNeeded(); await page.waitForTimeout(100)
    await stage.click(); await page.getByRole('option', { name: 'Local model', exact: true }).click()
    await page.getByRole('button', { name: 'Disable local deployment', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).config.automation.local.enabled)).toBe(false)
    await stage.scrollIntoViewIfNeeded(); await page.waitForTimeout(100); await stage.click()
    expect(await page.getByRole('option', { name: 'Local model', exact: true }).count()).toBe(0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    expect(await page.getByText('Disabled', { exact: true }).count()).toBeGreaterThan(0)
  } finally { await page.close() }
})
it('ignores a late check completion after cancellation', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.getByText('Local service', { exact: true }).click()
    await page.evaluate(() => (window as any).localResult = 'wait')
    await page.getByRole('button', { name: 'Check and enable', exact: true }).click()
    await expect.poll(() => page.evaluate(() => typeof (window as any).finishCheck)).toBe('function')
    await page.getByRole('button', { name: 'Cancel check and disable', exact: true }).click()
    await page.evaluate(() => (window as any).finishCheck())
    await page.getByRole('button', { name: 'Check and enable', exact: true }).waitFor()
    expect(await page.getByText('Checks passed, enabled · 32K tokens', { exact: true }).count()).toBe(0)
    await page.getByRole('button', { name: 'Entry review', exact: true }).click()
    expect(await page.getByRole('option', { name: 'Local model', exact: true }).count()).toBe(0)
  } finally { await page.close() }
})

it('downloads only on request, allows cancellation and fills verified paths without enabling', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    await page.getByText('Local service', { exact: true }).click()
    expect(await page.evaluate(() => (window as any).calls)).toEqual([])
    await page.getByRole('button', { name: 'Download or reuse local resources', exact: true }).click()
    await page.getByRole('progressbar', { name: 'Local resource download progress' }).waitFor()
    expect(await page.getByRole('button', { name: 'Check and enable', exact: true }).isDisabled()).toBe(true)
    await page.getByRole('button', { name: 'Cancel download and disable', exact: true }).click()
    await page.getByText('Cancelled. Complete verified files are kept for reuse on retry.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Retry local resource setup', exact: true }).click()
    await page.evaluate(() => Object.assign((window as any).resources, { phase: 'ready', serverPath: 'C:\\cache\\llama-server.exe', modelPath: 'C:\\cache\\qwen.gguf' }))
    await expect.poll(() => page.getByLabel('llama-server path', { exact: true }).inputValue()).toBe('C:\\cache\\llama-server.exe')
    expect(await page.getByLabel('GGUF weights path', { exact: true }).inputValue()).toBe('C:\\cache\\qwen.gguf')
    expect(await page.evaluate(() => (window as any).config.automation.local.enabled)).toBe(false)
    expect(await page.evaluate(() => (window as any).calls)).toEqual(['install', 'stop', 'install'])
    await page.getByRole('button', { name: 'Check and enable', exact: true }).click()
    await page.getByText('Checks passed, enabled · 32K tokens', { exact: true }).waitFor()
    expect(await page.evaluate(() => (window as any).config.automation.local.serverPath)).toBe('C:\\cache\\llama-server.exe')
    await page.getByRole('button', { name: 'Disable local deployment', exact: true }).click()
    await page.getByLabel('llama-server path', { exact: true }).fill('')
    await page.getByLabel('GGUF weights path', { exact: true }).fill('')
    await page.waitForTimeout(1000)
    expect(await page.getByLabel('llama-server path', { exact: true }).inputValue()).toBe('')
    await page.setViewportSize({ width: 640, height: 720 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally { await page.close() }
})

it('opens personal memory without engineering, saves independent settings and unmounts on disable', async () => {
  const page = await browser.newPage({viewport:{width:820,height:720}})
  try {
    await mount(page)
    await page.evaluate(() => { (window as any).features.getState().apply({knowledge:false,persona:true}); (window as any).showMemory() })
    await page.getByText('Tree', {exact:true}).waitFor()
    await page.evaluate(() => document.documentElement.dataset.theme='dark')
    await page.screenshot({path:'artifacts/memory-domain-acceptance/personal-dark.png',animations:'disabled'})
    expect(await page.getByRole('button', {name:'Project knowledge',exact:true}).count()).toBe(0)
    await page.getByRole('button', {name:'Preferences',exact:true}).click()
    await page.getByRole('heading', {name:'Recent memory retention',exact:true}).waitFor()
    await page.evaluate(() => document.documentElement.dataset.theme='planche')
    await page.setViewportSize({width:640,height:720})
    await page.screenshot({path:'artifacts/memory-domain-acceptance/personal-settings-planche.png',animations:'disabled'})
    const recall = page.getByRole('checkbox', {name:'Use personal memory in chat'})
    await recall.uncheck()
    await expect.poll(() => page.evaluate(() => (window as any).personalSettings?.useInChat)).toBe(false)
    await page.getByRole('combobox').selectOption('30')
    await expect.poll(() => page.evaluate(() => (window as any).personalSettings.episodeTtlDays)).toBe(30)
    expect(await page.evaluate(() => (window as any).config.enabled)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', {name:'Personal memory review',exact:true}).click()
    expect(await page.getByRole('button', {name:/Project knowledge/}).count()).toBe(0)
    await page.evaluate(() => (window as any).features.getState().apply({persona:false}))
    await expect.poll(() => page.getByRole('region', {name:'Knowledge & memory'}).count()).toBe(0)
  } finally { await page.close() }
})
