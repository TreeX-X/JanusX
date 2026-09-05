import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  applyKnowledgeCandidate,
  getKnowledgeProcessingStats,
  loadKnowledgeWorkbenchSnapshot,
  processKnowledgeNow,
  rejectKnowledgeCandidate,
  revokeKnowledgeTruth,
  searchKnowledgeCards,
  sortInboxCandidates,
  type KnowledgeReviewCandidateType,
  type KnowledgeWorkbenchSnapshot,
} from '../../services/knowledge'
import type { KnowledgeProcessingStats } from '../../../../shared/ipc/knowledge'
import { KnowledgeStatusBar } from './KnowledgeStatusBar'
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas'
import type { KnowledgeGraphNode } from './knowledgeGraph'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateStatus,
  CandidateWikiPatch,
  KnowledgeCard,
  KnowledgeScoreExplanation,
} from '../../../../shared/knowledge'
import { RefreshIconButton } from '../ui/RefreshIconButton'
import { QuantumTopologyPreview } from '../ui/QuantumTopologyPreview'
import { CardSkeleton, useAnimatedOpen, useWorkbenchPhase } from '../shared/CardFrame'
import { useI18n } from '@/i18n/useI18n'
import '../shared/CardFrame.css'
import styles from './KnowledgeWorkbench.module.css'

export type KnowledgeWorkbenchTab = 'inbox' | 'library' | 'wiki' | 'graph' | 'search' | 'audit'
type Candidate = CandidateFact | CandidateWikiPatch | CandidateGraphEdge

/** §9.1: left-rail grouping mirrors the demo skeleton (workbench vs special views). */
const MAIN_TABS: KnowledgeWorkbenchTab[] = ['inbox', 'library', 'search']
const SPECIAL_TABS: KnowledgeWorkbenchTab[] = ['wiki', 'graph', 'audit']

interface Props {
  isOpen: boolean
  onClose: () => void
}

// §9.1: blueprint-aligned per-card stagger (enter 180/260, exit 60/260).
const WORKBENCH_CARD_ENTER_STAGGER_MS = 180
const WORKBENCH_CARD_ENTER_DURATION_MS = 260
const WORKBENCH_CARD_EXIT_STAGGER_MS = 60
const WORKBENCH_CARD_EXIT_DURATION_MS = 260
const WORKBENCH_EXIT_BUFFER_MS = 60

interface WorkbenchCardPlan {
  detailOpen: boolean
}

const cardStyle = (index: number): CSSProperties => ({
  '--card-index': index,
} as CSSProperties)

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
  /** Phase 4 Detail: how the candidate was derived (candidates only). */
  derivation?: Candidate['derivation']
  /** Phase 4 Detail: what a fact states (fact candidates / cards). */
  factKind?: string
  /** Demo parity: why a search hit matched (search-result cards only). */
  scoreExplanation?: KnowledgeScoreExplanation
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
  const [procStats, setProcStats] = useState<KnowledgeProcessingStats | null>(null)
  const [procBusy, setProcBusy] = useState(false)

  // Shared card-frame lifecycle (§9) + blueprint stagger (§9.1):
  // per-card rise/descend via --card-index, revealReady rAF gate,
  // frozen closingPlan so exit keeps the detail track mounted.
  const {
    phase,
    isClosing,
    requestClose: phaseRequestClose,
    handleExitFinished,
  } = useWorkbenchPhase(isOpen, { awaitAnimation: true, exitMs: 600, onClose })
  const [revealReady, setRevealReady] = useState(false)
  const [closingPlan, setClosingPlan] = useState<WorkbenchCardPlan>({ detailOpen: false })
  const activeCardPlanRef = useRef<WorkbenchCardPlan>({ detailOpen: false })
  const requestClose = useCallback(() => {
    setClosingPlan(activeCardPlanRef.current)
    phaseRequestClose()
  }, [phaseRequestClose])

  useEffect(() => {
    if (!isOpen) {
      setClosingPlan(activeCardPlanRef.current)
      return
    }
    setRevealReady(false)
    const frame = requestAnimationFrame(() => setRevealReady(true))
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  const refresh = async () => {
    setSelectedSearch(null)
    setLoadState('loading')
    setLoadError('')
    try {
      const [next, stats] = await Promise.all([
        loadKnowledgeWorkbenchSnapshot(),
        getKnowledgeProcessingStats(),
      ])
      setSnapshot(next)
      setProcStats(stats)
      setSelectedId((current) => selectionIdForTab(next, tab, current))
      setLoadState('idle')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('knowledge:error.loadFailed'))
      setLoadState('error')
    }
  }

  const processNow = async () => {
    if (procBusy) return
    setProcBusy(true)
    setReviewError('')
    try {
      await processKnowledgeNow()
      await refresh()
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : t('knowledge:error.actionFailed', { action: 'process' }))
    } finally {
      setProcBusy(false)
    }
  }

  useEffect(() => {
    if (isOpen) void refresh()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, requestClose])

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
    () => tab === 'search' || tab === 'audit' || tab === 'graph'
      ? selectedSearch
      : snapshot ? resolveRecordForTab(snapshot, tab, selectedId) : null,
    [selectedId, selectedSearch, snapshot, tab],
  )

  // Detail side panel stays mounted across its exit slide: the grid track
  // collapses in parallel while the last record fades/slides out.
  const detailOpen = selected != null
  const planDetailOpen = isClosing ? closingPlan.detailOpen : detailOpen
  const detailAnim = useAnimatedOpen(planDetailOpen)
  const prevRecordRef = useRef<InspectorRecord | null>(null)
  if (selected) prevRecordRef.current = selected
  const shownSelected = selected ?? (detailAnim.rendered ? prevRecordRef.current : null)

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

  const selectGraph = (id: string, record: InspectorRecord | null) => {
    setSelectedSearch(record)
    setSelectedId(id)
  }

  // Graph selections resolve through the shared record mapping so the
  // inspector keeps working for settled nodes (and legacy proposal ids).
  const resolveCanvasRecord = (node: KnowledgeGraphNode): InspectorRecord | null =>
    snapshot ? resolveGraphRecord(snapshot, node.id) : null

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

  if (phase === 'hidden') return null

  const paneTitle = tab === 'inbox' ? t('knowledge:paneTitle.inbox') : tab === 'library' ? t('knowledge:paneTitle.library') : TAB_LABELS[tab]
  // Demo parity: every nav tab carries its own count badge.
  const tabCounts: Record<KnowledgeWorkbenchTab, number> = {
    inbox: snapshot ? candidatesForTab(snapshot, 'inbox').length : 0,
    library: snapshot?.libraryCards.length ?? 0,
    wiki: (snapshot?.wikiPatches.length ?? 0) + (snapshot ? publishedWikiCards(snapshot).length : 0),
    graph: snapshot?.graphCandidates.length ?? 0,
    search: searchCards.length,
    audit: snapshot?.auditEvents.length ?? 0,
  }
  const paneCount = tabCounts[tab]

  // §9.1: the detail card shows iff a record is selected; the grid track
  // reallocates with a track transition while the panel slides. The closing
  // plan freezes the layout so workbench exit animates intact.
  // Closing the detail clears the selection — stage cards are the reopen entry.
  activeCardPlanRef.current = { detailOpen }
  const cardPlan = isClosing ? closingPlan : { detailOpen }
  const cardCount = 4 + Number(cardPlan.detailOpen)
  const exitDuration = WORKBENCH_CARD_EXIT_DURATION_MS
    + Math.max(0, cardCount - 1) * WORKBENCH_CARD_EXIT_STAGGER_MS
    + WORKBENCH_EXIT_BUFFER_MS

  const clearDetail = () => {
    setSelectedSearch(null)
    setSelectedId('')
  }

  return createPortal(
    <div
      className={styles.backdrop}
      data-closing={isClosing ? "true" : undefined}
      onAnimationEnd={(event) => {
        if (!isClosing || event.target !== event.currentTarget) return
        handleExitFinished()
      }}
      style={{ '--workbench-exit-duration': `${exitDuration}ms` } as CSSProperties}
    >
      <section
        className={styles.shell}
        data-closing={isClosing ? "true" : undefined}
        data-reveal-ready={revealReady ? "true" : undefined}
        data-card-count={cardCount}
        style={{
          '--card-count': cardCount,
          '--card-enter-stagger': `${WORKBENCH_CARD_ENTER_STAGGER_MS}ms`,
          '--card-enter-duration': `${WORKBENCH_CARD_ENTER_DURATION_MS}ms`,
          '--card-exit-stagger': `${WORKBENCH_CARD_EXIT_STAGGER_MS}ms`,
        } as CSSProperties}
        aria-label={t('knowledge:aria.engine')}
      >
        <header className={styles.header} style={cardStyle(0)}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <span className={styles.bcCurrent}>{t('knowledge:breadcrumb.engine')}</span>
            <span className={styles.bcSep} aria-hidden="true">/</span>
            <span>{TAB_LABELS[tab]}</span>
          </nav>
          {snapshot?.usingDemoData && <span className={styles.badge}>{t('knowledge:badge.demoData')}</span>}
          <div className={styles.headerActions}>
            <RefreshIconButton
              accent="blue"
              label={t('knowledge:action.refresh')}
              loading={loadState === 'loading'}
              onClick={() => void refresh()}
            />
            <button type="button" className={styles.closeButton} onClick={requestClose} title={t('knowledge:action.close')} aria-label={t('knowledge:aria.close')}><span aria-hidden="true" /></button>
          </div>
        </header>
        <div className={styles.statusCard} style={cardStyle(1)}>
          <KnowledgeStatusBar stats={procStats} busy={procBusy} onProcessNow={() => void processNow()} />
        </div>
        <main className={styles.grid} data-detail-open={cardPlan.detailOpen ? 'true' : 'false'}>
          <nav className={styles.leftPane} style={cardStyle(2)} aria-label={t('knowledge:aria.engine')}>
            <div className={styles.navLabel}>{t('knowledge:nav.main')}</div>
            {MAIN_TABS.map((item) => (
              <button
                key={item}
                type="button"
                className={`${styles.navButton} ${tab === item ? styles.navActive : ''}`}
                aria-current={tab === item ? 'page' : undefined}
                onClick={() => activateTab(item)}
              >
                <span>{TAB_LABELS[item]}</span>
                <span className={styles.paneCount}>{tabCounts[item]}</span>
              </button>
            ))}
            <div className={styles.navLabel}>{t('knowledge:nav.special')}</div>
            {SPECIAL_TABS.map((item) => (
              <button
                key={item}
                type="button"
                className={`${styles.navButton} ${tab === item ? styles.navActive : ''}`}
                aria-current={tab === item ? 'page' : undefined}
                onClick={() => activateTab(item)}
              >
                <span>{TAB_LABELS[item]}</span>
                <span className={styles.paneCount}>{tabCounts[item]}</span>
              </button>
            ))}
          </nav>
          <section className={styles.stage} style={cardStyle(3)}>
            <div className={styles.paneHeader}>
              <div className={styles.paneTitle}>{paneTitle}</div>
              <span className={styles.paneCount} aria-label={t('knowledge:aria.paneCount', { title: paneTitle })}>{paneCount}</span>
            </div>
            {loadState === 'loading' && <CardSkeleton lines={4} label={t('knowledge:state2.loadingRecords')} />}
            {loadState === 'error' && <StateBlock title={t('knowledge:state2.workbenchUnavailable')} detail={loadError} />}
            {loadState === 'idle' && snapshot && <>
              {tab === 'inbox' && <CardCollection title={t('knowledge:inbox.empty.title')} detail={t('knowledge:inbox.empty.detail')} cards={candidatesForTab(snapshot, 'inbox').map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'library' && <CardCollection title={t('knowledge:library.empty.title')} detail={t('knowledge:library.empty.detail')} cards={snapshot.libraryCards} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'search' && <SearchLab query={query} onQueryChange={setQuery} cards={searchCards} state={searchState} selectedId={selectedId} onSelect={(card) => { setSelectedSearch(recordFromCard(card)); setSelectedId(card.id) }} />}
              {tab === 'wiki' && <div className={styles.wikiSections}>
                <CardCollection title={t('knowledge:wiki.published.empty.title')} detail={t('knowledge:wiki.published.empty.detail')} cards={snapshot ? publishedWikiCards(snapshot) : []} selectedId={selectedId} onSelect={selectCandidate} />
                <CardCollection title={t('knowledge:wiki.empty.title')} detail={t('knowledge:wiki.empty.detail')} cards={snapshot.wikiPatches.map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />
              </div>}
              {tab === 'graph' && <KnowledgeGraphCanvas snapshot={snapshot} selectedId={selectedId} resolveRecord={resolveCanvasRecord} onSelect={selectGraph} />}
              {tab === 'audit' && <AuditList events={snapshot.auditEvents} onSelect={(record) => { setSelectedSearch(record); setSelectedId(record.id) }} />}
            </>}
          </section>
          {detailAnim.rendered ? (
            <aside
              className={styles.rightPane}
              style={cardStyle(4)}
              data-visible={detailAnim.visible ? 'true' : 'false'}
              aria-hidden={detailAnim.visible ? undefined : 'true'}
            >
              <Inspector record={shownSelected} snapshot={snapshot} busy={reviewBusy} error={reviewError} onApprove={() => void review('apply')} onReject={() => void review('reject')} onRevoke={() => void revoke()} onCloseDetail={clearDetail} />
            </aside>
          ) : null}
        </main>
      </section>
    </div>,
    document.body,
  )
}

function candidatesForTab(snapshot: KnowledgeWorkbenchSnapshot, tab: KnowledgeWorkbenchTab): Candidate[] {
  const candidates: Candidate[] = [...snapshot.factCandidates, ...snapshot.wikiPatches, ...snapshot.graphCandidates]
  if (tab !== 'inbox') return []
  // §5: llm-preferred reorders only the Inbox view, never the stored lists.
  return sortInboxCandidates(candidates.filter((candidate) => candidate.status === 'proposed'), snapshot.mode)
}

/** Phase 4 Wiki: published pages already ride along in libraryCards. */
export function publishedWikiCards(snapshot: KnowledgeWorkbenchSnapshot): KnowledgeCard[] {
  return snapshot.libraryCards.filter((card) => card.kind === 'wiki')
}

/**
 * Graph record resolution: canvas node ids (`fact:<factId>`) resolve back to
 * inspector records. The `proposal:<candidateId>` branch stays for backward
 * compatibility with persisted selections; the graph itself is truth-only.
 */
export function resolveGraphRecord(
  snapshot: KnowledgeWorkbenchSnapshot,
  id: string,
): InspectorRecord | null {
  const candidates: Candidate[] = [
    ...snapshot.factCandidates,
    ...snapshot.wikiPatches,
    ...snapshot.graphCandidates,
  ]
  if (id.startsWith('proposal:')) {
    return recordFromCandidate(candidates.find((candidate) => candidate.id === id.slice('proposal:'.length)) ?? null)
  }
  if (id.startsWith('fact:')) {
    const card = snapshot.libraryCards.find((item) => item.id === id.slice('fact:'.length))
    return card ? recordFromCard(card) : null
  }
  return recordFromCandidate(candidates.find((candidate) => candidate.id === id) ?? null)
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

  if (tab === 'wiki') {
    const patch = snapshot.wikiPatches.find((candidate) => candidate.id === id)
    if (patch) return recordFromCandidate(patch)
    const page = publishedWikiCards(snapshot).find((card) => card.id === id)
    return page ? recordFromCard(page) : null
  }
  if (tab === 'graph') return resolveGraphRecord(snapshot, id)
  const candidates: Candidate[] = tab === 'inbox' ? candidatesForTab(snapshot, tab) : []
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
  if (tab === 'wiki') {
    return snapshot.wikiPatches[0]?.id ?? publishedWikiCards(snapshot)[0]?.id ?? ''
  }
  if (tab === 'graph') {
    // The graph maps settled truth; default to the first truth fact.
    const firstFact = snapshot.truthFacts?.[0]
    return firstFact ? `fact:${firstFact.id}` : ''
  }
  return ''
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
      <strong title={card.title}>{card.title}</strong>
      {card.summary && <p title={card.summary}>{card.summary}</p>}
      <TagRow tags={card.tags} />
      <div className={styles.cardFoot}>{card.status ?? t('knowledge:card.statusActive')} - {t('knowledge:card.sourceRefs', { count: card.sourceRefs.observationIds.length })}</div>
    </button>
  )
}

function Inspector({ record, snapshot, busy, error, onApprove, onReject, onRevoke, onCloseDetail }: { record: InspectorRecord | null; snapshot: KnowledgeWorkbenchSnapshot | null; busy: boolean; error: string; onApprove: () => void; onReject: () => void; onRevoke: () => void; onCloseDetail: () => void }) {
  const { t } = useI18n('knowledge')
  if (!record) return <StateBlock title={t('knowledge:inspector.empty')} compact />
  const canReview = Boolean(record.reviewType) && record.status === 'proposed' && !snapshot?.usingDemoData && !busy
  const conflicts = snapshot?.conflicts.filter((item) => item.candidateId === record.id || item.targetId === record.id) ?? []
  const canRevoke = record.status === 'active' && record.kind !== 'observation' && Boolean(record.workspaceId) && !busy
  return <div className={styles.inspector}><div className={styles.detailBar}><div className={styles.paneTitle}>{t('knowledge:inspector.provenance')}</div><button type="button" className={styles.detailClose} onClick={onCloseDetail} aria-label={t('knowledge:inspector.closeDetail')} title={t('knowledge:inspector.closeDetail')}><X size={16} aria-hidden="true" /></button></div><div className={styles.inspectorTitle}>{record.title}</div><p>{record.body}</p>{record.confidence !== undefined && <Metric label={t('knowledge:inspector.confidence')} value={formatConfidence(record.confidence)} />}{record.status && <KeyValue label={t('knowledge:inspector.status')} value={record.status} />}{record.derivation && <KeyValue label={t('knowledge:inspector.derivation')} value={record.derivation} />}{record.factKind && <KeyValue label={t('knowledge:inspector.factKind')} value={record.factKind} />}{record.scoreExplanation && <KeyValue label={t('knowledge:inspector.scoreExplanation')} value={formatScoreExplanation(record.scoreExplanation)} />}<TagRow tags={record.tags} /><KeyValue label={t('knowledge:inspector.created')} value={formatDate(record.createdAt, t('knowledge:time.unknown'))} /><KeyValue label={t('knowledge:inspector.sourceRefs')} value={record.sourceIds.join(', ') || t('knowledge:inspector.none')} /><KeyValue label={t('knowledge:inspector.files')} value={record.fileRefs.join(', ') || t('knowledge:inspector.none')} />{conflicts.length > 0 && <div className={styles.demoNotice}>{t('knowledge:inspector.conflict', { detail: conflicts.map((item) => `${item.reason} with ${item.targetId}`).join(', ') })}</div>}<div className={styles.actionRow}><button type="button" disabled={!canReview} onClick={onApprove}>{busy ? t('knowledge:action.working') : t('knowledge:action.approve')}</button><button type="button" disabled={!canReview} onClick={onReject}>{t('knowledge:action.reject')}</button><button type="button" disabled={!canRevoke} onClick={onRevoke}>{t('knowledge:action.archive')}</button></div>{error && <div className={styles.demoNotice}>{error}</div>}{snapshot?.usingDemoData && <div className={styles.demoNotice}>{t('knowledge:inspector.demoNotice')}</div>}</div>
}

function cardFromCandidate(candidate: Candidate): KnowledgeCard {
  if (candidate.type === 'fact') return { id: candidate.id, kind: 'fact', title: candidate.fact.content, summary: candidate.fact.concepts.join(' - '), score: candidate.fact.confidence, tags: candidate.fact.tags, workspaceId: candidate.fact.provenance.workspaceId, workspacePath: candidate.fact.provenance.workspacePath, sourceRefs: { observationIds: candidate.fact.provenance.sourceObservationIds, fileRefs: candidate.fact.provenance.fileRefs }, createdAt: candidate.fact.provenance.createdAt, status: candidate.status, rawType: 'fact-candidate' }
  if (candidate.type === 'wiki-patch') return { id: candidate.id, kind: 'wiki', title: candidate.title, summary: candidate.rationale, score: candidate.confidence, tags: [candidate.pageSlug], workspaceId: candidate.provenance.workspaceId, workspacePath: candidate.provenance.workspacePath, sourceRefs: { observationIds: candidate.provenance.sourceObservationIds, fileRefs: candidate.provenance.fileRefs }, createdAt: candidate.provenance.createdAt, status: candidate.status, rawType: 'wiki-patch' }
  return { id: candidate.id, kind: 'graph', title: `${candidate.edge.from} -> ${candidate.edge.to}`, summary: candidate.edge.type, score: candidate.edge.confidence, tags: [candidate.edge.type], workspaceId: candidate.edge.workspaceId, sourceRefs: { observationIds: candidate.edge.sourceFactIds, fileRefs: [] }, createdAt: candidate.edge.createdAt, status: candidate.status, rawType: 'graph-candidate' }
}

function recordFromCandidate(candidate: Candidate | null): InspectorRecord | null {
  if (!candidate) return null
  const record = recordFromCard(
    cardFromCandidate(candidate),
    candidate.type === 'fact' ? 'fact' : candidate.type === 'wiki-patch' ? 'wiki-patch' : 'graph-edge',
  )
  return {
    ...record,
    derivation: candidate.derivation,
    factKind: candidate.type === 'fact' ? candidate.fact.kind : undefined,
  }
}

function recordFromCard(card: KnowledgeCard, reviewType?: KnowledgeReviewCandidateType): InspectorRecord {
  return { id: card.id, title: card.title, body: card.summary, confidence: card.score, tags: card.tags, sourceIds: card.sourceRefs.observationIds, fileRefs: card.sourceRefs.fileRefs, createdAt: card.createdAt, status: card.status, reviewType, kind: card.kind, workspaceId: card.workspaceId, scoreExplanation: card.scoreExplanation }
}

/** Demo parity: one-line BM25 part list; always keeps bm25, drops zero parts. */
export function formatScoreExplanation(explanation: KnowledgeScoreExplanation): string {
  return (Object.entries(explanation) as Array<[keyof KnowledgeScoreExplanation, number]>)
    .filter(([part, value]) => part === 'bm25' || value !== 0)
    .map(([part, value]) => `${part} ${value.toFixed(2)}`)
    .join(' · ')
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className={styles.metric}><strong>{value}</strong><span>{label}</span></div> }
function KeyValue({ label, value }: { label: string; value: string }) { return <div className={styles.keyValue}><span>{label}</span><strong>{value}</strong></div> }
function TagRow({ tags }: { tags: string[] }) { return tags.length ? <div className={styles.tags}>{tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div> : null }
function StateBlock({ title, detail, compact }: { title: string; detail?: string; compact?: boolean }) { return <div className={`${styles.stateBlock} ${compact ? styles.stateBlockCompact : ''}`}><strong>{title}</strong>{detail && <span>{detail}</span>}</div> }
function formatConfidence(value: number) { return `${Math.round(value * 100)}%` }
function formatDate(value: string | undefined, unknownLabel: string): string { if (!value) return unknownLabel; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString() }
