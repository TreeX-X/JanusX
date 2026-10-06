import { reviewCandidateInput, reviewCandidateSnapshot } from '../../../../shared/review-candidate-snapshot'
import type { ReviewCandidateInput } from '../../../../shared/ipc/knowledge'
import { FactReviewControls } from './FactReviewControls'
import { AutomationStatus } from './AutomationStatus'
import { LegacyEpisodeMigrationControl } from './LegacyEpisodeMigrationControl'
// Note: one review surface preserves engineering and private memory ownership — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { useCallback, useEffect, useRef, useState } from 'react'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import { useKnowledgeAutomation, refreshKnowledgeAutomation } from '../../services/knowledge-automation'
import { useCandidateReviewState, assertCandidateCanReview } from './candidateReviewState'
import type { KnowledgeAutomationStatus } from '../../../../shared/knowledge-automation'
import { applyKnowledgeCandidate, rejectKnowledgeCandidate } from '../../services/knowledge'
import { competingCorrections, countInboxScopes, filterInboxByScope, isUserScopeCandidate, type InboxCandidate, type InboxScopeFilter } from './inboxScope'
import { WikiCandidateSources, WikiRelations, WikiCandidateComparison } from './NoteWikiLinks'
import { KnowledgeMarkdown } from './KnowledgeMarkdown'
import { CandidateEvidence } from './CandidateEvidence'
import surface from './MemorySurface.module.css'
import styles from './MemoryReviewTool.module.css'
import { CardSkeleton } from '../shared/CardFrame'

/** A failed domain read must not masquerade as an empty review queue. */
export async function loadReviewCandidates(engineering = true): Promise<InboxCandidate[]> {
  const [facts, wiki, graph] = await Promise.all([
    window.electron.knowledge.listCandidates(),
    engineering ? window.electron.knowledge.listWikiPatchCandidates() : [],
    engineering ? window.electron.knowledge.listGraphCandidates() : [],
  ])
  return [...facts, ...wiki, ...graph].filter(candidate => candidate.status === 'proposed')
}

export function MemoryReviewTool({ active, domain, expanded = false }: { active: boolean; domain?: 'user' | 'engineering'; expanded?: boolean }) {
  const engineering = useExperimentalStore(s => s.knowledge) && domain !== 'user'
  const personal = useExperimentalStore(s => s.persona) && domain !== 'engineering'
  const { t } = useI18n('knowledge')
  const [candidates, setCandidates] = useState<InboxCandidate[]>([])
  const { status: automation } = useKnowledgeAutomation(active && engineering)
  const [scope, setScope] = useState<InboxScopeFilter>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const actionLock = useRef(false)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const next = (await loadReviewCandidates(engineering)).filter(candidate => isUserScopeCandidate(candidate) ? personal : engineering)
      if (request === generation.current) setCandidates(next)
    } catch {
      if (request === generation.current) setError(t('knowledge:error.loadFailed'))
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [t, engineering, personal])
  useEffect(() => {
    if (active) void refresh()
    const changed = () => { if (active) void refresh() }
    window.addEventListener('janusx-memory-changed', changed)
    return () => { generation.current += 1; window.removeEventListener('janusx-memory-changed', changed) }
  }, [active, refresh])

  const review = async (candidate: InboxCandidate, approve: boolean, replacement?: ReviewCandidateInput['replacement']) => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true)
    setError('')
    try {
      await assertCandidateCanReview(candidate)
      const input = await reviewCandidateInput(candidate)
      await (approve ? applyKnowledgeCandidate({ ...input, replacement }) : rejectKnowledgeCandidate(input))
      setCandidates(current => current.filter(item => item.type !== candidate.type || item.id !== candidate.id))
    } catch (reason) {
      setError(t(reason instanceof Error && reason.message.includes('Personal correction')
        ? 'knowledge:review.correctionStale'
        : reason instanceof Error && reason.message.includes('Legacy ') ? 'knowledge:review.legacyStale' : 'knowledge:review.failed'))
    } finally {
      actionLock.current = false
      setBusy(false)
    }
  }
  const importLegacy = async () => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await window.electron.knowledge.importLegacyPersonalMemory()
      setScope('user')
      setNotice(t('knowledge:review.legacyImported', result))
      await refresh()
    } catch {
      setError(t('knowledge:review.legacyFailed'))
    } finally {
      actionLock.current = false
      setBusy(false)
    }
  }
  const visibleCandidates = candidates.filter(candidate => isUserScopeCandidate(candidate) ? personal : engineering)
  const selectedScope = engineering && personal ? scope : personal ? 'user' : 'engineering'
  const counts = countInboxScopes(visibleCandidates)
  const selected = filterInboxByScope(visibleCandidates, selectedScope)
  const listClass = expanded ? `${surface.grid} ${surface.enter}` : styles.reviewList
  const filters = [
    { scope: 'all' as const, label: t('knowledge:inbox.scope.all'), count: visibleCandidates.length },
    { scope: 'engineering' as const, label: t('knowledge:inbox.scope.engineering'), count: counts.engineering },
    { scope: 'user' as const, label: t('knowledge:inbox.scope.personal'), count: counts.user },
  ]
  return <section className={styles.root} data-expanded={expanded || undefined} aria-label={t('knowledge:review.title')}>
    {!domain && <div className={styles.filters} role="group" aria-label={t('knowledge:inbox.scope.label')}>
      {filters.filter(filter => filter.scope === 'all' ? engineering && personal : filter.scope === 'user' ? personal : engineering).map(filter => <button key={filter.scope} type="button" aria-pressed={selectedScope === filter.scope} onClick={() => setScope(filter.scope)}>{filter.label} {loading || error ? '—' : filter.count}</button>)}
    </div>}
    <div className={styles.body} aria-busy={loading || busy}>
      {engineering && <AutomationStatus active={active} hidden={selectedScope === 'user'} onChanged={() => void refresh()} />}
      {selectedScope === 'user' && <p className={styles.personalHint}>{t('knowledge:review.personalManual')}</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <CardSkeleton lines={4} label={t('knowledge:state.loading.title')} />}
      {!loading && <>
        <h4 className={styles.groupTitle}>{t('knowledge:review.pendingContents', { count: error ? '—' : selected.length })}</h4>
        {!error && selected.length === 0 && <p>{t('knowledge:review.noManual')}</p>}
        <div className={listClass}>{selected.map(candidate => <MemoryReviewCard key={`${candidate.type}:${candidate.id}`} candidate={candidate} automation={automation} competing={competingCorrections(candidates, candidate)} disabled={busy || Boolean(error)} onReview={(approve, replacement) => void review(candidate, approve, replacement)} />)}</div>
      </>}
    </div>
    <footer className={styles.filters}>
      <button type="button" disabled={busy || loading} onClick={() => void refresh()}>{t(domain === 'user' ? 'knowledge:personalBoard.refresh' : 'knowledge:action.refresh')}</button>
      {personal && <details className={styles.moreActions}><summary>{t('knowledge:review.moreActions')}</summary><div className={styles.filters}>
        <LegacyEpisodeMigrationControl />
        <button type="button" disabled={busy || loading} onClick={() => void importLegacy()}>{t('knowledge:review.importLegacy')}</button>
      </div></details>}
    </footer>
  </section>
}


interface ReviewCardProps {
  candidate: InboxCandidate
  disabled: boolean
  onReview: (approve: boolean, replacement?: ReviewCandidateInput['replacement']) => void
  competing?: number
  automation: KnowledgeAutomationStatus | null
  detail?: boolean
}

// Note: both review entrances share content, evidence and applicable actions — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function MemoryReviewCard(props: ReviewCardProps) {
  return <ReviewCardContent key={reviewCandidateSnapshot(props.candidate)} {...props} />
}

function ReviewCardContent({ candidate, disabled, onReview, competing = 0, automation, detail = false }: ReviewCardProps) {
  const { t } = useI18n('knowledge')
  const personal = isUserScopeCandidate(candidate)
  const state = useCandidateReviewState(candidate, automation)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(false)
  const [evidenceBlocked, setEvidenceBlocked] = useState(false)
  const [wikiBlocked, setWikiBlocked] = useState(false)
  const [notesBlocked, setNotesBlocked] = useState(false)
  const sourceBlocked = evidenceBlocked || wikiBlocked || notesBlocked
  const retryLock = useRef(false)
  const retry = async () => {
    if (!state.taskId || retryLock.current) return
    retryLock.current = true; setRetrying(true); setRetryError(false)
    try { await window.electron.knowledge.automationRetry(state.taskId); await window.electron.knowledge.automationRun(); await refreshKnowledgeAutomation() }
    catch { setRetryError(true) }
    finally { retryLock.current = false; setRetrying(false) }
  }
  const provenance = candidate.type === 'fact' ? candidate.fact.provenance : candidate.type === 'wiki-patch' ? candidate.provenance : undefined
  const type = candidate.type === 'fact' ? 'fact' : candidate.type === 'wiki-patch' ? 'wikiDraft' : 'legacyGraph'
  const content = candidate.type === 'fact' ? candidate.fact.content : candidate.type === 'wiki-patch' ? candidate.patchMarkdown : `${candidate.edge.from} → ${candidate.edge.to} (${candidate.edge.type})`
  const title = candidate.type === 'wiki-patch' ? candidate.title : `${t(`knowledge:reviewContent.types.${type}`)} · ${content.split('\n')[0]?.slice(0, 90)}`
  return <article className={`${styles.card} ${detail ? styles.detailCard : surface.card}`} data-review-type={candidate.type}>
    <header className={styles.cardHeader}>
      <div className={styles.cardMeta}><span>{t(`knowledge:reviewContent.types.${type}`)}</span><span>{t(personal ? 'knowledge:inbox.scope.personal' : 'knowledge:inbox.scope.engineering')}</span></div>
      <h3>{title}</h3>
      <span className={styles.automaticState} data-review-state={state.status}>{t(`knowledge:review.currentState.${state.status}`)}</span>
      {state.reason && <p>{state.reason === 'stage-not-configured' ? t('knowledge:automation.configurationHint') : state.reason}</p>}
    </header>
    <div className={styles.cardContent} tabIndex={0} aria-label={t('knowledge:reviewContent.reading')}>
      {(state.status === 'pending' || state.status === 'running' || state.status === 'failed' || state.status === 'needs-review') && <details className={styles.diagnostics}>
        <summary>{t('knowledge:reviewContent.processingRecord')}</summary>
        <p>{t(candidate.type === 'wiki-patch' ? 'knowledge:automation.stage.wikiReview' : 'knowledge:automation.stage.entryReview')} · {t(`knowledge:review.currentState.${state.status}`)}</p>

      </details>}
      {candidate.type === 'graph-edge' && <p>{t('knowledge:reviewContent.legacyGraphHint')}</p>}
      {candidate.type === 'fact' && candidate.legacySource && <p>{t('knowledge:review.legacySource')}</p>}
      {candidate.type === 'fact' && candidate.personalCorrection && <section className={styles.section}>
        <h4>{t('knowledge:review.correctionTitle')}</h4>
        <p>{t('knowledge:persona.correctionOriginal')}: {candidate.personalCorrection.previousContent}</p>
        {competing > 0 && <p>{t('knowledge:review.correctionCompeting', { count: competing })}</p>}
      </section>}
      {personal && candidate.id.startsWith('remember-candidate:') && <p>{t('knowledge:review.explicitMemory')}</p>}
      {personal && candidate.id.startsWith('habit-candidate:') && <p>{t('knowledge:review.inferredHabit')}</p>}
      <section className={styles.section} aria-label={t('knowledge:reviewContent.body')}>
        <h4>{t('knowledge:reviewContent.body')}</h4>
        {candidate.type === 'wiki-patch' ? <KnowledgeMarkdown content={content} /> : <p>{content}</p>}
      </section>
      {candidate.type === 'wiki-patch' && <>
        <section className={styles.section}><h4>{t('knowledge:reviewContent.rationale')}</h4><p>{candidate.rationale}</p></section>
        <WikiRelations relations={candidate.relations} />
        <WikiCandidateComparison candidate={candidate} onBlocked={setWikiBlocked} />
        <WikiCandidateSources candidate={candidate} onBlocked={setNotesBlocked} />
      </>}
      <CandidateEvidence candidate={candidate} provenance={provenance} onBlocked={setEvidenceBlocked} />
      {!!candidate.conflicts?.length && <p>{t('knowledge:inspector.conflict', { detail: candidate.conflicts.join(', ') })}</p>}
      {candidate.type === 'fact' && candidate.fact.supersedes && <p>{t('knowledge:review.supersedes', { id: candidate.fact.supersedes })}</p>}
      <details className={styles.diagnostics}>
        <summary>{t('knowledge:reviewContent.diagnostics')}</summary>
        <p>{t(personal ? 'knowledge:review.personalUse' : 'knowledge:review.engineeringUse')}</p>
        <p>{candidate.id} · {candidate.derivation}</p>
        <p>{provenance?.workspaceName || provenance?.workspaceId || (candidate.type === 'graph-edge' ? candidate.edge.workspaceId : '')}</p>
        <p>{provenance?.fileRefs.join(' · ')}</p>
        {provenance?.model && <p>{provenance.model}</p>}
        <p>{t('knowledge:reviewContent.scoreMeaning')}</p>
      </details>
      {candidate.type === 'fact' && candidate.decision && <details className={styles.diagnostics}>
        <summary>{t('knowledge:review.historicalScoring')}</summary>
        <p>{candidate.decision.scorer.provider} · {candidate.decision.status} · {candidate.decision.reason}</p>
        <p>{t('knowledge:review.scoreCaution')}</p>
        <ul>{candidate.decision.answers.map(answer => <li key={answer.question}>{answer.question}: {String(answer.answer)} ({Math.round(answer.answer_confidence * 100)}%)</li>)}</ul>
        {candidate.decision.chunks?.map((chunk, index) => <details key={index}>
          <summary>{t('knowledge:inspector.sourceRefs')}: {chunk.evidenceRanges.map(range => `${range.observationId} [${range.start}, ${range.end})`).join(', ')}</summary>
          <ul>{chunk.answers.map(answer => <li key={answer.question}>{answer.question}: {String(answer.answer)} ({Math.round(answer.answer_confidence * 100)}%)</li>)}</ul>
        </details>)}
      </details>}
    </div>
    {(state.canReview || state.taskId || state.status === 'unknown') && <footer className={styles.reviewFooter}>
      {retryError && <p role="alert">{t('knowledge:automation.actionFailed')}</p>}
      {sourceBlocked && <p role="alert">{t('knowledge:reviewContent.checkSources')}</p>}
      {state.canReview && (candidate.type === 'fact'
        ? <FactReviewControls key={String(sourceBlocked)} candidate={candidate} disabled={disabled || retrying} approvalBlocked={sourceBlocked} onApprove={replacement => onReview(true, replacement)} onReject={() => onReview(false)} />
        : <div className={styles.actionButtons}><button className={styles.primaryAction} type="button" disabled={disabled || retrying || sourceBlocked} onClick={() => onReview(true)}>{t('knowledge:reviewContent.publishWiki')}</button><button className={styles.destructiveAction} type="button" disabled={disabled || retrying} onClick={() => onReview(false)}>{t('knowledge:action.reject')}</button></div>)}
      {state.taskId && <button type="button" disabled={disabled || retrying} onClick={() => void retry()}>{t('knowledge:automation.retry')}</button>}
      {state.status === 'unknown' && <button type="button" disabled={disabled} onClick={() => { void refreshKnowledgeAutomation(); window.dispatchEvent(new Event('janusx-memory-changed')) }}>{t('knowledge:action.refresh')}</button>}
    </footer>}
  </article>
}
