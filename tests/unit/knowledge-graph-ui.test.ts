import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

let browser: Browser
let script: string
let css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      import i18n from 'i18next'; import {initReactI18next} from 'react-i18next';
      import en from './src/renderer/src/i18n/locales/en/knowledge.json';
      i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge:en}},initImmediate:false});
      import {KnowledgeGraphCanvas} from './src/renderer/src/components/knowledge/KnowledgeGraphCanvas';
      import {Inspector} from './src/renderer/src/components/knowledge/KnowledgeWorkbench';
      import {useThemeStore} from './src/renderer/src/stores/theme';
      const target={workspaceId:'ws',slug:'target',title:'Target page',markdown:'Target body',tags:[],sourceFactIds:[],version:1,status:'published',freshness:'current',relationIssues:[],updatedAt:'2026-10-06'};
      const source={...target,slug:'source',title:'Source page',markdown:'# Published source\\nComplete Wiki body.',sourceFactIds:['fact'],relations:[{type:'references',target:{workspaceId:'ws',slug:'target',title:'Target page',version:1,contentHash:'a'.repeat(64)},reason:'Published reference',sourceFactIds:[]}]};
      const fact={id:'fact',content:'Fact with old evidence',status:'active',kind:'fact',scope:'project',version:1,tags:[],concepts:[],files:['src/shared.ts'],provenance:{workspaceId:'ws',sourceObservationIds:['old-source'],fileRefs:[]}};
      window.calls=[]; window.mode='success';
      window.electron={knowledge:{noteWikiStatuses:async()=>[],observationRevocationContext:async input=>{window.calls.push(input); if(window.mode==='defer') return new Promise(resolve=>window.finish=resolve); if(window.mode==='fail') throw Error('unavailable'); return {content:'Original evidence outside the recent 40.',revoked:false,sourceHash:'a'.repeat(64)}}}};
      const snapshot={wikiPages:[source,target],truthFacts:[fact],truthEdges:[],observations:Array.from({length:40},(_,i)=>({id:'recent-'+i})),factCandidates:[],wikiPatches:[],graphCandidates:[],libraryCards:[],auditEvents:[],conflicts:[],errors:[],loadedAt:'fixture'};
      const root=createRoot(document.getElementById('root'));
      function App({changed=false}) {
        const [selection,setSelection]=useState({id:'',record:null});
        const [data]=useState(()=>changed?{...snapshot,wikiPages:[{...source,relationIssues:[{type:'references',targetSlug:'target',status:'changed'}]},{...target,version:2}]}:snapshot);
        return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 320px',gap:16,height:650}}>
          <KnowledgeGraphCanvas snapshot={data} selectedId={selection.id} onSelect={(id,record)=>setSelection({id,record})}/>
          <Inspector automation={null} snapshot={data} record={selection.record} busy={false} error='' onApprove={()=>{}} onReject={()=>{}} onRevoke={()=>{}} onCloseDetail={()=>setSelection({id:'',record:null})}/>
        </div>
      }
      window.renderGraph=(changed=false,theme='dark')=>{useThemeStore.setState({theme});document.documentElement.dataset.theme=theme;root.render(<App key={String(changed)+theme} changed={changed}/>)};
      window.renderGraph();
    ` },
    bundle: true, write: false, outfile: 'test-bundle.js', jsx: 'automatic', format: 'iife', loader: { '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'fixture-i18n', setup(builder) { builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next';export default i18n;export const changeLanguage=()=>{}", loader: 'ts' })) } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? ''
  await mkdir('artifacts/knowledge-g1-browser', { recursive: true })
})
afterAll(async () => { await browser?.close() })

async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (/008|couldn't create edge/i.test(message.text())) errors.push(message.text()) })
  await page.route('http://localhost/graph', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://localhost/graph')
  await page.addStyleTag({ content: css + '\n:root{--shell-muted:#8d929e;--shell-text:#ececf0}body{background:#101014;color:#eee;margin:16px}[data-theme=planche]{--shell-muted:#56655f;--shell-text:#1c343b} [data-theme=planche] body{background:#dccfa8;color:#1c343b}' })
  await page.addScriptTag({ content: script })
  try { await page.getByTitle('Source page', { exact: true }).waitFor() }
  catch (error) { throw new Error(`${error}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`) }
  return { page, errors }
}

async function visiblePaths(page: Page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll<SVGPathElement>('.react-flow__edge-path')).some(path => path.getTotalLength() > 20))
  return page.locator('.react-flow__edge-path').evaluateAll(paths => paths.map(path => {
    const box = path.getBoundingClientRect(), style = getComputedStyle(path)
    return { length: (path as SVGPathElement).getTotalLength(), extent: box.width + box.height, stroke: style.stroke, width: Number.parseFloat(style.strokeWidth), opacity: style.opacity }
  }))
}

async function traceFact(page: Page) {
  await page.getByTitle('Source page', { exact: true }).click()
  await page.getByRole('button', { name: 'Trace sources' }).click()
  await page.getByTitle('Fact with old evidence', { exact: true }).click()
}

describe('Wiki graph in Chromium', () => {
  it.each(['dark', 'planche'])('renders a real visible relationship in %s and opens the full Wiki without filtering nodes', async theme => {
    const { page, errors } = await open()
    try {
      await page.evaluate(theme => (window as any).renderGraph(false, theme), theme)
      const paths = await visiblePaths(page)
      expect(paths).toHaveLength(1)
      expect(paths[0]!.extent).toBeGreaterThan(20)
      expect(paths[0]!.width).toBeGreaterThan(0)
      expect(paths[0]!.stroke).not.toBe('none')
      expect(paths[0]!.opacity).not.toBe('0')
      await page.getByTitle('Source page', { exact: true }).click()
      await page.locator('[data-knowledge-markdown]').filter({ hasText: 'Complete Wiki body.' }).waitFor()
      expect(await page.locator('.react-flow__node').count()).toBe(2)
      expect(await page.getByRole('button', { name: 'Trace sources' }).count()).toBe(1)
      await page.screenshot({ path: `artifacts/knowledge-g1-browser/wiki-${theme}.png` })
      expect(errors).toEqual([])
    } finally { await page.close() }
  })

  it('traces facts and files, reads old evidence by scoped ID and returns to the Wiki-only view', async () => {
    const { page, errors } = await open()
    try {
      await traceFact(page)
      expect(await page.getByTitle('Target page', { exact: true }).count()).toBe(0)
      expect(await page.getByTitle('src/shared.ts', { exact: true }).count()).toBe(1)
      await page.getByRole('button', { name: 'Expand evidence' }).click()
      await page.getByTitle('Original evidence outside the recent 40.', { exact: true }).click()
      expect(await page.getByRole('button', { name: 'Archive', exact: true }).count()).toBe(0)
      expect(await page.getByRole('button', { name: 'Approve', exact: true }).count()).toBe(0)
      expect(await page.evaluate(() => (window as any).calls)).toEqual([{ id: 'old-source', workspaceId: 'ws' }])
      expect((await visiblePaths(page)).length).toBe(3)
      await page.screenshot({ path: 'artifacts/knowledge-g1-browser/trace.png' })
      await page.getByRole('button', { name: 'Back to Wiki graph' }).click()
      await page.getByTitle('Target page', { exact: true }).waitFor()
      expect(await page.locator('.react-flow__node').count()).toBe(2)
      expect(errors).toEqual([])
    } finally { await page.close() }
  })

  it('explains changed targets and failed evidence reads, and discards late reads after leaving trace', async () => {
    const { page, errors } = await open()
    try {
      await page.evaluate(() => (window as any).renderGraph(true))
      await page.getByText('1 relationship or source diagnostics').click()
      await page.getByText('Target version changed', { exact: false }).waitFor()
      expect(await page.locator('.react-flow__edge-path').count()).toBe(0)
      await traceFact(page)
      await page.evaluate(() => { (window as any).mode = 'fail' })
      await page.getByRole('button', { name: 'Expand evidence' }).click()
      await page.getByText('1 relationship or source diagnostics').click()
      await page.getByText('Evidence unavailable or read failed', { exact: false }).waitFor()
      await page.evaluate(() => { (window as any).mode = 'defer' })
      await page.getByRole('button', { name: 'Expand evidence' }).click()
      await page.waitForFunction(() => Boolean((window as any).finish))
      await page.getByRole('button', { name: 'Back to Wiki graph' }).click()
      await page.evaluate(() => (window as any).finish({ content: 'Late private evidence', revoked: false }))
      await page.getByTitle('Target page', { exact: true }).waitFor()
      expect(await page.getByText('Late private evidence').count()).toBe(0)
      expect(await page.locator('.react-flow__node').count()).toBe(2)
      expect(errors).toEqual([])
    } finally { await page.close() }
  })
})
