import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NoteReadSnapshot, NoteSourceRead } from '../../../../shared/notes'
import { noteDirectory, noteWikiView } from '../../../../shared/note-wiki'
import { readNoteSource } from '@/services/harness'
import { useEditorStore } from '@/stores/editor'
import { MARKDOWN_COMPONENTS } from '../viewers/markdown-components'
import { NoteWikiLinks } from '../knowledge/NoteWikiLinks'
import './note-wiki.css'

const statusLabel: Record<string, string> = { resolved: '已解析', missing: '缺失', unavailable: '未接入 / 不可读', ambiguous: '不明确', invalid: '无效' }
const errorText = (error: unknown): string => error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error)
type Props = { snapshot: NoteReadSnapshot; rootPath: string; uri?: string; anchor?: string; onNavigate: (uri: string, anchor?: string) => void; onRefresh: () => void }

// Note: the engineering wiki reads the same Note, without a page copy — see .agents/notes/2026-09-25-note-wiki-r3--844bc2f1.md
export function NoteWikiPanel({ snapshot, rootPath, uri, anchor, onNavigate, onRefresh }: Props) {
  const [tab, setTab] = useState<'body' | 'links' | 'context'>('body')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<NoteSourceRead | null>(null)
  const [error, setError] = useState('')
  const [raw, setRaw] = useState(false)
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const view = useMemo(() => noteWikiView(snapshot, uri ?? ''), [snapshot, uri])
  const directory = useMemo(() => noteDirectory(snapshot), [snapshot])
  const unavailable = snapshot.entries.filter((entry) => entry.classification !== 'valid')
  const sourceHash = view.entry?.sourceHash
  useEffect(() => {
    let active = true
    setSource(null); setError(''); setNotice(''); setRaw(false)
    if (uri) {
      void readNoteSource(rootPath, uri).then((result) => { if (active) setSource(result) })
        .catch((reason: unknown) => { if (active) setError(errorText(reason)) })
    }
    return () => { active = false }
  }, [rootPath, uri, sourceHash, reload])
  const jump = (value: string): void => {
    const target = [...(bodyRef.current?.querySelectorAll<HTMLElement>('[data-note-anchor]') ?? [])].find((node) => node.dataset.noteAnchor === value)
    if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    else setNotice('章节锚点不存在：' + value)
  }
  useEffect(() => { if (anchor && source && tab === 'body' && !raw) jump(anchor) }, [anchor, source, tab, raw])
  const open = (target: string, targetAnchor?: string): void => {
    if (!view.entries.has(target)) { setNotice('目标在当前 checkout 中不可唯一解析：' + target); return }
    setTab('body'); setRaw(false)
    if (target === uri) { if (targetAnchor) jump(targetAnchor) }
    else onNavigate(target, targetAnchor)
  }
  const link = (target: string, label?: string, targetAnchor?: string) => <button type="button" className="bp-note-link" title={target} disabled={!view.entries.has(target)} onClick={() => open(target, targetAnchor)}>{label ?? view.entries.get(target)?.doc?.title ?? target}</button>
  const headings: Components = {}
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    headings[tag] = ({ node, children }) => {
      const id = source?.view.headings.find((heading) => heading.line === node?.position?.start.line)?.anchor
      const Tag = tag
      return <Tag data-note-anchor={id}>{children}</Tag>
    }
  }
  const markdownComponents: Components = { ...MARKDOWN_COMPONENTS, ...headings,
    a: ({ href, children }) => {
      if (!href) return <span>{children}</span>
      if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
      const mention = view.mentions.find((edge) => edge.destinations.includes(href))
      const canUseSnapshot = source?.matchesSnapshot !== false
      return <button type="button" className="bp-note-link" onClick={() => {
        if (href.startsWith('#')) { try { jump(decodeURIComponent(href.slice(1))) } catch { setNotice('无效锚点') }; return }
        if (!canUseSnapshot) { setNotice('正文已变更，请刷新关系快照后定位链接'); return }
        if (mention?.targetUri && mention.resolution.status === 'resolved') open(mention.targetUri, mention.anchor)
        else setNotice((statusLabel[mention?.resolution.status ?? 'unavailable'] ?? '未解析') + '：' + href)
      }}>{children}</button>
    },
  }
  const openFile = async (path: string): Promise<void> => {
    if (/^(?:[/\\]|[A-Za-z]:)/.test(path) || path.split(/[/\\]/).includes('..') || /[*?]/.test(path)) { setNotice('此代码引用不是当前 checkout 内的单一文件'); return }
    try { await useEditorStore.getState().openFile(rootPath.replace(/[/\\]$/, '') + '/' + path, rootPath) }
    catch (reason) { setNotice(errorText(reason)) }
  }
  const current = source?.uri === uri ? source : null
  const metadata = current?.doc.metadata
  return <section className="bp-note-wiki" aria-label="工程 wiki">
    <div className="bp-note-wiki__scope"><strong>工程 wiki</strong><span>{snapshot.coverage.status === 'complete' ? '当前 checkout 完整扫描' : '扫描不完整 · 反链覆盖有限'}</span><small title={rootPath}>{rootPath}</small></div>
    <details className="bp-note-wiki__directory" open={!uri || undefined}>
      <summary>Note 目录 · {directory.length} 篇{unavailable.length ? ' · ' + unavailable.length + ' 项待处理' : ''}</summary>
      <input aria-label="查找 Note" placeholder="标题、标签或代码路径" value={query} onChange={(event) => setQuery(event.target.value)} />
      <nav aria-label="Note 目录">{directory.filter(({ entry }) => [entry.doc?.title, entry.uri, ...(entry.doc?.tags ?? []), ...(entry.doc?.metadata?.codeRefs?.map((ref) => ref.path) ?? [])].join(' ').toLowerCase().includes(query.toLowerCase())).map(({ entry, depth, warning }) => <button type="button" key={entry.uri} aria-current={entry.uri === uri ? 'page' : undefined} style={{ paddingLeft: 8 + depth * 12 }} onClick={() => open(entry.uri!)}><span>{entry.doc?.title}</span><small>{entry.doc?.kind}{warning ? ' · ' + warning : ''}</small></button>)}</nav>
      {unavailable.length > 0 && <details><summary>旧格式与诊断 ({unavailable.length})</summary>{unavailable.map((entry) => <div className="bp-note-diagnostic" key={entry.relPath}><button type="button" onClick={() => void openFile(entry.relPath)}>{entry.relPath}</button><small>{entry.classification} · {entry.diagnostics.map((d) => d.message).join('; ')}</small></div>)}</details>}
    </details>
    {uri && <>
      <div className="bp-note-wiki__identity"><code title={uri}>{uri}</code><span>{current?.relPath ?? view.entry?.relPath}</span><span>{current ? 'sha256 ' + current.sourceHash.slice(0, 12) : '读取原文…'}</span></div>
      {error && <div role="alert" className="bp-note-warning">{error}<button type="button" onClick={() => setReload((v) => v + 1)}>重试</button></div>}
      {current && !current.matchesSnapshot && <div role="status" className="bp-note-warning">源文已变化，当前显示新原文；关系仍来自旧快照。<button type="button" onClick={onRefresh}>刷新图谱</button></div>}
      {notice && <div role="status" className="bp-note-warning">{notice}<button type="button" onClick={() => setNotice('')}>关闭</button></div>}
      <div className="bp-note-wiki__tabs" role="tablist" aria-label="Note 详情">
        {(['body', 'links', 'context'] as const).map((value) => <button type="button" key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{{ body: '正文', links: '关系与反链', context: '上下文' }[value]}</button>)}
      </div>
      {tab === 'body' && current && <div ref={bodyRef}>
        <dl className="bp-note-wiki__metadata"><dt>类型 / 领域</dt><dd>{current.doc.kind} / {metadata?.class ?? '未分类'}</dd><dt>生命周期</dt><dd>{current.doc.lifecycle}</dd><dt>任务执行</dt><dd>{metadata?.execution?.state ?? '无执行记录'}</dd></dl>
        <div className="bp-note-wiki__actions"><button type="button" onClick={() => setRaw(!raw)}>{raw ? '预览' : '完整源文'}</button><button type="button" onClick={() => void navigator.clipboard.writeText(current.raw).then(() => setNotice('已复制原文')).catch((reason) => setNotice(errorText(reason)))}>复制原文</button></div>
        {raw ? <pre className="bp-note-source">{current.raw}</pre> : <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url) => url.startsWith('note://') ? url : defaultUrlTransform(url)} components={markdownComponents}>{current.doc.body ?? ''}</ReactMarkdown></div>}
        {!!metadata?.codeRefs?.length && <div className="bp-note-wiki__group"><h4>代码落点</h4>{metadata.codeRefs.map((ref, index) => <div key={index}><button type="button" disabled={ref.repoId !== snapshot.repoId} onClick={() => void openFile(ref.path)}>{ref.path}</button><small>{ref.repoId === snapshot.repoId ? ref.role : '外部仓库 · ' + ref.repoId}</small></div>)}</div>}
        <details><summary>完整正式字段</summary><pre className="bp-note-source">{JSON.stringify({ ...metadata, ...(Object.keys(current.doc.unknownFields ?? {}).length ? { unknownFields: current.doc.unknownFields } : {}) }, null, 2)}</pre></details>
      </div>}
      {tab === 'links' && <div className="bp-note-wiki__group">
        <h4>正式关系 · 发出 {view.outgoing.length} / 指向本篇 {view.backlinks.length}</h4>
        {[...view.outgoing.map((edge) => ({ edge, incoming: false })), ...view.backlinks.map((edge) => ({ edge, incoming: true }))].map(({ edge, incoming }, index) => <div className="bp-note-relation" key={index}><span>{incoming ? '←' : '→'} {edge.type}</span>{link(incoming ? edge.sourceUri : edge.targetUri)}<small>{statusLabel[edge.resolution.status]}{edge.criteria?.length ? ' · ' + edge.criteria.join(', ') : ''}{edge.scope ? ' · ' + edge.scope : ''}{edge.reason ? ' · ' + edge.reason : ''}</small></div>)}
        <h4>正文提及 · 不计为工程依赖</h4>
        {[...view.mentions.map((edge) => ({ edge, incoming: false })), ...view.mentionedBy.map((edge) => ({ edge, incoming: true }))].map(({ edge, incoming }, index) => <div className="bp-note-relation" key={index}><span>{incoming ? '← 引用本篇' : '→ 提及'}</span>{edge.targetUri ? link(incoming ? edge.sourceUri : edge.targetUri, undefined, incoming ? undefined : edge.anchor) : <span>{edge.destinations.join(', ')}</span>}<small>{statusLabel[edge.resolution.status]}{edge.resolution.anchorStatus ? ' · 章节 ' + statusLabel[edge.resolution.anchorStatus] : ''}</small></div>)}
        {!view.outgoing.length && !view.backlinks.length && !view.mentions.length && !view.mentionedBy.length && <p>当前扫描范围内没有引用。</p>}
        <NoteWikiLinks rootPath={rootPath} uri={uri} onOpenNote={open} />
      </div>}
      {tab === 'context' && <div className="bp-note-wiki__group"><p>本篇、一跳邻居与祖先 · {view.context.length} 篇{view.truncated ? ' · 已截断' : ''}{view.unavailable.length ? ' · ' + view.unavailable.length + ' 个目标不可读' : ''}</p><button type="button" onClick={() => void navigator.clipboard.writeText(view.context.map((entry) => entry.uri + '\nsha256 ' + entry.sourceHash + '\n' + entry.text).join('\n\n')).then(() => setNotice('已复制有界上下文')).catch((reason) => setNotice(errorText(reason)))}>复制上下文</button>{view.context.map((entry) => <details key={entry.uri}><summary>{entry.title}</summary><small>{entry.uri}</small><pre className="bp-note-source">{entry.text}</pre></details>)}</div>}
    </>}
    {snapshot.diagnostics.length > 0 && <details className="bp-note-wiki__group"><summary>索引诊断 · {snapshot.diagnostics.length}</summary>{snapshot.diagnostics.map((d, index) => <p key={index}>{d.path}: {d.message}</p>)}</details>}
  </section>
}
