import { reviewCandidateInput } from '../../../../shared/review-candidate-snapshot'
import type { ReviewCandidateInput } from '../../../../shared/ipc/knowledge'
import { FactReviewControls } from './FactReviewControls'
import { AutomationStatus } from './AutomationStatus'
import { LegacyEpisodeMigrationControl } from './LegacyEpisodeMigrationControl'
// Note: one review surface preserves engineering and private memory ownership — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { useCallback, useEffect, useRef, useState } from 'react'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import type { CandidateFact } from '../../../../shared/knowledge'
import { memoryCandidateSnapshot } from '../../../../shared/memory-candidate-snapshot'
import { applyKnowledgeCandidate, rejectKnowledgeCandidate } from '../../services/knowledge'
import { competingCorrections, countInboxScopes, filterInboxByScope, isUserScopeCandidate, type InboxCandidate, type InboxScopeFilter } from './inboxScope'
import { WikiCandidateSources } from './NoteWikiLinks'
import styles from './MemoryReviewTool.module.css'

/** A failed domain read must not masquerade as an empty review queue. */
export async function loadReviewCandidates(engineering = true): Promise<InboxCandidate[]> {
  const [facts, wiki, graph] = await Promise.all([
    window.electron.knowledge.listCandidates(),
    engineering ? window.electron.knowledge.listWikiPatchCandidates() : [],
    engineering ? window.electron.knowledge.listGraphCandidates() : [],
  ])
  return [...facts, ...wiki, ...graph].filter(candidate => candidate.status === 'proposed')
}

export function MemoryReviewTool({ active, domain }: { active: boolean; domain?: 'user' | 'engineering' }) {
  const engineering = useExperimentalStore(s => s.knowledge) && domain !== 'user'
  const personal = useExperimentalStore(s => s.persona) && domain !== 'engineering'
  const { t } = useI18n('knowledge')
  const [candidates, setCandidates] = useState<InboxCandidate[]>([])
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
    return () => { generation.current += 1 }
  }, [active, refresh])

  const review = async (candidate: InboxCandidate, approve: boolean, replacement?: ReviewCandidateInput['replacement']) => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true)
    setError('')
    try {
      const input = await reviewCandidateInput(candidate)
      await (approve ? applyKnowledgeCandidate({ ...input, replacement }) : rejectKnowledgeCandidate(input))
      setCandidates(current => current.filter(item => item.type !== candidate.type || item.id !== candidate.id))
      await refresh()
      window.dispatchEvent(new Event('janusx-memory-changed'))
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
  const decide = async (candidate: CandidateFact, action: 'score' | 'refine') => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(memoryCandidateSnapshot(candidate)))
      const candidateHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      await window.electron.knowledge.candidateAction({ candidateId: candidate.id, candidateHash, action })
      setNotice(t(action === 'refine' ? 'knowledge:review.refinementQueued' : 'knowledge:review.scoreUpdated'))
      await refresh()
    } catch { setError(t('knowledge:review.failed')) }
    finally { actionLock.current = false; setBusy(false) }
  }
  const filters = [
    { scope: 'all' as const, label: t('knowledge:inbox.scope.all'), count: visibleCandidates.length },
    { scope: 'engineering' as const, label: t('knowledge:inbox.scope.engineering'), count: counts.engineering },
    { scope: 'user' as const, label: t('knowledge:inbox.scope.personal'), count: counts.user },
  ]
  return <section className={styles.root} aria-label={t('knowledge:review.title')}>
    <div className={styles.filters} role="group" aria-label={t('knowledge:inbox.scope.label')}>
      {filters.filter(filter => filter.scope === 'all' ? engineering && personal : filter.scope === 'user' ? personal : engineering).map(filter => <button key={filter.scope} type="button" aria-pressed={selectedScope === filter.scope} onClick={() => setScope(filter.scope)}>{filter.label} {loading || error ? '—' : filter.count}</button>)}
    </div>
    <div className={styles.body} aria-busy={loading || busy}>
      {engineering && <AutomationStatus active={active} onChanged={() => void refresh()} />}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">{t('knowledge:state.loading.title')}</p>}
      {!loading && !error && filterInboxByScope(visibleCandidates, selectedScope).length === 0 && <p>{t('knowledge:inbox.empty.title')}</p>}
      {!loading && filterInboxByScope(visibleCandidates, selectedScope).map(candidate => <MemoryReviewCard key={`${candidate.type}:${candidate.id}`} candidate={candidate} competing={competingCorrections(candidates, candidate)} disabled={busy || Boolean(error)} onReview={(approve, replacement) => void review(candidate, approve, replacement)} onDecision={candidate.type === 'fact' && !isUserScopeCandidate(candidate) ? action => void decide(candidate, action) : undefined} />)}
    </div>
    <footer className={styles.filters}>
      {personal && <LegacyEpisodeMigrationControl />}
      <button type="button" disabled={busy || loading} onClick={() => void refresh()}>{t('knowledge:action.refresh')}</button>
      {personal && <button type="button" disabled={busy || loading} onClick={() => void importLegacy()}>{t('knowledge:review.importLegacy')}</button>}
    </footer>
  </section>
}

export function MemoryReviewCard({ candidate, disabled, onReview, onDecision, competing = 0 }: { candidate: InboxCandidate; disabled: boolean; onReview: (approve: boolean, replacement?: ReviewCandidateInput['replacement']) => void; onDecision?: (action: 'score' | 'refine') => void; competing?: number }) {
  const { t } = useI18n('knowledge')
  const personal = isUserScopeCandidate(candidate)
  const provenance = candidate.type === 'fact' ? candidate.fact.provenance : candidate.type === 'wiki-patch' ? candidate.provenance : undefined
  const content = candidate.type === 'fact' ? candidate.fact.content : candidate.type === 'wiki-patch' ? candidate.patchMarkdown : `${candidate.edge.from} → ${candidate.edge.to} (${candidate.edge.type})`
  return <article className={styles.card}>
    <strong>{t(personal ? 'knowledge:inbox.scope.personal' : 'knowledge:inbox.scope.engineering')}</strong>
    <p>{t(personal ? 'knowledge:review.personalUse' : 'knowledge:review.engineeringUse')}</p>
    {candidate.type === 'fact' && candidate.legacySource && <p>{t('knowledge:review.legacySource')}</p>}
    {candidate.type === 'fact' && candidate.personalCorrection && <>
      <strong>{t('knowledge:review.correctionTitle')}</strong>
      <p>{t('knowledge:persona.correctionOriginal')}: {candidate.personalCorrection.previousContent}</p>
      {competing > 0 && <p>{t('knowledge:review.correctionCompeting', { count: competing })}</p>}
    </>}
    {personal && candidate.id.startsWith('remember-candidate:') && <p>{t('knowledge:review.explicitMemory')}</p>}
    {personal && candidate.id.startsWith('habit-candidate:') && <p>{t('knowledge:review.inferredHabit')}</p>}
    <p>{content}</p>
    {candidate.type === 'fact' && candidate.decision && <details>
      <summary>{t('knowledge:review.scoring')}</summary>
      <p>{candidate.decision.scorer.provider} · {candidate.decision.status} · {candidate.decision.reason}</p>
      <p>{t('knowledge:review.scoreCaution')}</p>
      <ul>{candidate.decision.answers.map(answer => <li key={answer.question}>{answer.question}: {String(answer.answer)} ({Math.round(answer.answer_confidence * 100)}%)</li>)}</ul>
      {candidate.decision.chunks?.map((chunk, index) => <details key={index}>
        <summary>{t('knowledge:inspector.sourceRefs')}: {chunk.evidenceRanges.map(range => `${range.observationId} [${range.start}, ${range.end})`).join(', ')}</summary>
        <ul>{chunk.answers.map(answer => <li key={answer.question}>{answer.question}: {String(answer.answer)} ({Math.round(answer.answer_confidence * 100)}%)</li>)}</ul>
      </details>)}
    </details>}
    <details>
      <summary>{t('knowledge:inspector.provenance')}</summary>
      <p>{candidate.type === 'fact' ? candidate.fact.kind : candidate.type} · {candidate.derivation}</p>
      <p>{provenance?.workspaceName || provenance?.workspaceId || (candidate.type === 'graph-edge' ? candidate.edge.workspaceId : '')}</p>
      <p>{provenance?.fileRefs.join(' · ')}</p>
      <p>{t('knowledge:card.sourceRefs', { count: candidate.evidence.observationIds.length })}: {candidate.evidence.observationIds.join(', ')}</p>
      {(candidate.evidence.sources ?? provenance?.sourceEvidence)?.map((source, index) => <blockquote key={index}><p>{source.excerpt}</p><small>{source.speaker} · {source.authority} · {source.workspaceId} · {source.observationId}</small></blockquote>)}
      {candidate.type === 'wiki-patch' && <WikiCandidateSources candidate={candidate} />}
      {candidate.type === 'fact' && candidate.fact.supersedes && <p>{t('knowledge:review.supersedes', { id: candidate.fact.supersedes })}</p>}
      {!!candidate.conflicts?.length && <p>{t('knowledge:inspector.conflict', { detail: candidate.conflicts.join(', ') })}</p>}
    </details>
    <div className={styles.filters}>
      {candidate.type === 'fact' ? <FactReviewControls candidate={candidate} disabled={disabled} onApprove={replacement => onReview(true, replacement)} /> : <button type="button" disabled={disabled} onClick={() => onReview(true)}>{t('knowledge:action.approve')}</button>}
      <button type="button" disabled={disabled} onClick={() => onReview(false)}>{t('knowledge:action.reject')}</button>
      {onDecision && candidate.type === 'fact' && candidate.derivation === 'deterministic' && !candidate.legacySource && !candidate.personalCorrection && !candidate.id.startsWith('remember-candidate:') && <>
        <button type="button" disabled={disabled} onClick={() => onDecision('score')}>{t('knowledge:review.rescore')}</button>
        <button type="button" disabled={disabled} onClick={() => onDecision('refine')}>{t('knowledge:review.refine')}</button>
      </>}
    </div>
  </article>
}
