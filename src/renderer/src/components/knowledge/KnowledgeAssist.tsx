import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { KnowledgeContextItem, KnowledgeContextResult } from '../../../../shared/knowledge'
import { getKnowledgeContext } from '../../services/knowledge'
import { useAppStore } from '../../stores/app'
import { AssistRequestGate, createAssistRequest } from './KnowledgeAssistState'
import styles from './KnowledgeAssist.module.css'

interface Props {
  workspaceId: string | null
  workspacePath: string | null
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type CopyState = 'idle' | 'copied' | 'failed'

/* "Open Knowledge Workbench" in Chinese */
const OPEN_WORKBENCH_TITLE = '\u6253\u5F00\u77E5\u8BC6\u5E93\u5DE5\u4F5C\u53F0'

export function KnowledgeAssist({ workspaceId, workspacePath }: Props) {
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<KnowledgeContextResult | null>(null)
  const [selectedKey, setSelectedKey] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const requestGate = useRef(new AssistRequestGate())
  const workspaceKey = JSON.stringify([workspaceId, workspacePath])
  const workspaceKeyRef = useRef(workspaceKey)
  workspaceKeyRef.current = workspaceKey

  useEffect(() => {
    requestGate.current.invalidate()
    setQuery('')
    setResult(null)
    setSelectedKey('')
    setLoadState('idle')
    setError('')
    setCopyState('idle')
  }, [workspaceId, workspacePath])

  const search = async (event: FormEvent) => {
    event.preventDefault()
    const request = createAssistRequest(query, workspaceId, workspacePath)
    if (!request) return
    const version = requestGate.current.begin()
    const requestWorkspaceKey = workspaceKey
    setLoadState('loading')
    setResult(null)
    setSelectedKey('')
    setError('')
    setCopyState('idle')
    try {
      const next = await getKnowledgeContext(request)
      if (!requestGate.current.isCurrent(version) || requestWorkspaceKey !== workspaceKeyRef.current) return
      setResult(next)
      setSelectedKey(next.items[0] ? itemKey(next.items[0]) : '')
      setLoadState('ready')
    } catch (reason) {
      if (!requestGate.current.isCurrent(version) || requestWorkspaceKey !== workspaceKeyRef.current) return
      setError(reason instanceof Error ? reason.message : 'Knowledge recall failed')
      setLoadState('error')
    }
  }

  const copyContext = async () => {
    if (!result?.compactContext) return
    try {
      await navigator.clipboard.writeText(result.compactContext)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const selected = result?.items.find((item) => itemKey(item) === selectedKey) ?? null
  const hasWorkspace = Boolean(workspaceId || workspacePath)

  return (
    <section className={styles.root} aria-label="Knowledge Assist">
      <form className={styles.searchForm} onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} className={styles.searchInput} placeholder={hasWorkspace ? 'Recall accepted knowledge' : 'Select a workspace'} disabled={!hasWorkspace || loadState === 'loading'} aria-label="Knowledge query" />
        <button type="submit" className={styles.searchButton} disabled={!hasWorkspace || !query.trim() || loadState === 'loading'}>{loadState === 'loading' ? 'Wait' : 'Search'}</button>
        <button type="button" className={styles.workbenchLink} title={OPEN_WORKBENCH_TITLE} aria-label={OPEN_WORKBENCH_TITLE} onClick={() => setActiveWorkbench('knowledge')}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 3.25H3.75c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h8c.55 0 1-.45 1-1V9.5" />
            <path d="M9.75 2.75h3.5v3.5M13 3 8.25 7.75" />
          </svg>
        </button>
      </form>

      <div className={styles.body}>
        {!hasWorkspace && <StateLine title="No workspace" detail="Assist is scoped to the active workspace." />}
        {hasWorkspace && loadState === 'idle' && <StateLine title="Ready" detail="Search accepted facts, wiki pages, and graph relations." />}
        {loadState === 'loading' && <StateLine title="Searching" detail="Ranking accepted workspace knowledge." />}
        {loadState === 'error' && <StateLine title="Recall unavailable" detail={error} tone="error" />}
        {loadState === 'ready' && result && <>
          <ResultMeta result={result} />
          {result.degraded && <StateLine title="Recall degraded" detail={result.degraded.reason} tone="error" compact />}
          {!result.items.length && !result.degraded && <StateLine title="No matches" detail="No accepted knowledge matched this query." compact />}
          {result.items.length > 0 && <div className={styles.results} aria-label="Knowledge results">{result.items.map((item) => <ResultRow key={itemKey(item)} item={item} selected={itemKey(item) === selectedKey} onSelect={() => setSelectedKey(itemKey(item))} />)}</div>}
          {selected && <SelectedDetail item={selected} />}
        </>}
      </div>

      <footer className={styles.footer}>
        <span className={copyState === 'failed' ? styles.copyError : styles.copyStatus} aria-live="polite">{copyState === 'copied' ? 'Context copied' : copyState === 'failed' ? 'Copy failed' : result?.truncated ? 'Bounded result' : ''}</span>
        <button type="button" className={styles.copyButton} disabled={!result?.compactContext} onClick={() => void copyContext()}>Copy context</button>
      </footer>
    </section>
  )
}

function ResultMeta({ result }: { result: KnowledgeContextResult }) {
  return <div className={styles.resultMeta}><span>{result.items.length} of {result.eligibleCount}</span><span>{result.compactContext.length}/{result.maxChars} chars</span>{result.truncated && <strong>truncated</strong>}</div>
}

function ResultRow({ item, selected, onSelect }: { item: KnowledgeContextItem; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={`${styles.resultRow} ${selected ? styles.resultRowSelected : ''}`} onClick={onSelect}><span className={styles.rowTop}><b>{item.kind}</b><code>{item.score.toFixed(2)}</code></span><strong className={styles.rowTitle}>{item.title}</strong><span className={styles.rowContent}>{item.content}</span><span className={styles.rowSource}>{sourceSummary(item)}</span></button>
}

function SelectedDetail({ item }: { item: KnowledgeContextItem }) {
  const refs = [...item.provenance.observationIds.map((id) => `obs:${id}`), ...item.provenance.factIds.map((id) => `fact:${id}`), ...item.provenance.fileRefs]
  return <div className={styles.detail} aria-label="Selected knowledge detail"><div className={styles.detailHeader}><span>Selected</span><code>{item.workspaceId}</code></div><strong>{item.title}</strong><p>{item.content}</p><dl><div><dt>Refs</dt><dd>{refs.join(' · ') || 'none'}</dd></div><div><dt>Source</dt><dd>{[item.provenance.source, item.provenance.actor].filter(Boolean).join(' · ') || 'accepted truth'}</dd></div><div><dt>Updated</dt><dd>{formatDate(item.provenance.createdAt)}</dd></div></dl></div>
}

function StateLine({ title, detail, tone, compact }: { title: string; detail: string; tone?: 'error'; compact?: boolean }) {
  return <div className={`${styles.state} ${compact ? styles.stateCompact : ''} ${tone === 'error' ? styles.stateError : ''}`}><strong>{title}</strong><span>{detail}</span></div>
}

function sourceSummary(item: KnowledgeContextItem): string {
  return item.provenance.fileRefs[0] ?? (item.provenance.observationIds[0] ? `obs:${item.provenance.observationIds[0]}` : item.provenance.factIds[0] ? `fact:${item.provenance.factIds[0]}` : item.workspaceId)
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function itemKey(item: KnowledgeContextItem): string {
  return JSON.stringify([item.workspaceId, item.kind, item.id])
}
