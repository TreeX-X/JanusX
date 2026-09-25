import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NoteWikiPanel } from '../../../src/renderer/src/components/blueprint/NoteWikiPanel'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import type { NoteReadSnapshot, NoteSourceRead } from '../../../src/shared/notes'
import { useEditorStore } from '../../../src/renderer/src/stores/editor'

installElectronApiFallback()
const nl = String.fromCharCode(10)
const repo = '972afef3-2fc7-49de-a3ee-7e041225d28c'
const uri = (id: string) => 'note://' + repo + '/' + id
const a = uri('00000000-0000-4000-8000-000000000001')
const b = uri('00000000-0000-4000-8000-000000000002')
const docs = [{ id: a.split('/').at(-1)!, title: 'Parent', body: ['# Parent','','## Goal','','Parent source content.','','[Child](child.md#goal)'].join(nl), relPath: '.agents/notes/parent.md' }, { id: b.split('/').at(-1)!, title: 'Child', body: ['# Child','','## Goal','','Child source content.','','[Parent](parent.md#goal)'].join(nl), relPath: '.agents/notes/child.md' }]
const sources: NoteSourceRead[] = docs.map((doc, i) => ({ uri: uri(doc.id), relPath: doc.relPath, raw: ['---','schema: harness-note/1','---',doc.body].join(nl), sourceHash: (i ? 'b' : 'a').repeat(64), indexedSourceHash: (i ? 'b' : 'a').repeat(64), matchesSnapshot: true, doc: { ...doc, kind: 'initiative', lifecycle: 'accepted', tags: [], parent: i ? a : null, sections: [], acs: [], relations: [], metadata: { schema: 'harness-note/1', id: doc.id, kind: 'initiative', lifecycle: 'accepted', created: '2026-09-25', codeRefs: [{ repoId: repo, path: 'src/wiki.ts', role: 'entry' }] } }, view: { excerpt: doc.title, headings: [{ depth: 1, text: doc.title, anchor: doc.title.toLowerCase(), line: 1 }, { depth: 2, text: 'Goal', anchor: 'goal', line: 3 }], links: [] } }))
const snapshot: NoteReadSnapshot = { repoId: repo, coverage: { checkoutRoot: 'C:/fixture/wiki', status: 'complete', snapshotHash: 'snapshot', diagnostics: [] }, entries: sources.map(s => ({ uri: s.uri, relPath: s.relPath, sourceHash: s.sourceHash, doc: s.doc, view: s.view, classification: 'valid', diagnostics: [] })), relations: [{ sourceUri: b, targetUri: a, type: 'parent', declarations: [], resolution: { status: 'resolved', diagnostics: [] } }], mentions: [{ sourceUri: b, targetUri: a, anchor: 'goal', destinations: ['parent.md#goal'], occurrences: [], resolution: { status: 'resolved', anchorStatus: 'resolved', diagnostics: [] } }, { sourceUri: a, targetUri: b, anchor: 'goal', destinations: ['child.md#goal'], occurrences: [], resolution: { status: 'resolved', anchorStatus: 'resolved', diagnostics: [] } }], diagnostics: [] }
const fixture = { selected: '', failNext: false, stale: false, reads: [] as string[], gated: false, release: null as null | (() => void), openedFiles: [] as string[] }
;(window as any).wikiFixture = fixture
Object.assign(window.electron.harness, { noteRead: async (_root: string, target: string) => {
  fixture.reads.push(target)
  if (fixture.failNext) { fixture.failNext = false; throw new Error('source unavailable') }
  if (fixture.gated) { fixture.gated = false; await new Promise<void>(resolve => { fixture.release = resolve }) }
  const found = sources.find(s => s.uri === target)
  if (!found) throw new Error('missing')
  return { ...found, matchesSnapshot: !fixture.stale }
} })
Object.assign(window.electron.knowledge, { noteWikiPages: async () => [], noteWikiStatuses: async () => [{ uri: '', status: 'unknown', detail: 'Source not recorded' }] })
useEditorStore.setState({ openFile: async (path) => { fixture.openedFiles.push(path) } })
function Harness() {
  const [selected, setSelected] = useState(a)
  const [anchor, setAnchor] = useState<string>()
  const [rev, setRev] = useState(0)
  const navigate = (target: string, value?: string) => { fixture.selected = target; setSelected(target); setAnchor(value) }
  return <main style={{ maxWidth: 520, padding: 16 }}><div><button onClick={() => navigate(a)}>Select parent</button><button onClick={() => navigate(b)}>Select child</button></div><NoteWikiPanel key={rev} snapshot={snapshot} rootPath="C:/fixture/wiki" uri={selected} anchor={anchor} onNavigate={navigate} onRefresh={() => { fixture.stale = false; setRev(rev + 1) }} /></main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
