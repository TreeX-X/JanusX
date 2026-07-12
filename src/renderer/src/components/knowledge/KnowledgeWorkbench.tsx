import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  applyKnowledgeCandidate,
  loadKnowledgeWorkbenchSnapshot,
  rejectKnowledgeCandidate,
  searchKnowledgeCards,
  type KnowledgeReviewCandidateType,
  type KnowledgeWorkbenchSnapshot,
} from '../../services/knowledge'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateStatus,
  CandidateWikiPatch,
  KnowledgeCard,
} from '../../../../shared/knowledge'
import styles from './KnowledgeWorkbench.module.css'

export type KnowledgeWorkbenchTab = 'inbox' | 'library' | 'wiki' | 'graph' | 'search' | 'audit'
type Candidate = CandidateFact | CandidateWikiPatch | CandidateGraphEdge

interface Props {
  isOpen: boolean
  onClose: () => void
}

export interface InspectorRecord {
  id: string
  title: string
  body: string
  confidence?: number
  tags: string[]
  sourceIds: string[]
  fileRefs: string[]
  createdAt?: string
  status?: CandidateStatus | 'active'
  reviewType?: KnowledgeReviewCandidateType
}

const LABELS: Record<KnowledgeWorkbenchTab, string> = {
  inbox: 'Inbox',
  library: 'Library',
  wiki: 'Wiki',
  graph: 'Graph',
  search: 'Search Lab',
  audit: 'Audit',
}

export function KnowledgeWorkbench({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<KnowledgeWorkbenchTab>('inbox')
  const [snapshot, setSnapshot] = useState<KnowledgeWorkbenchSnapshot | null>(null)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [selectedSearch, setSelectedSearch] = useState<InspectorRecord | null>(null)
  const [query, setQuery] = useState('')
  const [searchCards, setSearchCards] = useState<KnowledgeCard[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'unavailable'>('idle')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const refresh = async () => {
    setSelectedSearch(null)
    setLoadState('loading')
    setLoadError('')
    try {
      const next = await loadKnowledgeWorkbenchSnapshot()
      setSnapshot(next)
      setSelectedId((current) => selectionIdForTab(next, tab, current))
      setLoadState('idle')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Knowledge workbench load failed')
      setLoadState('error')
    }
  }

  useEffect(() => {
    if (isOpen) void refresh()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || tab !== 'search') return
    const term = query.trim()
    setSelectedSearch(null)
    if (!term) {
      setSearchCards([])
      setSearchState('idle')
      return
    }

    let cancelled = false
    setSearchState('loading')
    setSearchCards([])
    searchKnowledgeCards({ query: term, limit: 12 })
      .then((cards) => {
        if (cancelled) return
        setSearchCards(cards)
        setSearchState('idle')
      })
      .catch(() => {
        if (cancelled) return
        setSelectedSearch(null)
        setSearchCards([])
        setSearchState('unavailable')
      })
    return () => { cancelled = true }
  }, [isOpen, query, tab])

  const selected = useMemo(
    () => tab === 'search' || tab === 'audit'
      ? selectedSearch
      : snapshot ? resolveRecordForTab(snapshot, tab, selectedId) : null,
    [selectedId, selectedSearch, snapshot, tab],
  )

  const activateTab = (nextTab: KnowledgeWorkbenchTab) => {
    setTab(nextTab)
    setSelectedSearch(null)
    if (snapshot) {
      setSelectedId((current) => selectionIdForTab(snapshot, nextTab, current))
    }
  }

  const selectCandidate = (id: string) => {
    setSelectedSearch(null)
    setSelectedId(id)
  }

  const review = async (action: 'apply' | 'reject') => {
    if (!selected?.reviewType || selected.status !== 'proposed' || snapshot?.usingDemoData) return
    setReviewBusy(true)
    setReviewError('')
    try {
      const input = { id: selected.id, type: selected.reviewType }
      if (action === 'apply') await applyKnowledgeCandidate(input)
      else await rejectKnowledgeCandidate(input)
      await refresh()
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : `${action} failed`)
    } finally {
      setReviewBusy(false)
    }
  }

  if (!isOpen) return null

  const sidebarCards = snapshot ? cardsForTab(snapshot, tab) : []
  const paneTitle = tab === 'inbox' ? 'Proposed Candidates' : tab === 'library' ? 'Knowledge Library' : LABELS[tab]

  return createPortal(
    <div className={styles.backdrop}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBadge} aria-hidden="true">K</div>
            <nav className={styles.breadcrumb} aria-label="Breadcrumb"><span className={styles.bcParent}>JanusX</span><span className={styles.bcSep}>/</span><span className={styles.bcCurrent}>Knowledge Engine</span></nav>
            {snapshot?.usingDemoData && <span className={styles.badge}>DEMO DATA</span>}
          </div>
          <nav className={styles.tabs}>
            {(Object.keys(LABELS) as KnowledgeWorkbenchTab[]).map((item) => <button key={item} type="button" className={`${styles.tabButton} ${tab === item ? styles.tabActive : ''}`} onClick={() => activateTab(item)}>{LABELS[item]}</button>)}
          </nav>
          <div className={styles.headerActions}>
            <button type="button" className={styles.iconButton} onClick={() => void refresh()} title="Refresh">R</button>
            <button type="button" className={styles.closeButton} onClick={onClose} title="Close" aria-label="Close Knowledge Engine"><span aria-hidden="true" /></button>
          </div>
        </header>
        <main className={styles.grid}>
          <aside className={styles.leftPane}>
            <div className={styles.paneTitle}>{paneTitle}</div>
            {(tab === 'inbox' || tab === 'library') ? <CardList cards={sidebarCards} selectedId={selectedId} onSelect={selectCandidate} /> : <StateBlock title="Use the active view to browse these records" compact />}
          </aside>
          <section className={styles.stage}>
            {loadState === 'loading' && <StateBlock title="Loading knowledge records" />}
            {loadState === 'error' && <StateBlock title="Workbench unavailable" detail={loadError} />}
            {loadState === 'idle' && snapshot && <>
              {tab === 'inbox' && <CardCollection title="No proposed candidates" detail="Run extraction after a task to populate the review queue." cards={candidatesForTab(snapshot, 'inbox').map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'library' && <CardCollection title="Library is empty" detail="Accepted knowledge will appear here after review." cards={snapshot.libraryCards} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'search' && <SearchLab query={query} onQueryChange={setQuery} cards={searchCards} state={searchState} selectedId={selectedId} onSelect={(card) => { setSelectedSearch(recordFromCard(card)); setSelectedId(card.id) }} />}
              {tab === 'wiki' && <CardCollection title="No wiki patches" detail="Extraction has not proposed any wiki changes." cards={snapshot.wikiPatches.map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'graph' && <CardCollection title="No graph candidates" detail="Extraction has not proposed any graph relationships." cards={snapshot.graphCandidates.map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'audit' && <AuditList events={snapshot.auditEvents} selectedId={selectedId} onSelect={(record) => { setSelectedSearch(record); setSelectedId(record.id) }} />}
            </>}
          </section>
          <aside className={styles.rightPane}><Inspector record={selected} snapshot={snapshot} busy={reviewBusy} error={reviewError} onApprove={() => void review('apply')} onReject={() => void review('reject')} /></aside>
        </main>
      </section>
    </div>,
    document.body,
  )
}

function candidatesForTab(snapshot: KnowledgeWorkbenchSnapshot, tab: KnowledgeWorkbenchTab): Candidate[] {
  const candidates: Candidate[] = [...snapshot.factCandidates, ...snapshot.wikiPatches, ...snapshot.graphCandidates]
  return tab === 'inbox' ? candidates.filter((candidate) => candidate.status === 'proposed') : []
}

function cardsForTab(snapshot: KnowledgeWorkbenchSnapshot, tab: KnowledgeWorkbenchTab): KnowledgeCard[] {
  return tab === 'library'
    ? snapshot.libraryCards
    : candidatesForTab(snapshot, tab).map(cardFromCandidate)
}

export function resolveRecordForTab(
  snapshot: KnowledgeWorkbenchSnapshot,
  tab: KnowledgeWorkbenchTab,
  id: string,
): InspectorRecord | null {
  if (tab === 'library') {
    const card = snapshot.libraryCards.find((item) => item.id === id)
    return card ? recordFromCard(card) : null
  }

  const candidates: Candidate[] = tab === 'inbox'
    ? candidatesForTab(snapshot, tab)
    : tab === 'wiki'
      ? snapshot.wikiPatches
      : tab === 'graph'
        ? snapshot.graphCandidates
        : []
  return recordFromCandidate(candidates.find((candidate) => candidate.id === id) ?? null)
}

export function selectionIdForTab(
  snapshot: KnowledgeWorkbenchSnapshot,
  tab: KnowledgeWorkbenchTab,
  currentId: string,
): string {
  if (resolveRecordForTab(snapshot, tab, currentId)) return currentId
  if (tab === 'library') return snapshot.libraryCards[0]?.id ?? ''
  if (tab === 'inbox') return candidatesForTab(snapshot, tab)[0]?.id ?? ''
  if (tab === 'wiki') return snapshot.wikiPatches[0]?.id ?? ''
  if (tab === 'graph') return snapshot.graphCandidates[0]?.id ?? ''
  return ''
}

function CardList({ cards, selectedId, onSelect }: { cards: KnowledgeCard[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!cards.length) return <StateBlock title="No knowledge in this view" compact />
  return <div className={styles.recordList}>{cards.map((card) => <button key={card.id} type="button" className={`${styles.recordButton} ${selectedId === card.id ? styles.recordActive : ''}`} onClick={() => onSelect(card.id)}><span className={styles.recordTitle}>{card.title}</span><span className={styles.recordMeta}>{card.kind} - {card.status ?? 'accepted'}</span></button>)}</div>
}

function CardCollection({ title, detail, cards, selectedId, onSelect }: { title: string; detail: string; cards: KnowledgeCard[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!cards.length) return <StateBlock title={title} detail={detail} />
  return <div className={styles.cardGrid}>{cards.map((card) => <KnowledgeCardTile key={card.id} card={card} active={card.id === selectedId} onSelect={() => onSelect(card.id)} />)}</div>
}

function AuditList({ events, selectedId, onSelect }: { events: KnowledgeWorkbenchSnapshot['auditEvents']; selectedId: string; onSelect: (record: InspectorRecord) => void }) {
  if (!events.length) return <StateBlock title="No audit events" detail="Governance actions will appear here when they occur." />
  return <div className={styles.timeline}>{events.map((event) => <button key={event.id} type="button" className={styles.auditEvent} onClick={() => onSelect({ id: event.id, title: event.action, body: `${event.targetType}:${event.targetId}`, tags: [event.targetType], sourceIds: event.provenance.sourceObservationIds, fileRefs: event.provenance.fileRefs, createdAt: event.provenance.createdAt })}><span className={styles.auditDot} /><span><strong>{event.action}</strong><small>{event.targetType} - {event.targetId}</small></span><time>{formatDate(event.provenance.createdAt)}</time></button>)}</div>
}

function SearchLab({ query, onQueryChange, cards, state, selectedId, onSelect }: { query: string; onQueryChange: (value: string) => void; cards: KnowledgeCard[]; state: 'idle' | 'loading' | 'unavailable'; selectedId: string; onSelect: (card: KnowledgeCard) => void }) {
  return <div className={styles.searchLab}><div className={styles.searchPanel}><div className={styles.cardTopline}><span>CONTROLLED RECALL</span><span>BM25</span></div><input className={styles.largeInput} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search facts, wiki patches, observations..." /></div><div className={styles.searchResults}>{!query.trim() && <StateBlock title="Enter a query to search the knowledge index" compact />}{query.trim() && state === 'loading' && <StateBlock title="Searching the knowledge index" compact />}{query.trim() && state === 'unavailable' && <StateBlock title="Knowledge search unavailable" detail="No local preview is shown when the index cannot be reached." compact />}{query.trim() && state === 'idle' && !cards.length && <StateBlock title="No matching knowledge cards" detail="Try a broader term or capture more knowledge first." compact />}{cards.map((card) => <KnowledgeCardTile key={card.id} card={card} active={card.id === selectedId} onSelect={() => onSelect(card)} />)}</div></div>
}

function KnowledgeCardTile({ card, active, onSelect }: { card: KnowledgeCard; active?: boolean; onSelect: () => void }) {
  return <button type="button" className={`${styles.reviewCard} ${active ? styles.reviewCardActive : ''}`} onClick={onSelect}><div className={styles.cardTopline}><span>{card.kind.toUpperCase()}</span><span>{formatConfidence(card.score)}</span></div><strong>{card.title}</strong>{card.summary && <p>{card.summary}</p>}<TagRow tags={card.tags} /><div className={styles.cardFoot}>{card.status ?? 'active'} - {card.sourceRefs.observationIds.length} source refs</div></button>
}

function Inspector({ record, snapshot, busy, error, onApprove, onReject }: { record: InspectorRecord | null; snapshot: KnowledgeWorkbenchSnapshot | null; busy: boolean; error: string; onApprove: () => void; onReject: () => void }) {
  if (!record) return <StateBlock title="Select a knowledge record" compact />
  const canReview = Boolean(record.reviewType) && record.status === 'proposed' && !snapshot?.usingDemoData && !busy
  return <div className={styles.inspector}><div className={styles.paneTitle}>Provenance</div><div className={styles.inspectorTitle}>{record.title}</div><p>{record.body}</p>{record.confidence !== undefined && <Metric label="Confidence" value={formatConfidence(record.confidence)} />}{record.status && <KeyValue label="Status" value={record.status} />}<TagRow tags={record.tags} /><KeyValue label="Created" value={formatDate(record.createdAt)} /><KeyValue label="Source Refs" value={record.sourceIds.join(', ') || 'none'} /><KeyValue label="Files" value={record.fileRefs.join(', ') || 'none'} /><div className={styles.actionRow}><button type="button" disabled={!canReview} onClick={onApprove}>{busy ? 'Working...' : 'Approve'}</button><button type="button" disabled={!canReview} onClick={onReject}>Reject</button></div>{error && <div className={styles.demoNotice}>{error}</div>}{snapshot?.usingDemoData && <div className={styles.demoNotice}>Demo fallback is read-only. Capture or extract real knowledge records to enable review.</div>}</div>
}

function cardFromCandidate(candidate: Candidate): KnowledgeCard {
  if (candidate.type === 'fact') return { id: candidate.id, kind: 'fact', title: candidate.fact.content, summary: candidate.fact.concepts.join(' - '), score: candidate.fact.confidence, tags: candidate.fact.tags, workspaceId: candidate.fact.provenance.workspaceId, workspacePath: candidate.fact.provenance.workspacePath, sourceRefs: { observationIds: candidate.fact.provenance.sourceObservationIds, fileRefs: candidate.fact.provenance.fileRefs }, createdAt: candidate.fact.provenance.createdAt, status: candidate.status, rawType: 'fact-candidate' }
  if (candidate.type === 'wiki-patch') return { id: candidate.id, kind: 'wiki', title: candidate.title, summary: candidate.rationale, score: candidate.confidence, tags: [candidate.pageSlug], workspaceId: candidate.provenance.workspaceId, workspacePath: candidate.provenance.workspacePath, sourceRefs: { observationIds: candidate.provenance.sourceObservationIds, fileRefs: candidate.provenance.fileRefs }, createdAt: candidate.provenance.createdAt, status: candidate.status, rawType: 'wiki-patch' }
  return { id: candidate.id, kind: 'graph', title: `${candidate.edge.from} -> ${candidate.edge.to}`, summary: candidate.edge.type, score: candidate.edge.confidence, tags: [candidate.edge.type], workspaceId: candidate.edge.workspaceId, sourceRefs: { observationIds: candidate.edge.sourceFactIds, fileRefs: [] }, createdAt: candidate.edge.createdAt, status: candidate.status, rawType: 'graph-candidate' }
}

function recordFromCandidate(candidate: Candidate | null): InspectorRecord | null {
  return candidate ? recordFromCard(cardFromCandidate(candidate), candidate.type === 'fact' ? 'fact' : candidate.type === 'wiki-patch' ? 'wiki-patch' : 'graph-edge') : null
}

function recordFromCard(card: KnowledgeCard, reviewType?: KnowledgeReviewCandidateType): InspectorRecord {
  return { id: card.id, title: card.title, body: card.summary, confidence: card.score, tags: card.tags, sourceIds: card.sourceRefs.observationIds, fileRefs: card.sourceRefs.fileRefs, createdAt: card.createdAt, status: card.status, reviewType }
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className={styles.metric}><strong>{value}</strong><span>{label}</span></div> }
function KeyValue({ label, value }: { label: string; value: string }) { return <div className={styles.keyValue}><span>{label}</span><strong>{value}</strong></div> }
function TagRow({ tags }: { tags: string[] }) { return tags.length ? <div className={styles.tags}>{tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div> : null }
function StateBlock({ title, detail, compact }: { title: string; detail?: string; compact?: boolean }) { return <div className={`${styles.stateBlock} ${compact ? styles.stateBlockCompact : ''}`}><strong>{title}</strong>{detail && <span>{detail}</span>}</div> }
function formatConfidence(value: number) { return `${Math.round(value * 100)}%` }
function formatDate(value?: string) { if (!value) return 'unknown'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString() }
