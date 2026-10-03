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
    const status=()=>({enabled:window.config.automation.enabled,running:false,counts,total:0,tasks:[]})
    window.electron={llm:{getTerminalProviders:async()=>[{id:'external',name:'My provider',modelId:'chosen-reviewer',enabled:true}]},knowledge:{
      getSettings:async()=>window.config,updateSettings:async(value)=>{window.calls.push('save');window.config=value;return value},externalMcpStatus:async()=>null,
      automationStatus:async()=>status(),automationRun:async()=>{window.calls.push('run');return status()},automationRetry:async()=>{},
      jevCredentialStatus:async()=>({configured:false}),setJevCredential:async()=>{},stopLocalModel:async()=>window.calls.push('stop')
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
  page.setDefaultTimeout(4000); await page.setContent('<div id="root"></div>'); await page.addStyleTag({ content: css + '\n*{box-sizing:border-box}body{margin:0;padding:16px}#root{max-width:800px}' })
  await page.evaluate(value => { (window as any).gates = value }, gates); await page.addScriptTag({ content: script })
  await page.getByRole('heading', { name: 'Knowledge automation', exact: true }).waitFor()
}
it('configures all four stages, excludes Jev generation, saves before running and supports external-only', async () => {
  const page = await browser.newPage()
  try {
    await mount(page)
    for (const stage of ['Knowledge extraction','Entry review','Wiki generation','Wiki review']) {
      await page.getByRole('button', { name: stage, exact: true }).scrollIntoViewIfNeeded()
      await page.waitForTimeout(100)
      await page.getByRole('button', { name: stage, exact: true }).click()
      expect(await page.getByRole('option', { name: 'Jev review', exact: true }).count()).toBe(stage.includes('review') ? 1 : 0)
      await page.getByRole('option', { name: 'External model', exact: true }).click()
      const field = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: stage }) })
      await field.getByRole('button', { name: 'External provider' }).click()
      await page.getByRole('option', { name: 'My provider', exact: true }).click()
    }
    expect(await page.getByText('Local service', { exact: true }).count()).toBe(0)
    await page.getByRole('checkbox', { name: 'Enable automatic review and publication' }).check()
    await page.getByRole('button', { name: 'Process pending', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).calls)).toEqual(['save','run'])
    expect(await page.evaluate(() => Object.values((window as any).config.automation.stages).every((stage: any) => stage.provider === 'external' && stage.model === 'chosen-reviewer'))).toBe(true)
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
