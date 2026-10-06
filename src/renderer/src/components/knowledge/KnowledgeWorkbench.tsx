import { useAssistantStore } from '@/stores/assistant'
import { useExperimentalStore } from '@/stores/experimental'
import { UserPersonaTool } from './UserPersonaTool'
import { MemoryReviewTool } from './MemoryReviewTool'
import { PersonalMemorySettingsPanel } from '../PersonalMemorySettingsPanel'
import { KnowledgeSettingsPanel } from '../KnowledgeSettingsPanel'
import type { ReviewCandidateInput } from '../../../../shared/ipc/knowledge'
import { reviewCandidateInput } from '../../../../shared/review-candidate-snapshot'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { KnowledgeMarkdown } from './KnowledgeMarkdown'
import reviewStyles from './MemoryReviewTool.module.css'
import { MemoryReviewCard } from './MemoryReviewTool'
import { ObservationRevokeControl } from './ObservationRevokeControl'
import { ObservationRevocations } from './ObservationRevocations'
import { KnowledgeStatusBar } from './KnowledgeStatusBar'
import { AutomationStatus } from './AutomationStatus'
import { AutomationRecords } from './AutomationRecords'
import { AuditRecords } from './AuditRecords'
import { AuditDetail } from './AuditDetail'
import type { AuditRecord } from '../../../../shared/ipc/knowledge'
import { useKnowledgeAutomation } from '../../services/knowledge-automation'
import { assertCandidateCanReview } from './candidateReviewState'
import type { KnowledgeAutomationStatus } from '../../../../shared/knowledge-automation'
import { NoteWikiEditor, WikiPageDetail } from './NoteWikiLinks'
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas'
import { buildKnowledgeGraphView, publishedGraphPages, graphWikiId, recordForGraphNode, type KnowledgeGraphNode } from './knowledgeGraph'
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
import { competingCorrections, filterInboxByScope, type InboxScopeFilter } from './inboxScope'
import { CardSkeleton, useAnimatedOpen, useWorkbenchPhase } from '../shared/CardFrame'
import { useI18n } from '@/i18n/useI18n'
import '../shared/CardFrame.css'
import surface from './MemorySurface.module.css'
import tabStyles from '../ui/TabStrip.module.css'
import styles from './KnowledgeWorkbench.module.css'

export type KnowledgeWorkbenchTab = 'inbox' | 'library' | 'wiki' | 'graph' | 'search' | 'audit' | 'settings'
type Candidate = CandidateFact | CandidateWikiPatch | CandidateGraphEdge

/** §9.1: left-rail grouping mirrors the demo skeleton (workbench vs special views). */
const MAIN_TABS: KnowledgeWorkbenchTab[] = ['inbox', 'library', 'search']
const SPECIAL_TABS: KnowledgeWorkbenchTab[] = ['wiki', 'graph', 'audit']
const RECORD_TABS = ['processing', 'audit'] as const

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
  recordType?: 'audit'
  scoreKind?: 'search' | 'confidence'
  pageSlug?: string
  id: string
  title: string
  body: string
  confidence?: number
  tags: string[]
  sourceIds: string[]
  fileRefs: string[]
  createdAt?: string
  status?: CandidateStatus | 'active' | 'archived' | 'expired'
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
  const engineeringEnabled = useExperimentalStore(s => s.knowledge)
  const personalEnabled = useExperimentalStore(s => s.persona)
  const chosenDomain = useAssistantStore(s => s.workbenchDomain)
  const setDomain = useAssistantStore(s => s.setWorkbenchDomain)
  const domain = chosenDomain === 'engineering' && engineeringEnabled || !personalEnabled ? 'engineering' : 'personal'
  const [personalView, setPersonalView] = useState<'profile' | 'review' | 'settings'>('profile')
  const TAB_LABELS: Record<KnowledgeWorkbenchTab, string> = {
    inbox: t('knowledge:tab.inbox'),
    library: t('knowledge:tab.library'),
    wiki: t('knowledge:tab.wiki'),
    graph: t('knowledge:tab.graph'),
    search: t('knowledge:tab.search'),
    audit: t('knowledge:summary.recordArea'),
    settings: t('knowledge:domains.settings'),
  }
  const { status: automation } = useKnowledgeAutomation(isOpen && domain === 'engineering' && engineeringEnabled)
  const [tab, setTab] = useState<KnowledgeWorkbenchTab>('inbox')
  const [recordTab, setRecordTab] = useState<'processing' | 'audit'>('processing')
  const recordTabId = useId()
  const [attentionOnly, setAttentionOnly] = useState(false)
  const automationView = useAssistantStore(s => s.automationView)
  const activeTabRef = useRef(tab)
  activeTabRef.current = tab
  const [snapshot, setSnapshot] = useState<KnowledgeWorkbenchSnapshot | null>(null)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState('')
  const loadGeneration = useRef(0)
  const [selectedId, setSelectedId] = useState('')
  const [selectedSearch, setSelectedSearch] = useState<InspectorRecord | null>(null)
  const [selectedAudit, setSelectedAudit] = useState<AuditRecord | null>(null)
  useEffect(() => { setSelectedAudit(null) }, [domain, tab, recordTab, isOpen])
  const [query, setQuery] = useState('')
  const [searchCards, setSearchCards] = useState<KnowledgeCard[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'unavailable'>('idle')
  const [reviewBusy, setReviewBusy] = useState(false)
  const mutationLock = useRef(false)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const [reviewError, setReviewError] = useState('')
  useEffect(() => setReviewError(''), [selectedId, domain])
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

  const refresh = useCallback(async () => {
    const request = ++loadGeneration.current
    setSelectedSearch(null)
    setLoadState('loading')
    setLoadError('')
    try {
      const [next, stats] = await Promise.all([
        loadKnowledgeWorkbenchSnapshot(true),
        getKnowledgeProcessingStats(),
      ])
      if (request !== loadGeneration.current) return
      setSnapshot(next)
      setProcStats(stats)
      setSelectedId((current) => selectionIdForTab(next, activeTabRef.current, current, 'engineering'))
      setLoadState('idle')
    } catch (error) {
      if (request !== loadGeneration.current) return
      setLoadError(error instanceof Error ? error.message : t('knowledge:error.loadFailed'))
      setLoadState('error')
    }
  }, [t])

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
    if (isOpen && domain === 'engineering' && engineeringEnabled) void refresh()
    const changed = () => { if (isOpen && domain === 'engineering' && engineeringEnabled) void refresh() }
    window.addEventListener('janusx-memory-changed', changed)
    return () => { loadGeneration.current += 1; window.removeEventListener('janusx-memory-changed', changed) }
  }, [isOpen, domain, engineeringEnabled, refresh])


  useEffect(() => {
    if (!isOpen || domain !== 'engineering' || !engineeringEnabled || tab !== 'search') return
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
        setSearchCards(cards.filter(card => card.workspaceId !== 'user'))
        setSearchState('idle')
      })
      .catch(() => {
        if (cancelled) return
        setSelectedSearch(null)
        setSearchCards([])
        setSearchState('unavailable')
      })
    return () => { cancelled = true }
  }, [isOpen, query, tab, domain, engineeringEnabled])

  const selected = useMemo(
    () => tab === 'settings' ? null : tab === 'graph'
      ? snapshot ? resolveGraphRecord(snapshot, selectedId) ?? selectedSearch : null
      : tab === 'search' || tab === 'audit'
      ? selectedSearch
      : snapshot ? resolveRecordForTab(snapshot, tab, selectedId) : null,
    [selectedId, selectedSearch, snapshot, tab],
  )

  // Detail side panel stays mounted across its exit slide: the grid track
  // collapses in parallel while the last record fades/slides out.
  const auditSelected = tab === 'audit' && recordTab === 'audit' ? selectedAudit : null
  const detailOpen = domain === 'engineering' && (selected != null || auditSelected != null)
  const clearDetail = useCallback(() => {
    const auditId = selectedAudit?.id
    setSelectedAudit(null)
    setSelectedSearch(null)
    setSelectedId('')
    if (auditId) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-audit-id="${CSS.escape(auditId)}"]`)?.focus())
  }, [selectedAudit])

  // Note: Escape dismisses the active detail even when the graph owns focus — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      if (detailOpen) clearDetail()
      else requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, detailOpen, clearDetail, requestClose])

  const planDetailOpen = isClosing ? closingPlan.detailOpen : detailOpen
  const detailAnim = useAnimatedOpen(planDetailOpen)
  const prevRecordRef = useRef<InspectorRecord | null>(null)
  if (selected) prevRecordRef.current = selected
  const shownSelected = selected ?? (detailAnim.rendered ? prevRecordRef.current : null)
  const previousAudit = useRef<AuditRecord | null>(null)
  if (auditSelected) previousAudit.current = auditSelected
  const shownAudit = auditSelected ?? (detailAnim.rendered && tab === 'audit' && recordTab === 'audit' ? previousAudit.current : null)

  const activateTab = (nextTab: KnowledgeWorkbenchTab) => {
    setTab(nextTab)
    setSelectedSearch(null)
    if (snapshot) {
      setSelectedId((current) => selectionIdForTab(snapshot, nextTab, current, 'engineering'))
    }
  }

  useEffect(() => {
    if (!isOpen || !engineeringEnabled || !automationView) return
    setTab(automationView === 'settings' ? 'settings' : 'audit')
    setRecordTab('processing'); setAttentionOnly(automationView === 'attention')
    setSelectedId(''); setSelectedSearch(null)
    useAssistantStore.getState().requestAutomationView(null)
  }, [isOpen, engineeringEnabled, automationView])

  const openRecords = (attention: boolean) => {
    activateTab('audit'); setRecordTab('processing'); setAttentionOnly(attention)
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

  const review = async (action: 'apply' | 'reject', replacement?: ReviewCandidateInput['replacement']) => {
    if (mutationLock.current || !selected?.reviewType || selected.status !== 'proposed' || snapshot?.usingDemoData) return
    mutationLock.current = true
    setReviewBusy(true)
    setReviewError('')
    try {
      const candidate = snapshot && [...snapshot.factCandidates, ...snapshot.wikiPatches, ...snapshot.graphCandidates].find(item => item.id === selected.id && item.type === selected.reviewType)
      if (!candidate) throw new Error('Candidate unavailable; refresh before reviewing')
      await assertCandidateCanReview(candidate)
      const input = await reviewCandidateInput(candidate)
      if (action === 'apply') await applyKnowledgeCandidate({ ...input, replacement })
      else await rejectKnowledgeCandidate(input)
    } catch (error) {
      if (selectedIdRef.current === selectedId) setReviewError(error instanceof Error ? error.message : t('knowledge:error.actionFailed', { action }))
    } finally {
      mutationLock.current = false
      setReviewBusy(false)
    }
  }

  const revoke = async () => {
    if (mutationLock.current || !selected?.workspaceId || !selected.kind) return
    if (selected.kind === 'observation') { clearDetail(); await refresh(); return }
    mutationLock.current = true
    setReviewBusy(true)
    setReviewError('')
    try {
      await revokeKnowledgeTruth({ kind: selected.kind, id: selected.pageSlug ?? selected.id, workspaceId: selected.workspaceId })
      await refresh()
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : t('knowledge:error.revokeFailed'))
    } finally { mutationLock.current = false; setReviewBusy(false) }
  }

  if (phase === 'hidden' || !engineeringEnabled && !personalEnabled) return null
  const domainNavigation = <nav className={styles.domainNavigation} aria-label={t('knowledge:domains.title')}>
    {engineeringEnabled && <button type="button" aria-pressed={domain === 'engineering'} onClick={() => setDomain('engineering')}>{t('knowledge:domains.engineering')}</button>}
    {personalEnabled && <button type="button" aria-pressed={domain === 'personal'} onClick={() => setDomain('personal')}>{t('knowledge:domains.personal')}</button>}
  </nav>
  const paneTitle = tab === 'inbox' ? t('knowledge:paneTitle.inbox') : tab === 'library' ? t('knowledge:paneTitle.library') : TAB_LABELS[tab]
  // Demo parity: every nav tab carries its own count badge.
  const tabCounts: Record<KnowledgeWorkbenchTab, number> = {
    inbox: snapshot ? candidatesForTab(snapshot, 'inbox', 'engineering').length : 0,
    library: snapshot?.libraryCards.length ?? 0,
    wiki: (snapshot?.wikiPatches.length ?? 0) + (snapshot ? publishedWikiCards(snapshot).length : 0),
    graph: snapshot ? publishedGraphPages(snapshot).length : 0,
    search: searchCards.length,
    audit: snapshot?.auditEvents.length ?? 0,
    settings: 0,
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
        aria-label={t('knowledge:domains.title')}
      >
        <header className={styles.header} style={cardStyle(0)}>
          <button type="button" className={styles.closeButton} onClick={requestClose} title={t('knowledge:action.close')} aria-label={t('knowledge:aria.close')}><span aria-hidden="true" /></button>
          {domainNavigation}
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <span className={styles.bcCurrent}>{t(`knowledge:domains.${domain}`)}</span>
            <span className={styles.bcSep} aria-hidden="true">/</span>
            <span>{domain === 'personal' ? t(`knowledge:domains.${personalView}`) : TAB_LABELS[tab]}</span>
          </nav>
          {domain === 'engineering' && snapshot?.usingDemoData && <span className={styles.badge}>{t('knowledge:badge.demoData')}</span>}
          {domain === 'engineering' && <div className={styles.headerActions}>
            <RefreshIconButton
              accent="blue"
              label={t('knowledge:action.refresh')}
              loading={loadState === 'loading'}
              onClick={() => void refresh()}
            />
          </div>}
        </header>
        <div className={styles.statusCard} data-domain={domain} style={cardStyle(1)}>
          {domain === 'personal' ? <div className={styles.personalStatus}><strong>{t('knowledge:domains.personal')}</strong><span>{t('knowledge:personalBoard.description')}</span></div> : <>
          <AutomationStatus active={isOpen} onChanged={() => void refresh()} onOpenRecords={openRecords} onOpenSettings={() => activateTab('settings')} />
          </>}
        </div>
        <main key={domain} className={styles.grid} data-domain={domain} data-detail-open={cardPlan.detailOpen ? 'true' : 'false'}>
          {domain === 'personal' ? <>
            <nav className={styles.leftPane} style={cardStyle(2)} aria-label={t('knowledge:domains.personal')}>
              <div className={styles.navLabel}>{t('knowledge:nav.main')}</div>
              {(['profile', 'review', 'settings'] as const).map(view => <button key={view} type="button"
                className={`${styles.navButton} ${personalView === view ? styles.navActive : ''}`}
                aria-pressed={personalView === view} onClick={() => setPersonalView(view)}>{t(`knowledge:domains.${view}`)}</button>)}
            </nav>
            <section key={personalView} className={`${styles.stage} ${styles.personalContent}`} style={cardStyle(3)}>
              {personalView !== 'profile' && <div className={styles.paneHeader}><h2 className={styles.paneTitle}>{t(`knowledge:domains.${personalView}`)}</h2></div>}
              {personalView === 'profile' && <UserPersonaTool expanded active={isOpen} onOpenReview={() => setPersonalView('review')} />}
              {personalView === 'review' && <MemoryReviewTool expanded active={isOpen} domain="user" />}
              {personalView === 'settings' && <PersonalMemorySettingsPanel />}
            </section>
          </> : <>
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
                {item !== 'audit' && <span className={styles.paneCount}>{tabCounts[item]}</span>}
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
                {item !== 'audit' && <span className={styles.paneCount}>{tabCounts[item]}</span>}
              </button>
            ))}
            <button type="button" className={`${styles.navButton} ${tab === 'settings' ? styles.navActive : ''}`} aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => activateTab('settings')}>{TAB_LABELS.settings}</button>
          </nav>
          <section key={tab} className={styles.stage} style={cardStyle(3)} aria-busy={tab !== 'settings' && loadState === 'loading'}>
            <div className={styles.paneHeader}>
              <div className={styles.paneTitle}>{paneTitle}</div>
              {tab !== 'settings' && tab !== 'audit' && <span className={styles.paneCount} aria-label={t('knowledge:aria.paneCount', { title: paneTitle })}>{paneCount}</span>}
            </div>
            {tab === 'settings' && <div className={styles.settingsContent}><KnowledgeSettingsPanel /></div>}
            {tab !== 'settings' && tab !== 'audit' && loadState === 'loading' && <CardSkeleton lines={4} label={t('knowledge:state2.loadingRecords')} />}
            {tab !== 'settings' && tab !== 'audit' && loadState === 'error' && <StateBlock title={t('knowledge:state2.workbenchUnavailable')} detail={loadError} />}
            {tab !== 'settings' && loadState === 'idle' && snapshot && <>
              {tab === 'inbox' && <CardCollection title={t('knowledge:inbox.empty.title')} detail={t('knowledge:inbox.empty.detail')} cards={candidatesForTab(snapshot, 'inbox', 'engineering').map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'library' && <CardCollection title={t('knowledge:library.empty.title')} detail={t('knowledge:library.empty.detail')} cards={snapshot.libraryCards} selectedId={selectedId} onSelect={selectCandidate} />}
              {tab === 'search' && <SearchLab query={query} onQueryChange={setQuery} cards={searchCards} state={searchState} selectedId={selectedId} onSelect={(card) => { setSelectedSearch({ ...recordFromCard(card), confidence: card.score, scoreKind: 'search' }); setSelectedId(card.id) }} />}
              {tab === 'wiki' && <div className={styles.wikiSections}>
                <details><summary>Propose a wiki page from Notes</summary><NoteWikiEditor /></details>
                <CardCollection title={t('knowledge:wiki.published.empty.title')} detail={t('knowledge:wiki.published.empty.detail')} cards={snapshot ? publishedWikiCards(snapshot) : []} selectedId={selectedId} onSelect={selectCandidate} />
                <CardCollection title={t('knowledge:wiki.empty.title')} detail={t('knowledge:wiki.empty.detail')} cards={snapshot.wikiPatches.map(cardFromCandidate)} selectedId={selectedId} onSelect={selectCandidate} />
              </div>}
              {tab === 'graph' && <KnowledgeGraphCanvas key={snapshot.loadedAt} snapshot={snapshot} selectedId={selectedId} resolveRecord={resolveCanvasRecord} onSelect={selectGraph} />}
            </>}
              {tab === 'audit' && <div className={styles.recordsContent}>
                {/* Note: record views use the settings-style text tabs — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md */}
                <nav className={`${tabStyles.strip} ${styles.recordsTabs}`} role="tablist" aria-label={t('knowledge:summary.recordArea')}>
                  {RECORD_TABS.map((item, index) => <button key={item} type="button" role="tab" className={tabStyles.tab}
                    id={`${recordTabId}-${item}`} aria-controls={`${recordTabId}-panel`} aria-selected={recordTab === item}
                    tabIndex={recordTab === item ? 0 : -1} onClick={() => { setRecordTab(item); clearDetail() }}
                    onKeyDown={event => {
                      const next = event.key === 'Home' ? 0 : event.key === 'End' ? RECORD_TABS.length - 1
                        : event.key === 'ArrowRight' ? (index + 1) % RECORD_TABS.length
                          : event.key === 'ArrowLeft' ? (index + RECORD_TABS.length - 1) % RECORD_TABS.length : -1
                      if (next < 0) return
                      event.preventDefault()
                      if (next === index) return
                      setRecordTab(RECORD_TABS[next]!)
                      clearDetail()
                      document.getElementById(`${recordTabId}-${RECORD_TABS[next]}`)?.focus()
                    }}>{t(item === 'processing' ? 'knowledge:summary.processingRecords' : 'knowledge:summary.auditRecords')}</button>)}
                </nav>
                <div className={styles.recordsPanel} role="tabpanel" id={`${recordTabId}-panel`} aria-labelledby={`${recordTabId}-${recordTab}`} tabIndex={0}>
                {recordTab === 'processing' ? <>
                  <AutomationRecords active={isOpen} attentionOnly={attentionOnly} onFilterChange={setAttentionOnly} onChanged={() => void refresh()} />
                  <details className={styles.legacyProcessing}><summary>{t('knowledge:summary.captureDetails')}</summary>
                    <p>{t('knowledge:summary.captureHint')}</p>
                    <KnowledgeStatusBar stats={procStats} busy={procBusy} onProcessNow={() => void processNow()} />
                  </details>
                </> : <><AuditRecords selectedId={selectedAudit?.id} onSelect={setSelectedAudit} /><details className={styles.legacyProcessing}><summary>{t('knowledge:observation.history')}</summary><ObservationRevocations /></details></>}
                </div>
              </div>}
          </section>
          {detailAnim.rendered ? (
            <aside
              className={styles.rightPane}
              style={cardStyle(4)}
              data-visible={detailAnim.visible ? 'true' : 'false'}
              aria-hidden={detailAnim.visible ? undefined : 'true'}
            >
              {shownAudit ? <AuditDetail key={shownAudit.id} event={shownAudit} onClose={clearDetail} /> : <Inspector automation={automation} record={shownSelected} snapshot={snapshot} busy={reviewBusy} error={reviewError} onApprove={replacement => void review('apply', replacement)} onReject={() => void review('reject')} onRevoke={() => void revoke()} onCloseDetail={clearDetail} />}
            </aside>
          ) : null}
          </>}
        </main>
      </section>
    </div>,
    document.body,
  )
}

function candidatesForTab(snapshot: KnowledgeWorkbenchSnapshot, tab: KnowledgeWorkbenchTab, scope: InboxScopeFilter = 'all'): Candidate[] {
  const candidates: Candidate[] = [...snapshot.factCandidates, ...snapshot.wikiPatches, ...snapshot.graphCandidates]
  if (tab !== 'inbox') return []
  // §5: llm-preferred reorders only the Inbox view, never the stored lists.
  // Memory separation: the scope filter then splits the same proposed list
  // into person/engineering review columns.
  const proposed = sortInboxCandidates(candidates.filter((candidate) => candidate.status === 'proposed'), snapshot.mode)
  return filterInboxByScope(proposed, scope)
}

/** Phase 4 Wiki: published pages already ride along in libraryCards. */
export function publishedWikiCards(snapshot: KnowledgeWorkbenchSnapshot): KnowledgeCard[] {
  return snapshot.libraryCards.filter((card) => card.kind === 'wiki')
}

/** Resolve current published Wiki nodes; evidence nodes carry their own read-only records. */
export function resolveGraphRecord(
  snapshot: KnowledgeWorkbenchSnapshot,
  id: string,
): InspectorRecord | null {
  const node = buildKnowledgeGraphView(snapshot).nodes.find(item => item.id === id)
  return node ? recordForGraphNode(node) : null
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
  scope: InboxScopeFilter = 'all',
): string {
  if (resolveRecordForTab(snapshot, tab, currentId)) return currentId
  if (tab === 'library') return snapshot.libraryCards[0]?.id ?? ''
  if (tab === 'inbox') return candidatesForTab(snapshot, tab, scope)[0]?.id ?? ''
  if (tab === 'wiki') {
    return snapshot.wikiPatches[0]?.id ?? publishedWikiCards(snapshot)[0]?.id ?? ''
  }
  if (tab === 'graph') {
    const firstPage = publishedGraphPages(snapshot)[0]
    return firstPage ? graphWikiId(firstPage) : ''
  }
  return ''
}

function CardCollection({ title, detail, cards, selectedId, onSelect }: { title: string; detail: string; cards: KnowledgeCard[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!cards.length) return <StateBlock title={title} detail={detail} />
  return <div className={`${styles.cardGrid} ${surface.grid} ${surface.enter}`}>{cards.map((card) => <KnowledgeCardTile key={card.id} card={card} active={card.id === selectedId} onSelect={() => onSelect(card.id)} />)}</div>
}

function SearchLab({ query, onQueryChange, cards, state, selectedId, onSelect }: { query: string; onQueryChange: (value: string) => void; cards: KnowledgeCard[]; state: 'idle' | 'loading' | 'unavailable'; selectedId: string; onSelect: (card: KnowledgeCard) => void }) {
  const { t } = useI18n('knowledge')
  return <div className={styles.searchLab}><div className={styles.searchPanel}><div className={styles.cardTopline}><span>{t('knowledge:searchLab.controlledRecall')}</span><span>{t('knowledge:searchLab.bm25')}</span></div><input className={styles.largeInput} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('knowledge:searchLab.placeholder')} /></div><div className={styles.searchResults}>{!query.trim() && <StateBlock title={t('knowledge:searchLab.enterQuery')} compact />}{query.trim() && state === 'loading' && <StateBlock title={t('knowledge:searchLab.searching')} compact />}{query.trim() && state === 'unavailable' && <StateBlock title={t('knowledge:searchLab.unavailable.title')} detail={t('knowledge:searchLab.unavailable.detail')} compact />}{query.trim() && state === 'idle' && !cards.length && <StateBlock title={t('knowledge:searchLab.noMatches.title')} detail={t('knowledge:searchLab.noMatches.detail')} compact />}{cards.map((card) => <KnowledgeCardTile search key={card.id} card={card} active={card.id === selectedId} onSelect={() => onSelect(card)} />)}</div></div>
}

function KnowledgeCardTile({ card, active, onSelect, search = false }: { card: KnowledgeCard; active?: boolean; onSelect: () => void; search?: boolean }) {
  const { t } = useI18n('knowledge')
  return (
    <button type="button" className={`${surface.card} ${styles.reviewCard} ${active ? styles.reviewCardActive : ''}`} onClick={onSelect}>
      <div className={styles.cardTopline}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <QuantumTopologyPreview kind={card.kind} name={card.title} size="icon" />
          <span>{t(card.rawType === 'wiki-patch' ? 'knowledge:reviewContent.types.wikiDraft' : card.kind === 'wiki' ? 'knowledge:reviewContent.types.wiki' : card.kind === 'fact' ? 'knowledge:reviewContent.types.fact' : card.kind === 'graph' ? 'knowledge:reviewContent.types.legacyGraph' : 'knowledge:reviewContent.types.evidence')}</span>
        </div>
        {search && <span>{t('knowledge:reviewContent.searchScore', { value: card.score.toFixed(2) })}</span>}
      </div>
      <strong title={card.title}>{card.title}</strong>
      {card.summary && <p title={card.summary}>{card.summary}</p>}
      <TagRow tags={card.tags} />
      <div className={styles.cardFoot}>{card.status ?? t('knowledge:card.statusActive')} - {t('knowledge:card.sourceRefs', { count: card.sourceRefs.observationIds.length })}</div>
    </button>
  )
}

export function Inspector({ automation, record, snapshot, busy, error, onApprove, onReject, onRevoke, onCloseDetail }: { automation: KnowledgeAutomationStatus | null; record: InspectorRecord | null; snapshot: KnowledgeWorkbenchSnapshot | null; busy: boolean; error: string; onApprove: (replacement?: ReviewCandidateInput['replacement']) => void; onReject: () => void; onRevoke: () => void; onCloseDetail: () => void }) {
  const { t } = useI18n('knowledge')
  const closeButton = useRef<HTMLButtonElement>(null)
  const open = Boolean(record)
  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus({ preventScroll: true })
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [open])
  if (!record) return <StateBlock title={t('knowledge:inspector.empty')} compact />
  const matches = record.recordType !== 'audit' && record.reviewType && snapshot ? [...snapshot.factCandidates, ...snapshot.wikiPatches, ...snapshot.graphCandidates]
    .filter(candidate => candidate.id === record.id && candidate.type === record.reviewType) : []
  const candidate = matches.length === 1 ? matches[0] : undefined
  const wikiPage = record.recordType !== 'audit' && record.kind === 'wiki' && !record.reviewType ? snapshot?.wikiPages?.find(page => page.workspaceId === record.workspaceId && (page.slug === record.pageSlug || JSON.stringify([page.workspaceId, page.slug]) === record.id || page.slug === record.id)) : undefined
  const canArchive = record.recordType !== 'audit' && !record.reviewType && !snapshot?.usingDemoData && Boolean(record.workspaceId)
    && (record.kind === 'wiki' ? wikiPage?.status === 'published' && wikiPage.freshness !== 'stale' : record.kind === 'fact' && record.status === 'active')
  const type = record.recordType === 'audit' ? 'audit' : record.kind === 'wiki' ? 'wiki' : record.kind === 'fact' ? 'fact' : record.kind === 'graph' ? 'legacyGraph' : 'evidence'
  const close = () => onCloseDetail()
  return <div className={styles.inspector} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  }}>
    <header className={styles.detailBar}><div className={styles.paneTitle}>{t('knowledge:reviewContent.detailTitle')}</div>
      <button ref={closeButton} type="button" className={styles.detailClose} onClick={close} aria-label={t('knowledge:inspector.closeDetail')} title={t('knowledge:inspector.closeDetail')}><X size={16} aria-hidden="true" /></button>
    </header>
    {candidate ? <MemoryReviewCard key={error} detail automation={automation} candidate={candidate} competing={competingCorrections(snapshot?.factCandidates ?? [], candidate)} disabled={busy || !!snapshot?.usingDemoData} onReview={(approve, replacement) => approve ? onApprove(replacement) : onReject()} />
      : <div className={styles.detailReading} tabIndex={0}>
        <span className={reviewStyles.cardMeta}>{t(`knowledge:reviewContent.types.${type}`)}</span>
        <h3 className={styles.inspectorTitle}>{record.title}</h3>
        {record.reviewType && <p role="status">{t('knowledge:reviewContent.recordUnavailable')}</p>}
        {record.recordType === 'audit' && <p>{t('knowledge:reviewContent.auditReadonly')}</p>}
        {record.kind === 'graph' && <p>{t('knowledge:reviewContent.legacyGraphHint')}</p>}
        {wikiPage ? <WikiPageDetail key={JSON.stringify([wikiPage.workspaceId, wikiPage.slug, wikiPage.version])} page={wikiPage} />
          : record.kind === 'wiki' ? <KnowledgeMarkdown content={record.body} /> : <p className={reviewStyles.plainText}>{record.body}</p>}
        {record.status && <KeyValue label={t('knowledge:inspector.status')} value={record.status} />}
        <TagRow tags={record.tags} />
        <details className={reviewStyles.diagnostics}><summary>{t('knowledge:reviewContent.evidence')}</summary>
          <KeyValue label={t('knowledge:inspector.sourceRefs')} value={record.sourceIds.join(', ') || t('knowledge:inspector.none')} />
          <KeyValue label={t('knowledge:inspector.files')} value={record.fileRefs.join(', ') || t('knowledge:inspector.none')} />
        </details>
        <details className={reviewStyles.diagnostics}><summary>{t('knowledge:reviewContent.diagnostics')}</summary>
          <p>{record.id} · {record.workspaceId}</p>
          <KeyValue label={t('knowledge:inspector.created')} value={formatDate(record.createdAt, t('knowledge:time.unknown'))} />
          {record.confidence !== undefined && <p>{t(record.scoreKind === 'search' ? 'knowledge:reviewContent.searchScore' : 'knowledge:reviewContent.extractionScore', { value: record.confidence.toFixed(2) })}</p>}
          {record.confidence !== undefined && <p>{t('knowledge:reviewContent.scoreMeaning')}</p>}
          {record.scoreExplanation && <p>{formatScoreExplanation(record.scoreExplanation)}</p>}
          {record.derivation && <p>{record.derivation}</p>}
        </details>
        {record.recordType !== 'audit' && record.kind === 'observation' && record.workspaceId && !snapshot?.usingDemoData && <ObservationRevokeControl key={JSON.stringify([record.workspaceId, record.id])} id={record.id} workspaceId={record.workspaceId} onRevoked={onRevoke} />}
      </div>}
    {error && <p className={reviewStyles.actionError} role="alert">{error}</p>}
    {canArchive && <footer className={reviewStyles.reviewFooter}><button className={reviewStyles.destructiveAction} type="button" disabled={busy} onClick={onRevoke}>{t('knowledge:action.archive')}</button></footer>}
    {snapshot?.usingDemoData && <p>{t('knowledge:inspector.demoNotice')}</p>}
  </div>
}

/** User memory M4: person-scoped candidates carry an explicit scope tag in the Inbox. */
function candidateScopeTag(candidate: Candidate): string[] {
  if (candidate.type === 'fact'
    && (candidate.fact.scope === 'user' || candidate.fact.provenance.workspaceId === 'user')) {
    return candidate.fact.tags.includes('persona') ? [] : ['persona']
  }
  return []
}

function cardFromCandidate(candidate: Candidate): KnowledgeCard {
  if (candidate.type === 'fact') return { id: candidate.id, kind: 'fact', title: candidate.fact.content, summary: candidate.fact.concepts.join(' - '), score: candidate.fact.confidence, tags: [...candidate.fact.tags, ...candidateScopeTag(candidate)], workspaceId: candidate.fact.provenance.workspaceId, workspacePath: candidate.fact.provenance.workspacePath, sourceRefs: { observationIds: candidate.fact.provenance.sourceObservationIds, fileRefs: candidate.fact.provenance.fileRefs }, createdAt: candidate.fact.provenance.createdAt, status: candidate.status, rawType: 'fact-candidate' }
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
  return { id: card.id, title: card.title, body: card.fullContent ?? card.summary, pageSlug: card.pageSlug, confidence: card.kind === 'fact' || card.scoreExplanation ? card.score : undefined, scoreKind: card.scoreExplanation ? 'search' : 'confidence', tags: card.tags, sourceIds: card.sourceRefs.observationIds, fileRefs: card.sourceRefs.fileRefs, createdAt: card.createdAt, status: card.status, reviewType, kind: card.kind, workspaceId: card.workspaceId, scoreExplanation: card.scoreExplanation }
}

/** Demo parity: one-line BM25 part list; always keeps bm25, drops zero parts. */
export function formatScoreExplanation(explanation: KnowledgeScoreExplanation): string {
  return (Object.entries(explanation) as Array<[keyof KnowledgeScoreExplanation, number]>)
    .filter(([part, value]) => part === 'bm25' || value !== 0)
    .map(([part, value]) => `${part} ${value.toFixed(2)}`)
    .join(' · ')
}

function KeyValue({ label, value }: { label: string; value: string }) { return <div className={styles.keyValue}><span>{label}</span><strong>{value}</strong></div> }
function TagRow({ tags }: { tags: string[] }) { return tags.length ? <div className={styles.tags}>{tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div> : null }
function StateBlock({ title, detail, compact }: { title: string; detail?: string; compact?: boolean }) { return <div className={`${styles.stateBlock} ${compact ? styles.stateBlockCompact : ''}`}><strong>{title}</strong>{detail && <span>{detail}</span>}</div> }
function formatDate(value: string | undefined, unknownLabel: string): string { if (!value) return unknownLabel; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString() }
