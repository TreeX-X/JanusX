import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import { build } from 'esbuild'

let browser: Browser
let script: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import {createRoot} from 'react-dom/client'
    import i18n from 'i18next'
    import {initReactI18next} from 'react-i18next'
    import knowledge from './src/renderer/src/i18n/locales/en/knowledge.json'
    import {ObservationRevokeControl} from './src/renderer/src/components/knowledge/ObservationRevokeControl'
    window.calls=[]; window.refreshes=0;window.fail=false
    window.electron={knowledge:{observationRevocationContext:async input=>({sourceHash:'a'.repeat(64),content:'Current authoritative source',revoked:false}),
      revokeObservation:async input=>{window.calls.push(input);if(window.fail)throw Error('Source changed');if(window.defer)await new Promise(resolve=>window.finish=resolve)}}}
    const root=createRoot(document.getElementById('root'))
    window.unmount=()=>root.render(null)
    i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge}},interpolation:{escapeValue:false}}).then(()=>root.render(<ObservationRevokeControl id="source" workspaceId="ws" onRevoked={()=>window.refreshes++}/>))
  ` }, bundle: true, write: false, outfile: 'observation-revocation-ui.js', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'i18n-hook', setup(build) {
      build.onLoad({ filter: /i18n[/\\]useI18n\.ts$/ }, () => ({ contents: "import {useTranslation} from 'react-i18next'; export const useI18n=()=>useTranslation('knowledge')", loader: 'ts' }))
    } }],
  })
  script = result.outputFiles[0].text
})
afterAll(async () => { await browser?.close() })

describe('observation withdrawal confirmation', () => {
  it('previews current source, requires confirmation and reloads after stale failure', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Withdraw this source', exact: true }).click()
      await page.getByText('Current authoritative source').waitFor()
      expect(await page.evaluate(() => (window as any).calls)).toEqual([])
      await page.evaluate(() => { (window as any).fail = true })
      await page.getByRole('button', { name: 'Confirm source withdrawal', exact: true }).click()
      await page.getByRole('alert').waitFor()
      expect(await page.getByRole('button', { name: 'Confirm source withdrawal', exact: true }).count()).toBe(0)
      await page.evaluate(() => { (window as any).fail = false })
      await page.getByRole('button', { name: 'Withdraw this source', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm source withdrawal', exact: true }).click()
      await page.waitForFunction(() => (window as any).refreshes === 1)
      expect(await page.evaluate(() => (window as any).calls)).toEqual(Array(2).fill({ id: 'source', workspaceId: 'ws', sourceHash: 'a'.repeat(64) }))
    } finally { await page.close() }
  })
  it('does not refresh a closed detail after a pending submission completes', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Withdraw this source', exact: true }).click()
      await page.evaluate(() => { (window as any).defer = true })
      await page.getByRole('button', { name: 'Confirm source withdrawal', exact: true }).click()
      await page.evaluate(() => (window as any).unmount())
      await page.waitForFunction(() => !document.querySelector('button'))
      await page.evaluate(() => (window as any).finish())
      expect(await page.evaluate(() => (window as any).calls.length)).toBe(1)
      expect(await page.evaluate(() => (window as any).refreshes)).toBe(0)
    } finally { await page.close() }
  })
})
