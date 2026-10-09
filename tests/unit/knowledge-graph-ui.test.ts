import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

let browser: Browser
let script: string
let css: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, {useState} from 'react'; import {flushSync} from 'react-dom'; import {createRoot} from 'react-dom/client';
      import i18n from 'i18next'; import {initReactI18next} from 'react-i18next';
      import en from './src/renderer/src/i18n/locales/en/knowledge.json';
      import zh from './src/renderer/src/i18n/locales/zh-CN/knowledge.json';
      import './src/renderer/src/styles/themes.generated.css';
      i18n.use(initReactI18next).init({lng:'en',resources:{en:{knowledge:en},'zh-CN':{knowledge:zh}},initImmediate:false});
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
      function App({changed=false,collection=null}) {
        const [selection,setSelection]=useState({id:'',record:null});
        const [data]=useState(()=>collection ?? (changed?{...snapshot,wikiPages:[{...source,relationIssues:[{type:'references',targetSlug:'target',status:'changed'}]},{...target,version:2}]}:snapshot));
        return <div style={{display:'grid',gridTemplateColumns:collection?'minmax(0,1fr)':'minmax(0,1fr) 320px',gap:16,height:650}}>
          <KnowledgeGraphCanvas snapshot={data} selectedId={selection.id} onSelect={(id,record)=>setSelection({id,record})}/>
          {collection ? <output hidden data-selected-record>{selection.record?.body}</output> : <Inspector automation={null} snapshot={data} record={selection.record} busy={false} error='' onApprove={()=>{}} onReject={()=>{}} onRevoke={()=>{}} onCloseDetail={()=>setSelection({id:'',record:null})}/>}
        </div>
      }
      window.renderGraph=(changed=false,theme='dark')=>{useThemeStore.setState({theme});document.documentElement.dataset.theme=theme;flushSync(()=>root.render(<App key={String(changed)+theme} changed={changed}/>))};
      window.renderCollection=async(kind='isolated',theme='dark',lang='en')=>{
        await i18n.changeLanguage(lang);useThemeStore.setState({theme});document.documentElement.dataset.theme=theme;
        const pages=Array.from({length:20},(_,i)=>({...target,slug:'page-'+String(i).padStart(2,'0'),title:i===0?'Knowledge architecture and published relationships — 知识库页面关系与审核流程的完整说明':'Wiki '+String(i).padStart(2,'0'),markdown:'Complete body '+i}));
        const relation=page=>({type:'references',target:{workspaceId:'ws',slug:page.slug,title:page.title,version:1,contentHash:'a'.repeat(64)},reason:'Published reference',sourceFactIds:[]});
        if(kind==='components')for(let i=0;i<15;i+=3)pages[i].relations=[relation(pages[i+1]),relation(pages[i+2])];
        if(kind==='dense')pages[0].relations=pages.slice(1).map(relation);
        flushSync(()=>root.render(<App key={kind+theme+lang} collection={{...snapshot,wikiPages:pages}}/>));
      };
      window.renderGraph();
    ` },
    bundle: true, write: false, outfile: 'test-bundle.js', jsx: 'automatic', format: 'iife', loader: { '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'fixture-i18n', setup(builder) { builder.onLoad({ filter: /[/\\]i18n[/\\]index\.ts$/ }, () => ({ contents: "import i18n from 'i18next';export default i18n;export const changeLanguage=()=>{}", loader: 'ts' })) } }],
  })
  script = result.outputFiles.find(file => file.path.endsWith('.js'))!.text
  css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? ''
  await mkdir('artifacts/knowledge-g1-browser', { recursive: true })
  await mkdir('artifacts/knowledge-g2-browser', { recursive: true })
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
  await page.waitForFunction(() => Array.from(document.querySelectorAll<SVGPathElement>('.react-flow__edge-path')).some(path => path.getTotalLength() > 20)).catch(async error => {
    await page.screenshot({ path: 'artifacts/knowledge-g2-browser/edge-failure.png' })
    await writeFile('artifacts/knowledge-g2-browser/edge-failure.html', await page.content())
    throw error
  })
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
  it.each(['dark', 'planche'])('keeps long titles readable locally and packs twenty isolated pages in %s at 640px', async theme => {
    const { page, errors } = await open()
    try {
      await page.setViewportSize({ width: 640, height: 800 })
      await page.evaluate(theme => (window as any).renderCollection('isolated', theme, theme === 'planche' ? 'zh-CN' : 'en'), theme)
      const card = page.locator('.react-flow__node').first()
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(1)
      await expect.poll(async () => (await card.boundingBox())?.width ?? 0).toBeGreaterThan(180)
      expect(await card.locator('strong').innerText()).toContain('知识库页面关系')
      expect(await card.locator('strong').evaluate(el => getComputedStyle(el).webkitLineClamp)).toBe('2')
      expect(await page.locator('.react-flow__edge-path').count()).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `artifacts/knowledge-g2-browser/local-640-${theme}.png` })
      await page.getByRole('button', { name: theme === 'planche' ? '全部页面' : 'All pages', exact: true }).click()
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(20)
      const coords = await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect()).map(b => ({ x: Math.round(b.x), y: Math.round(b.y) })))
      expect(new Set(coords.map(p => p.x)).size).toBeGreaterThan(1)
      expect(new Set(coords.map(p => p.y)).size).toBeGreaterThan(1)
      await page.getByRole('status').filter({ hasText: theme === 'planche' ? /20/ : '20 pages · 0 relationships' }).waitFor()
      await page.screenshot({ path: `artifacts/knowledge-g2-browser/isolated-640-${theme}.png` })
      expect(errors).toEqual([])
    } finally { await page.close() }
  })

  it('keeps selection and dragged positions stable, supports explicit focus and returns to the overview', async () => {
    const { page, errors } = await open()
    try {
      await page.evaluate(() => (window as any).renderCollection('components'))
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(3)
      await page.getByRole('button', { name: 'All pages', exact: true }).click()
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(20)
      await expect.poll(() => page.locator('.react-flow__edge-path').count()).toBe(10)
      await page.getByTitle('Wiki 01', { exact: true }).click()
      expect(await page.locator('[data-selected-record]').textContent()).toBe('Complete body 1')
      expect(await page.locator('.react-flow__node').count()).toBe(20)
      await page.getByRole('button', { name: 'Focus selected page' }).click()
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(2)
      const card = page.getByTitle('Wiki 01', { exact: true })
      await page.waitForTimeout(250)
      const viewport = await page.locator('.react-flow__viewport').getAttribute('style')
      await card.click()
      expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewport)
      const box = (await card.boundingBox())!
      await page.mouse.move(box.x + 40, box.y + 30)
      await page.mouse.down(); await page.mouse.move(box.x + 105, box.y + 65, { steps: 8 }); await page.mouse.up()
      const moved = await card.locator('..').evaluate(el => (el as HTMLElement).style.transform)
      await page.locator('.react-flow__node').first().click()
      expect(await card.locator('..').evaluate(el => (el as HTMLElement).style.transform)).toBe(moved)
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes(':v3:') && key.includes('local:')))).toBe(true)
      await page.getByRole('button', { name: 'All pages', exact: true }).click()
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(20)
      await page.getByRole('textbox', { name: 'Filter this view…' }).fill('Wiki 19')
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(1)
      await page.getByRole('status').filter({ hasText: '1 pages · 0 relationships' }).waitFor()
      await page.getByText('No relationships match the current filters.', { exact: false }).waitFor()
      await page.getByRole('textbox', { name: 'Filter this view…' }).fill('no-such-page')
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(0)
      await page.getByText('No nodes match the current filters', { exact: true }).waitFor()
      await page.getByRole('textbox', { name: 'Filter this view…' }).fill('')
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(20)
      await page.screenshot({ path: 'artifacts/knowledge-g2-browser/components-desktop.png' })
      expect(errors).toEqual([])
    } finally { await page.close() }
  })

  it('labels directed relationships and explains the local neighbor cap separately from visible counts', async () => {
    const { page, errors } = await open()
    try {
      await page.evaluate(() => (window as any).renderCollection('dense'))
      await expect.poll(() => page.locator('.react-flow__node').count()).toBe(13)
      await page.getByText('Showing 12 of 19 neighbors.', { exact: false }).waitFor()
      await page.getByRole('status').filter({ hasText: '13 pages · 12 relationships' }).waitFor()
      await page.screenshot({ path: 'artifacts/knowledge-g2-browser/local-dense-desktop.png' })
      const edges = await visiblePaths(page)
      expect(edges).toHaveLength(12)
      expect(await page.locator('.react-flow__edge-text').first().textContent()).toBe('References')
      expect(await page.locator('.react-flow__edge-path').first().getAttribute('marker-end')).toContain('url(')
      await page.getByRole('button', { name: 'All pages', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '20 pages · 19 relationships' }).waitFor()
      expect(await page.getByText('Showing 12 of 19 neighbors.', { exact: false }).count()).toBe(0)
      expect(errors).toEqual([])
    } finally { await page.close() }
  })

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
      await page.getByRole('button', { name: 'All pages', exact: true }).click()
      await page.getByTitle('Target page', { exact: true }).waitFor()
      expect(await page.getByText('Late private evidence').count()).toBe(0)
      expect(await page.locator('.react-flow__node').count()).toBe(2)
      expect(errors).toEqual([])
    } finally { await page.close() }
  })
})
