import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  applyKnowledgeCandidate,
  loadKnowledgeWorkbenchSnapshot,
  rejectKnowledgeCandidate,
  revokeKnowledgeTruth,
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
import { RefreshIconButton } from '../ui/RefreshIconButton'
import { QuantumTopologyPreview } from '../ui/QuantumTopologyPreview'
import { WorkbenchIcon } from '../ui/WorkbenchIcon'
import { useI18n } from '@/i18n/useI18n'
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
  status?: CandidateStatus | 'active' | 'archived'
  reviewType?: KnowledgeReviewCandidateType
  kind?: KnowledgeCard['kind']
  workspaceId?: string
}

export function KnowledgeWorkbench({ isOpen, onClose }: Props) {
  const { t } = useI18n('knowledge')
  const TAB_LABELS: Record<KnowledgeWorkbenchTab, string> = {
    inbox: t('knowledge:tab.inbox'),
    library: t('knowledge:tab.library'),
    wiki: t('knowledge:tab.wiki'),
    graph: t('knowledge:tab.graph'),
    search: t('knowledge:tab.search'),
    audit: t('knowledge:tab.audit'),
  }
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

  // Delayed unmount: keep portal alive during exit animation
  const [rendered, setRendered] = useState(isOpen)
  const closingRef = useRef(false)
  useEffect(() => {
    if (isOpen) {
      closingRef.current = false
      setRendered(true)
      return
    }
    if (!rendered) return
    closingRef.current = true
    const timer = setTimeout(() => {
      closingRef.current = false
      setRendered(false)
    }, 320)
    return () => clearTimeout(timer)
  }, [isOpen, rendered])

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
      setLoadError(error instanceof Error ? error.message : t('knowledge:error.loadFailed'))
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
      setReviewError(error instanceof Error ? error.message : t('knowledge:error.actionFailed', { action }))
    } finally {
      setReviewBusy(false)
    }
  }

  const revoke = async () => {
    if (!selected?.workspaceId || !selected.kind || selected.kind === 'observation') return
    setReviewBusy(true)
    setReviewError('')
    try {
      await revokeKnowledgeTruth({ kind: selected.kind, id: selected.id, workspaceId: selected.workspaceId })
      await refresh()
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : t('knowledge:error.revokeFailed'))
    } finally { setReviewBusy(false) }
  }

  if (!rendered) return null
  const isClosing = closingRef.current

  const sidebarCards = snapshot ? cardsForTab(snapshot, tab) : []
  const paneTitle = tab === 'inbox' ? t('knowledge:paneTitle.inbox') : tab === 'library' ? t('knowledge:paneTitle.library') : TAB_LABELS[tab]
  const paneCount = {
    inbox: sidebarCards.length,
    library: sidebarCards.length,
    wiki: snapshot?.wikiPatches.length ?? 0,
    graph: snapshot?.graphCandidates.length ?? 0,
    search: searchCards.length,
    audit: snapshot?.auditEvents.length ?? 0,
  }[tab]

  return createPortal(
    <div className={styles.backdrop} data-closing={isClosing ? "true" : undefined}>
      <section className={styles.shell} data-closing={isClosing ? "true" : undefined} aria-label={t('knowledge:aria.engine')}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.iconBadge} aria-hidden="true">
              <WorkbenchIcon id="knowledge" />
            </span>
            <nav className={styles.breadcrumb} aria-label="Breadcrumb"><span className={styles.bcCurrent}>{t('knowledge:breadcrumb.engine')}</span></nav>
            {snapshot?.usingDemoData && <span className={styles.badge}>{t('knowledge:badge.demoData')}</span>}
          </div>
          <nav className={styles.tabs}>
            {(Object.keys(TAB_LABELS) as KnowledgeWorkbenchTab[]).map((item) => <button key={item} type="button" className={`${styles.tabButton} ${tab === item ? styles.tabActive : ''}`} onClick={() => activateTab(item)}>{TAB_LABELS[item]}</button>)}
          </nav>
          <div className={styles.headerActions}>
            <RefreshIconButton
              accent="blue"
              label={t('knowledge:action.refresh')}
              loading={loadState === 'loading'}
              onClick={() => void refresh()}
            />
            <button type="button" className={styles.closeButton} onClick={onClose} title={t('knowledge:action.close')} aria-label={t('knowledge:aria.close')}><span aria-hidden="true" /></button>
          </div>
        </header>
        <main className={styles.grid}>
          <aside className={styles.leftPane}>
            <div className={styles.paneHeader}>
              <div className={styles.paneTitle}>{paneTitle}</div>
              <span className={styles.paneCount} aria-label={t('knowledge:aria.paneCount', { title: paneTitle })}>{paneCount}</span>
            </div>
            {(tab === 'inbox' || tab === 'library') ? <CardList cards={sidebarCards} selectedId={selectedId} onSelect={selectCandidate} /> : <StateBlock title={t('knowledge:state2.useActiveView')} compact />}
          </aside>
          <section className={styles.stage}>
            {loadState === 'loading' && <StateBlock title={t('knowledge:state2.loadingRecords')} />}
            {loadState === 'error' && <StateBlock title={t('knowledge:state2.workbenchUnavailable')} detail={loadError} />}
            {loadState === 'idle' && snapshot && <>
              {tab === 'inbox' && <CardCollection title={t('knowledge:inbox.empty.title')} detail={t('knowledge:inbox.empty.detail')} cards={candidatesForTab(snapshot, 'inbox').map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'library' && <CardCollection title={t('knowledge:library.empty.title')} detail={t('knowledge:library.empty.detail')} cards={snapshot.libraryCards} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'search' && <SearchLab query={query} onQueryChange={setQuery} cards={searchCards} state={searchState} selectedId={selectedId} onSelect={(card) => { setSelectedSearch(recordFromCard(card)); setSelectedId(card.id) }} />}
              {tab === 'wiki' && <CardCollection title={t('knowledge:wiki.empty.title')} detail={t('knowledge:wiki.empty.detail')} cards={snapshot.wikiPatches.map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'graph' && <CardCollection title={t('knowledge:graph.empty.title')} detail={t('knowledge:graph.empty.detail')} cards={snapshot.graphCandidates.map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'audit' && <AuditList events={snapshot.auditEvents} onSelect={(record) => { setSelectedSearch(record); setSelectedId(record.id) }} />}
            </>}
          </section>
          <aside className={styles.rightPane}><Inspector record={selected} snapshot={snapshot} busy={reviewBusy} error={reviewError} onApprove={() => void review('apply')} onReject={() => void review('reject')} onRevoke={() => void revoke()} /></aside>
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
  const { t } = useI18n('knowledge')
  if (!cards.length) return <StateBlock title={t('knowledge:list.empty')} compact />
  return <div className={styles.recordList}>{cards.map((card) => <button key={card.id} type="button" className={`${styles.recordButton} ${selectedId === card.id ? styles.recordActive : ''}`} onClick={() => onSelect(card.id)}><span className={styles.recordTitle}>{card.title}</span><span className={styles.recordMeta}>{card.kind} - {card.status ?? t('knowledge:card.statusAccepted')}</span></button>)}</div>
}

function CardCollection({ title, detail, cards, selectedId, onSelect }: { title: string; detail: string; cards: KnowledgeCard[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!cards.length) return <StateBlock title={title} detail={detail} />
  return <div className={styles.cardGrid}>{cards.map((card) => <KnowledgeCardTile key={card.id} card={card} active={card.id === selectedId} onSelect={() => onSelect(card.id)} />)}</div>
}

function AuditList({ events, onSelect }: { events: KnowledgeWorkbenchSnapshot['auditEvents']; onSelect: (record: InspectorRecord) => void }) {
  const { t } = useI18n('knowledge')
  if (!events.length) return <StateBlock title={t('knowledge:audit.empty.title')} detail={t('knowledge:audit.empty.detail')} />
  return <div className={styles.timeline}>{events.map((event) => <button key={event.id} type="button" className={styles.auditEvent} onClick={() => onSelect({ id: event.id, title: event.action, body: `${event.targetType}:${event.targetId}`, tags: [event.targetType], sourceIds: event.provenance.sourceObservationIds, fileRefs: event.provenance.fileRefs, createdAt: event.provenance.createdAt })}><span className={styles.auditDot} /><span><strong>{event.action}</strong><small>{event.targetType} - {event.targetId}</small></span><time>{formatDate(event.provenance.createdAt, t('knowledge:time.unknown'))}</time></button>)}</div>
}

function SearchLab({ query, onQueryChange, cards, state, selectedId, onSelect }: { query: string; onQueryChange: (value: string) => void; cards: KnowledgeCard[]; state: 'idle' | 'loading' | 'unavailable'; selectedId: string; onSelect: (card: KnowledgeCard) => void }) {
  const { t } = useI18n('knowledge')
  return <div className={styles.searchLab}><div className={styles.searchPanel}><div className={styles.cardTopline}><span>{t('knowledge:searchLab.controlledRecall')}</span><span>{t('knowledge:searchLab.bm25')}</span></div><input className={styles.largeInput} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('knowledge:searchLab.placeholder')} /></div><div className={styles.searchResults}>{!query.trim() && <StateBlock title={t('knowledge:searchLab.enterQuery')} compact />}{query.trim() && state === 'loading' && <StateBlock title={t('knowledge:searchLab.searching')} compact />}{query.trim() && state === 'unavailable' && <StateBlock title={t('knowledge:searchLab.unavailable.title')} detail={t('knowledge:searchLab.unavailable.detail')} compact />}{query.trim() && state === 'idle' && !cards.length && <StateBlock title={t('knowledge:searchLab.noMatches.title')} detail={t('knowledge:searchLab.noMatches.detail')} compact />}{cards.map((card) => <KnowledgeCardTile key={card.id} card={card} active={card.id === selectedId} onSelect={() => onSelect(card)} />)}</div></div>
}

function KnowledgeCardTile({ card, active, onSelect }: { card: KnowledgeCard; active?: boolean; onSelect: () => void }) {
  const { t } = useI18n('knowledge')
  return (
    <button type="button" className={`${styles.reviewCard} ${active ? styles.reviewCardActive : ''}`} onClick={onSelect}>
      <div className={styles.cardTopline}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <QuantumTopologyPreview seed={card.id} name={card.title} size="icon" />
          <span>{card.kind.toUpperCase()}</span>
        </div>
        <span>{formatConfidence(card.score)}</span>
      </div>
      <strong>{card.title}</strong>
      {card.summary && <p>{card.summary}</p>}
      <TagRow tags={card.tags} />
      <div className={styles.cardFoot}>{card.status ?? t('knowledge:card.statusActive')} - {t('knowledge:card.sourceRefs', { count: card.sourceRefs.observationIds.length })}</div>
    </button>
  )
}

function Inspector({ record, snapshot, busy, error, onApprove, onReject, onRevoke }: { record: InspectorRecord | null; snapshot: KnowledgeWorkbenchSnapshot | null; busy: boolean; error: string; onApprove: () => void; onReject: () => void; onRevoke: () => void }) {
  const { t } = useI18n('knowledge')
  if (!record) return <StateBlock title={t('knowledge:inspector.empty')} compact />
  const canReview = Boolean(record.reviewType) && record.status === 'proposed' && !snapshot?.usingDemoData && !busy
  const conflicts = snapshot?.conflicts.filter((item) => item.candidateId === record.id || item.targetId === record.id) ?? []
  const canRevoke = record.status === 'active' && record.kind !== 'observation' && Boolean(record.workspaceId) && !busy
  return <div className={styles.inspector}><div className={styles.paneTitle}>{t('knowledge:inspector.provenance')}</div><div className={styles.inspectorTitle}>{record.title}</div><p>{record.body}</p>{record.confidence !== undefined && <Metric label={t('knowledge:inspector.confidence')} value={formatConfidence(record.confidence)} />}{record.status && <KeyValue label={t('knowledge:inspector.status')} value={record.status} />}<TagRow tags={record.tags} /><KeyValue label={t('knowledge:inspector.created')} value={formatDate(record.createdAt, t('knowledge:time.unknown'))} /><KeyValue label={t('knowledge:inspector.sourceRefs')} value={record.sourceIds.join(', ') || t('knowledge:inspector.none')} /><KeyValue label={t('knowledge:inspector.files')} value={record.fileRefs.join(', ') || t('knowledge:inspector.none')} />{conflicts.length > 0 && <div className={styles.demoNotice}>{t('knowledge:inspector.conflict', { detail: conflicts.map((item) => `${item.reason} with ${item.targetId}`).join(', ') })}</div>}<div className={styles.actionRow}><button type="button" disabled={!canReview} onClick={onApprove}>{busy ? t('knowledge:action.working') : t('knowledge:action.approve')}</button><button type="button" disabled={!canReview} onClick={onReject}>{t('knowledge:action.reject')}</button><button type="button" disabled={!canRevoke} onClick={onRevoke}>{t('knowledge:action.archive')}</button></div>{error && <div className={styles.demoNotice}>{error}</div>}{snapshot?.usingDemoData && <div className={styles.demoNotice}>{t('knowledge:inspector.demoNotice')}</div>}</div>
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
  return { id: card.id, title: card.title, body: card.summary, confidence: card.score, tags: card.tags, sourceIds: card.sourceRefs.observationIds, fileRefs: card.sourceRefs.fileRefs, createdAt: card.createdAt, status: card.status, reviewType, kind: card.kind, workspaceId: card.workspaceId }
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className={styles.metric}><strong>{value}</strong><span>{label}</span></div> }
function KeyValue({ label, value }: { label: string; value: string }) { return <div className={styles.keyValue}><span>{label}</span><strong>{value}</strong></div> }
function TagRow({ tags }: { tags: string[] }) { return tags.length ? <div className={styles.tags}>{tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div> : null }
function StateBlock({ title, detail, compact }: { title: string; detail?: string; compact?: boolean }) { return <div className={`${styles.stateBlock} ${compact ? styles.stateBlockCompact : ''}`}><strong>{title}</strong>{detail && <span>{detail}</span>}</div> }
function formatConfidence(value: number) { return `${Math.round(value * 100)}%` }
function formatDate(value: string | undefined, unknownLabel: string): string { if (!value) return unknownLabel; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString() }
