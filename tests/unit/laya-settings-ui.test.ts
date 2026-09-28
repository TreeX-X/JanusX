import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import { build } from 'esbuild'

let browser: Browser
let script: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'
      import {createRoot} from 'react-dom/client'
      import i18n from 'i18next'
      import {initReactI18next} from 'react-i18next'
      import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'
      import {LayaSettingsPanel} from './src/renderer/src/components/LayaSettingsPanel'
      window.calls=[]
      window.electron={knowledge:{layaControl:async action=>{window.calls.push(action);return {phase:'stopped',reason:'',modelRevision:'test'}}}}
      function Panel(){
        const [saving,setSaving]=React.useState(false)
        const save=()=>{setSaving(true);return new Promise(resolve=>window.finishSave=()=>{setSaving(false);resolve(true)})}
        return <LayaSettingsPanel value={{enabled:true,pythonPath:'C:/python.exe',modelPath:''}} onChange={()=>{}} onSave={save} disabled={saving}/>
      }
      i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(()=>
        createRoot(document.getElementById('root')).render(<Panel/>))
    ` },
    bundle: true, write: false, outfile: 'laya-settings-test.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'i18n', setup(builder) {
      builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next'; export default i18n; export const changeLanguage = lang => i18n.changeLanguage(lang)", loader: 'ts' }))
    } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
})
afterAll(async () => { await browser?.close() })

it('lets unload cancel a warm-up while settings are still saving', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: script })
    await page.getByRole('button', { name: 'Load and warm up', exact: true }).click()
    expect(await page.getByRole('button', { name: 'Load and warm up', exact: true }).isDisabled()).toBe(true)
    await page.getByRole('button', { name: 'Unload model', exact: true }).click()
    await page.evaluate(() => (window as any).finishSave())
    expect(await page.evaluate(() => (window as any).calls.filter((x: string) => x !== 'status'))).toEqual(['stop'])
    await expect.poll(() => page.getByRole('button', { name: 'Load and warm up', exact: true }).isEnabled()).toBe(true)
  } finally { await page.close() }
})
