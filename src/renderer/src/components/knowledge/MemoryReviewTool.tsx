// Note: personal candidate review survives engineering knowledge retirement — see .agents/notes/knowledge/personal-memory-workspace.md
import { useCallback, useEffect, useRef, useState } from 'react'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import { reviewCandidateInput, reviewCandidateSnapshot } from '../../../../shared/review-candidate-snapshot'
import type { CandidateFact } from '../../../../shared/knowledge'
import type { ReviewCandidateInput } from '../../../../shared/ipc/knowledge'
import { applyKnowledgeCandidate, rejectKnowledgeCandidate } from '../../services/knowledge'
import { competingCorrections, isUserScopeCandidate } from './inboxScope'
import { FactReviewControls } from './FactReviewControls'
import { CandidateEvidence } from './CandidateEvidence'
import { LegacyEpisodeMigrationControl } from './LegacyEpisodeMigrationControl'
import { CardSkeleton } from '../shared/CardFrame'
import surface from './MemorySurface.module.css'
import styles from './MemoryReviewTool.module.css'

export async function loadReviewCandidates(): Promise<CandidateFact[]> {
  return (await window.electron.knowledge.listCandidates()).filter(candidate => candidate.status === 'proposed' && isUserScopeCandidate(candidate))
}
export function MemoryReviewTool({ active, expanded = false }: { active: boolean; domain?: 'user' | 'engineering'; expanded?: boolean; showAutomation?: boolean }) {
  const personal = useExperimentalStore(s => s.persona)
  const { t } = useI18n('knowledge')
  const [candidates, setCandidates] = useState<CandidateFact[]>([])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const generation = useRef(0), actionLock = useRef(false)
  const refresh = useCallback(async () => {
    const request = ++generation.current; setLoading(true); setError('')
    try { const next = personal ? await loadReviewCandidates() : []; if (request === generation.current) setCandidates(next) }
    catch { if (request === generation.current) setError(t('knowledge:error.loadFailed')) }
    finally { if (request === generation.current) setLoading(false) }
  }, [t, personal])
  useEffect(() => {
    if (active) void refresh()
    const changed = () => { if (active) void refresh() }
    window.addEventListener('janusx-memory-changed', changed)
    return () => {
      // Invalidate every outstanding request, including refreshes started after mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      window.removeEventListener('janusx-memory-changed', changed)
    }
  }, [active, refresh])
  const review = async (candidate: CandidateFact, approve: boolean, replacement?: ReviewCandidateInput['replacement']) => {
    if (actionLock.current) return
    actionLock.current = true; setBusy(true); setError('')
    try {
      const input = await reviewCandidateInput(candidate)
      await (approve ? applyKnowledgeCandidate({ ...input, replacement }) : rejectKnowledgeCandidate(input))
      setCandidates(current => current.filter(item => item.id !== candidate.id))
    } catch (reason) {
      setError(t(reason instanceof Error && reason.message.includes('Personal correction') ? 'knowledge:review.correctionStale'
        : reason instanceof Error && reason.message.includes('Legacy ') ? 'knowledge:review.legacyStale' : 'knowledge:review.failed'))
    } finally { actionLock.current = false; setBusy(false) }
  }
  const importLegacy = async () => {
    if (actionLock.current) return
    actionLock.current = true; setBusy(true); setError(''); setNotice('')
    try { setNotice(t('knowledge:review.legacyImported', await window.electron.knowledge.importLegacyPersonalMemory())); await refresh() }
    catch { setError(t('knowledge:review.legacyFailed')) }
    finally { actionLock.current = false; setBusy(false) }
  }
  return <section className={styles.root} data-expanded={expanded || undefined} aria-label={t('knowledge:review.title')}>
    <div className={styles.body} aria-busy={loading || busy}>
      <p className={styles.personalHint}>{t('knowledge:review.personalManual')}</p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {loading ? <CardSkeleton lines={4} label={t('knowledge:state.loading.title')} /> : <>
        <h4 className={styles.groupTitle}>{t('knowledge:review.pendingContents', { count: error ? '—' : candidates.length })}</h4>
        {!error && !candidates.length && <p>{t('knowledge:review.noManual')}</p>}
        <div className={expanded ? `${surface.grid} ${surface.enter}` : styles.reviewList}>{candidates.map(candidate => <MemoryReviewCard
          key={reviewCandidateSnapshot(candidate)} candidate={candidate} competing={competingCorrections(candidates, candidate)} disabled={busy || Boolean(error)} onReview={(approve, replacement) => void review(candidate, approve, replacement)} />)}</div>
      </>}
    </div>
    <footer className={styles.filters}><button type="button" disabled={busy || loading} onClick={() => void refresh()}>{t('knowledge:personalBoard.refresh')}</button>
      {personal && <details className={styles.moreActions}><summary>{t('knowledge:review.moreActions')}</summary><div className={styles.filters}>
        <LegacyEpisodeMigrationControl /><button type="button" disabled={busy || loading} onClick={() => void importLegacy()}>{t('knowledge:review.importLegacy')}</button>
      </div></details>}
    </footer>
  </section>
}
export function MemoryReviewCard({ candidate, disabled, onReview, competing = 0 }: {
  candidate: CandidateFact; disabled: boolean; competing?: number; onReview(approve: boolean, replacement?: ReviewCandidateInput['replacement']): void
}) {
  const { t } = useI18n('knowledge'), [blocked, setBlocked] = useState(false)
  const provenance = candidate.fact.provenance
  return <article className={`${styles.card} ${surface.card}`} data-review-type="fact">
    <header className={styles.cardHeader}><div className={styles.cardMeta}>{t('knowledge:inbox.scope.personal')}</div><h3>{candidate.fact.content.split('\n')[0]?.slice(0, 90)}</h3><span>{t('knowledge:review.currentState.manual')}</span></header>
    <div className={styles.cardContent} tabIndex={0} aria-label={t('knowledge:reviewContent.reading')}>
      {candidate.legacySource && <p>{t('knowledge:review.legacySource')}</p>}
      {candidate.personalCorrection && <section className={styles.section}><h4>{t('knowledge:review.correctionTitle')}</h4><p>{candidate.personalCorrection.previousContent}</p>{competing > 0 && <p>{t('knowledge:review.correctionCompeting', { count: competing })}</p>}</section>}
      {candidate.id.startsWith('remember-candidate:') && <p>{t('knowledge:review.explicitMemory')}</p>}
      {candidate.id.startsWith('habit-candidate:') && <p>{t('knowledge:review.inferredHabit')}</p>}
      <section className={styles.section}><h4>{t('knowledge:reviewContent.body')}</h4><p>{candidate.fact.content}</p></section>
      <CandidateEvidence candidate={candidate} provenance={provenance} onBlocked={setBlocked} />
      {!!candidate.conflicts?.length && <p>{t('knowledge:inspector.conflict', { detail: candidate.conflicts.join(', ') })}</p>}
      {candidate.fact.supersedes && <p>{t('knowledge:review.supersedes', { id: candidate.fact.supersedes })}</p>}
      <details className={styles.diagnostics}><summary>{t('knowledge:reviewContent.diagnostics')}</summary><p>{t('knowledge:review.personalUse')}</p><p>{candidate.id} · {candidate.derivation}</p><p>{provenance.workspaceName || provenance.workspaceId}</p><p>{provenance.fileRefs.join(' · ')}</p></details>
      {candidate.decision && <details className={styles.diagnostics}><summary>{t('knowledge:review.historicalScoring')}</summary><p>{candidate.decision.scorer.provider} · {candidate.decision.reason}</p><p>{t('knowledge:review.scoreCaution')}</p>
        <ul>{candidate.decision.answers.map(answer => <li key={answer.question}>{answer.question}: {String(answer.answer)} ({Math.round(answer.answer_confidence * 100)}%)</li>)}</ul>
        {candidate.decision.chunks?.map((chunk, index) => <details key={index}><summary>{chunk.evidenceRanges.map(range => `${range.observationId} [${range.start}, ${range.end})`).join(', ')}</summary><ul>{chunk.answers.map(answer => <li key={answer.question}>{answer.question}: {String(answer.answer)} ({Math.round(answer.answer_confidence * 100)}%)</li>)}</ul></details>)}
      </details>}
    </div>
    <footer className={styles.reviewFooter}>{blocked && <p role="alert">{t('knowledge:reviewContent.checkSources')}</p>}<FactReviewControls candidate={candidate} disabled={disabled} approvalBlocked={blocked} onApprove={replacement => onReview(true, replacement)} onReject={() => onReview(false)} /></footer>
  </article>
}
