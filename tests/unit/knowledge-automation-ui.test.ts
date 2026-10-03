import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { build } from 'esbuild'
let browser: Browser, script: string, css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client'; import i18n from 'i18next'; import {initReactI18next} from 'react-i18next'
    import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'; import settings from './src/renderer/src/i18n/locales/en/settings.json'; import common from './src/renderer/src/i18n/locales/en/common.json'
    import {KnowledgeSettingsPanel} from './src/renderer/src/components/KnowledgeSettingsPanel'
    import {AppSettingsModal} from './src/renderer/src/components/AppSettingsModal'
    import {RightDock} from './src/renderer/src/components/right-tools/RightDock'
    import {useExperimentalStore} from './src/renderer/src/stores/experimental'
    import {useRightToolStore} from './src/renderer/src/stores/right-tools'
    import {defaultKnowledgeAutomation} from './src/shared/knowledge-automation'
    const counts={pending:0,running:0,succeeded:0,'needs-review':0,failed:0,cancelled:0}
    window.calls=[];window.config={enabled:true,mode:'deterministic-only',autoAcceptDeterministicFacts:false,automation:defaultKnowledgeAutomation()}
    window.localResult='pass'
    const disabledLocal=()=>{window.config.automation.local.enabled=false;Object.values(window.config.automation.stages).forEach(stage=>{if(stage.provider==='local')stage.provider='off'})}
    const status=()=>({enabled:window.config.automation.enabled,running:false,counts,total:0,tasks:[]})
    window.electron={llm:{getTerminalProviders:async()=>[{id:'external',name:'My provider',modelId:'chosen-reviewer',enabled:true}]},knowledge:{
      getSettings:async()=>window.config,updateSettings:async(value)=>{window.calls.push('save');value.automation.local=window.config.automation.local;window.config=value;return structuredClone(value)},externalMcpStatus:async()=>null,
      automationStatus:async()=>status(),automationRun:async()=>{window.calls.push('run');return status()},automationRetry:async()=>{},
      jevCredentialStatus:async()=>({configured:false}),setJevCredential:async()=>{},stopLocalModel:async()=>{window.calls.push('stop');disabledLocal()},
      configureLocalModel:async(local)=>{window.calls.push('check');if(window.localResult==='wait')await new Promise(resolve=>window.finishCheck=resolve);const ok=window.localResult!=='fail';if(ok)window.config.automation.local=local;return {settings:structuredClone(window.config),report:{ok,reason:ok?undefined:'local-memory-insufficient',mode:'gpu',availableMemoryMiB:16000,availableVramMiB:6000,modelContextTokens:262144,recommendedContextTokens:32768,selectedContextTokens:32768,supportedContextTokens:[32768]}}}
    }}
    useExperimentalStore.setState({loaded:true,knowledge:true,persona:true,load:async()=>{}})
    window.features=useExperimentalStore;window.dock=useRightToolStore
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge,settings,common}},interpolation:{escapeValue:false}}).then(()=>{
      window.root=createRoot(document.getElementById('root'))
      window.root.render(window.gates?<><AppSettingsModal isOpen initialTab='knowledge' onClose={()=>{}}/><RightDock effectiveCollapsed={false} effectiveMaxWidth={600} forcedCollapsed={false} onResizingChange={()=>{}}/></>:<KnowledgeSettingsPanel/>)
    })
  ` }, bundle: true, write: false, outfile: 'automation-ui.js', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'fixtures', setup(builder) {
    builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n;export const changeLanguage=()=>{}", loader: 'ts' }))
    builder.onLoad({ filter: /[/\\](GeneralSettingsPanel|ExperimentalSettingsPanel|NotificationSettingsPanel|LlmConfigModal|ModelCatalogPanel|AgentSettingsPanel|UsageStatsPanel|HostedSettingsPanel|TeamSettingsPanel)\.tsx$/ }, args => {
      const name = args.path.split(/[/\\]/).at(-1)!.replace('.tsx', '')
      return { contents: `import React from 'react';export function ${name}(){return <div>${name}</div>}`, loader: 'tsx' }
    })
    builder.onLoad({ filter: /[/\\]RightToolHost\.tsx$/ }, () => ({ contents: `import React from 'react';export function RightToolHost({openToolIds}){return <>{openToolIds.map(toolId=><div key={toolId} data-tool={toolId}>{toolId}</div>)}</>}`, loader: 'tsx' }))
  } }] })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text; css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text
})
afterAll(async () => { await browser?.close() })
async function mount(page: Page, gates = false) {
  page.setDefaultTimeout(4000); await page.setContent('<div id="root"></div>'); await page.addStyleTag({ content: css + '\n:root{--shell-accent:#ff7830}*{box-sizing:border-box}body{margin:0;padding:16px}#root{max-width:800px}' })
  await page.evaluate(value => { (window as any).gates = value }, gates); await page.addScriptTag({ content: script })
  await page.getByRole('heading', { name: 'Knowledge automation', exact: true }).waitFor()
}
it('configures all four stages, excludes Jev generation, saves before running and supports external-only', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  try {
    await mount(page)
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
it('unmounts knowledge settings and review immediately, blocks programmatic reopen and keeps persona independent', async () => {
  const page = await browser.newPage()
  try {
    await mount(page, true)
    await page.evaluate(() => (window as any).dock.getState().openTool('review'))
    await page.locator('[data-tool="review"]').waitFor()
    await page.evaluate(() => (window as any).features.getState().apply({ knowledge: false }))
    await expect.poll(() => page.getByRole('heading', { name: 'Knowledge automation', exact: true }).count()).toBe(0)
    expect(await page.locator('[data-tool="review"]').count()).toBe(0)
    expect(await page.getByText('GeneralSettingsPanel', { exact: true }).count()).toBe(1)
    await page.evaluate(() => { const dock=(window as any).dock.getState();dock.openTool('review');dock.activateTool('review');dock.toggleFromRail('review');dock.openTool('persona') })
    expect(await page.evaluate(() => (window as any).dock.getState().openToolIds)).toEqual(['persona'])
    await page.evaluate(() => (window as any).features.getState().apply({ knowledge: true }))
    expect(await page.locator('[data-tool="review"]').count()).toBe(0)
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
