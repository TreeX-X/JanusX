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
    import {ObservationRevocations} from './src/renderer/src/components/knowledge/ObservationRevocations'
    window.calls=[]; window.refreshes=0;window.fail=false
    window.electron={knowledge:{observationRevocationContext:async input=>({sourceHash:'a'.repeat(64),content:'Current authoritative source',revoked:false}),
      revokeObservation:async input=>{window.calls.push(input);if(window.fail)throw Error('Source changed');if(window.defer)await new Promise(resolve=>window.finish=resolve)}}}
    const root=createRoot(document.getElementById('root'))
    window.renderHistory=()=>root.render(<ObservationRevocations/>)
    window.historyReads=[];window.historyWait=false;window.pendingHistory=[]
    window.electron.knowledge.observationRevocations=async input=>{
      window.historyReads.push(input)
      const result={total:21,offset:input.offset,limit:20,items:Array.from({length:input.offset?1:20},(_,i)=>({key:'key-'+(input.offset+i),revokedAt:'2026-09-29',observationCount:2,factCount:3,sourceStatus:input.offset?'missing':'available',...(input.offset?{}:{source:{id:'source-'+i,workspaceId:'ws',content:'Current source '+i,truncated:false}})}))}
      if(window.historyWait)return await new Promise(resolve=>window.pendingHistory.push(()=>resolve({...result,total:999})))
      return result
    }
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
  it('pages withdrawal history and keeps missing sources visible', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Withdraw this source', exact: true }).waitFor()
      await page.evaluate(() => (window as any).renderHistory())
      await page.getByRole('heading', { name: 'Withdrawn sources (21)' }).waitFor()
      expect(await page.locator('details').count()).toBe(20)
      await page.locator('summary').first().click()
      await page.getByText('Current source 0', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Next page', exact: true }).click()
      await page.getByText('Source cannot be uniquely resolved', { exact: false }).waitFor()
      await page.locator('summary').click()
      await page.getByText('Original source is missing; the withdrawal record remains effective.').waitFor()
      expect(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled()).toBe(true)
      expect(await page.evaluate(() => (window as any).historyReads)).toEqual([{offset:0,limit:20},{offset:20,limit:20}])
    } finally { await page.close() }
  })

  it('ignores an old history response after refresh', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script })
      await page.getByRole('button', { name: 'Withdraw this source', exact: true }).waitFor()
      await page.evaluate(() => { (window as any).historyWait=true;(window as any).renderHistory() })
      await page.waitForFunction(() => (window as any).pendingHistory.length===1)
      await page.evaluate(() => { (window as any).historyWait=false })
      await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
      await page.getByRole('heading', { name: 'Withdrawn sources (21)' }).waitFor()
      await page.evaluate(() => (window as any).pendingHistory[0]())
      expect(await page.getByRole('heading', { name: 'Withdrawn sources (999)' }).count()).toBe(0)
    } finally { await page.close() }
  })

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
