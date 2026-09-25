import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'

let browser: Browser
let script: string
let css: string
const uri = 'note://972afef3-2fc7-49de-a3ee-7e041225d28c/00000000-0000-4000-8000-000000000001'
const secondUri = uri.slice(0, -1) + '2'
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: [
      "import React from 'react'",
      "import {createRoot} from 'react-dom/client'",
      "import {NoteWikiLinks, WikiPageDetail} from './src/renderer/src/components/knowledge/NoteWikiLinks'",
      'const uri = ' + JSON.stringify(uri),
      "const wikiPage = {workspaceId:'workspace-A',workspacePath:'/checkout-A',slug:'design',title:'Design',markdown:'# Whole published page\\n' + 'full text '.repeat(50) + 'END-OF-PAGE',sourceFactIds:['fact-1'],sourceNoteRefs:[{uri,sourceHash:'old-hash'}],version:7,status:'published',tags:[],updatedAt:'2026-09-25'}",
      "window.calls = []; window.deferred = {}; window.defer = false",
      "window.electron = {knowledge:{",
      "noteWikiPages: async input => {window.calls.push(['pages',input]); if(window.defer) return new Promise(resolve => window.deferred[input.uri] = resolve); return [{page:wikiPage,sources:[{uri,status:'changed',sourceHash:'old-hash',currentHash:'new-hash'}]}]},",
      "noteWikiStatuses: async input => {window.calls.push(['statuses',input]); return [{uri,status:'changed',sourceHash:'old-hash',currentHash:'new-hash'}]},",
      "prepareNoteWiki: async input => {window.calls.push(['prepare',input]); return {draftId:'host-receipt',page:input.expectedVersion ? wikiPage : undefined,sources:input.uris.map(uri=>({uri,sourceHash:'host-hash',raw:'# Current source bytes'}))}},",
      "proposeNoteWiki: async input => {window.calls.push(['propose',input]); return {id:'candidate-1',type:'wiki-patch',status:'proposed',pageSlug:'design',title:input.title,patchMarkdown:input.markdown,rationale:input.rationale,sourceNoteRefs:[{uri,sourceHash:'host-hash'}]}},",
      "applyCandidate: async input => {window.calls.push(['apply',input]); return {candidate:{id:input.id,status:'applied',patchMarkdown:'# Reviewed replacement'}}},",
      "rejectCandidate: async input => {window.calls.push(['reject',input]); return {candidate:{id:input.id,status:'rejected',patchMarkdown:'# Reviewed replacement'}}}",
      '}}',
      "const root = createRoot(document.getElementById('root'))",
      "window.renderLinks = (selectedUri = uri) => root.render(<NoteWikiLinks rootPath='/checkout-A' uri={selectedUri} onOpenNote={value => window.calls.push(['open',value])}/>)",
      "window.renderPage = () => root.render(<WikiPageDetail page={wikiPage}/>)",
      'window.renderLinks()',
    ].join('\n') },
    bundle: true, write: false, outfile: 'test-bundle.js', jsx: 'automatic', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? ''
})
afterAll(async () => { await browser?.close() })

async function open(): Promise<Page> {
  const page = await browser.newPage()
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: script })
  await page.addStyleTag({ content: css })
  return page
}

describe('Note wiki reachable UI', () => {
  it('opens the full published page, source statuses and explicit complete-page editor', async () => {
    const page = await open()
    try {
      await page.getByRole('button', { name: 'Design', exact: true }).click()
      await page.getByText('END-OF-PAGE', { exact: false }).first().waitFor()
      expect(await page.locator('body').innerText()).toContain('Workspace: workspace-A')
      expect(await page.locator('body').innerText()).toContain('changed')
      await page.getByRole('button', { name: 'Read sources for review' }).first().click()
      expect(await page.getByLabel('Complete page markdown').inputValue()).toContain('END-OF-PAGE')
      expect(await page.getByRole('button', { name: 'Submit for wiki approval' }).isDisabled()).toBe(true)
      const calls = await page.evaluate(() => (window as unknown as { calls: unknown[][] }).calls)
      expect(calls.find(call => call[0] === 'prepare')?.[1]).toMatchObject({ expectedVersion: 7, reviewMode: 'full-page', rootPath: '/checkout-A', uris: [uri] })
    } finally { await page.close() }
  })

  it('composes from multiple sources and publishes through existing approval with no renderer hash payload', async () => {
    const page = await open()
    try {
      await page.getByLabel('Page slug').fill('summary')
      await page.getByLabel('Source Note URIs').fill(uri + '\n' + secondUri)
      await page.getByRole('button', { name: 'Read sources for review' }).click()
      await page.getByLabel('Title', { exact: true }).fill('Combined summary')
      await page.getByLabel('Complete page markdown').fill('# Reviewed replacement')
      await page.getByLabel('Review rationale').fill('Reviewed all source content')
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Submit for wiki approval' }).click()
      await page.getByRole('button', { name: 'Approve and publish' }).click()
      await page.getByText('Published through the existing wiki approval and audit path.').waitFor()
      const calls = await page.evaluate(() => (window as unknown as { calls: unknown[][] }).calls)
      expect(calls.find(call => call[0] === 'prepare')?.[1]).toMatchObject({ uris: [uri, secondUri] })
      expect(calls.find(call => call[0] === 'propose')?.[1]).toEqual({ draftId: 'host-receipt', title: 'Combined summary', markdown: '# Reviewed replacement', rationale: 'Reviewed all source content' })
      expect(calls.find(call => call[0] === 'apply')?.[1]).toEqual({ type: 'wiki-patch', id: 'candidate-1' })
    } finally { await page.close() }
  })

  it('discards an earlier Note response when selection changes', async () => {
    const page = await open()
    try {
      await page.evaluate(() => { (window as any).defer = true })
      await page.getByRole('button', { name: 'Refresh knowledge references' }).click()
      await page.waitForFunction(uri => Boolean((window as any).deferred[uri]), uri)
      await page.evaluate(uri => (window as any).renderLinks(uri), secondUri)
      await page.waitForFunction(uri => Boolean((window as any).deferred[uri]), secondUri)
      await page.evaluate(uri => (window as any).deferred[uri]([]), secondUri)
      await page.getByText('No published knowledge pages record this Note as a source.').waitFor()
      await page.evaluate(uri => (window as any).deferred[uri]([{ page: { title: 'WRONG OLD RESPONSE', workspaceId: 'old', slug: 'old' }, sources: [] }]), uri)
      expect(await page.locator('body').innerText()).not.toContain('WRONG OLD RESPONSE')
      expect(await page.getByLabel('Source Note URIs').inputValue()).toBe(secondUri)
    } finally { await page.close() }
  })
})
