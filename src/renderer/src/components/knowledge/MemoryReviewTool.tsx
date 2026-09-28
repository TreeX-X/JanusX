// Note: one review surface preserves engineering and private memory ownership — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { applyKnowledgeCandidate, rejectKnowledgeCandidate } from '../../services/knowledge'
import { countInboxScopes, filterInboxByScope, isUserScopeCandidate, type InboxCandidate, type InboxScopeFilter } from './inboxScope'
import { WikiCandidateSources } from './NoteWikiLinks'
import styles from './MemoryReviewTool.module.css'

/** A failed domain read must not masquerade as an empty review queue. */
export async function loadReviewCandidates(): Promise<InboxCandidate[]> {
  const [facts, wiki, graph] = await Promise.all([
    window.electron.knowledge.listCandidates(),
    window.electron.knowledge.listWikiPatchCandidates(),
    window.electron.knowledge.listGraphCandidates(),
  ])
  return [...facts, ...wiki, ...graph].filter(candidate => candidate.status === 'proposed')
}

export function MemoryReviewTool({ active }: { active: boolean }) {
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
      const next = await loadReviewCandidates()
      if (request === generation.current) setCandidates(next)
    } catch {
      if (request === generation.current) setError(t('knowledge:error.loadFailed'))
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [t])
  useEffect(() => {
    if (active) void refresh()
    return () => { generation.current += 1 }
  }, [active, refresh])

  const review = async (candidate: InboxCandidate, approve: boolean) => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true)
    setError('')
    try {
      const input = { type: candidate.type, id: candidate.id }
      await (approve ? applyKnowledgeCandidate(input) : rejectKnowledgeCandidate(input))
      setCandidates(current => current.filter(item => item.type !== candidate.type || item.id !== candidate.id))
      await refresh()
    } catch (reason) {
      setError(t(reason instanceof Error && reason.message.includes('Legacy ')
        ? 'knowledge:review.legacyStale' : 'knowledge:review.failed'))
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
  const counts = countInboxScopes(candidates)
  const filters = [
    { scope: 'all' as const, label: t('knowledge:inbox.scope.all'), count: candidates.length },
    { scope: 'engineering' as const, label: t('knowledge:inbox.scope.engineering'), count: counts.engineering },
    { scope: 'user' as const, label: t('knowledge:inbox.scope.personal'), count: counts.user },
  ]
  return <section className={styles.root} aria-label={t('knowledge:review.title')}>
    <div className={styles.filters} role="group" aria-label={t('knowledge:inbox.scope.label')}>
      {filters.map(filter => <button key={filter.scope} type="button" aria-pressed={scope === filter.scope} onClick={() => setScope(filter.scope)}>{filter.label} {loading || error ? '—' : filter.count}</button>)}
    </div>
    <div className={styles.body} aria-busy={loading || busy}>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">{t('knowledge:state.loading.title')}</p>}
      {!loading && !error && filterInboxByScope(candidates, scope).length === 0 && <p>{t('knowledge:inbox.empty.title')}</p>}
      {!loading && filterInboxByScope(candidates, scope).map(candidate => <MemoryReviewCard key={`${candidate.type}:${candidate.id}`} candidate={candidate} disabled={busy || Boolean(error)} onReview={approve => void review(candidate, approve)} />)}
    </div>
    <footer className={styles.filters}>
      <button type="button" disabled={busy || loading} onClick={() => void refresh()}>{t('knowledge:action.refresh')}</button>
      <button type="button" disabled={busy || loading} onClick={() => void importLegacy()}>{t('knowledge:review.importLegacy')}</button>
    </footer>
  </section>
}

export function MemoryReviewCard({ candidate, disabled, onReview }: { candidate: InboxCandidate; disabled: boolean; onReview: (approve: boolean) => void }) {
  const { t } = useI18n('knowledge')
  const personal = isUserScopeCandidate(candidate)
  const provenance = candidate.type === 'fact' ? candidate.fact.provenance : candidate.type === 'wiki-patch' ? candidate.provenance : undefined
  const content = candidate.type === 'fact' ? candidate.fact.content : candidate.type === 'wiki-patch' ? candidate.patchMarkdown : `${candidate.edge.from} → ${candidate.edge.to} (${candidate.edge.type})`
  return <article className={styles.card}>
    <strong>{t(personal ? 'knowledge:inbox.scope.personal' : 'knowledge:inbox.scope.engineering')}</strong>
    <p>{t(personal ? 'knowledge:review.personalUse' : 'knowledge:review.engineeringUse')}</p>
    {candidate.type === 'fact' && candidate.legacySource && <p>{t('knowledge:review.legacySource')}</p>}
    {personal && candidate.id.startsWith('remember-candidate:') && <p>{t('knowledge:review.explicitMemory')}</p>}
    {personal && candidate.id.startsWith('habit-candidate:') && <p>{t('knowledge:review.inferredHabit')}</p>}
    <p>{content}</p>
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
      <button type="button" disabled={disabled} onClick={() => onReview(true)}>{t('knowledge:action.approve')}</button>
      <button type="button" disabled={disabled} onClick={() => onReview(false)}>{t('knowledge:action.reject')}</button>
    </div>
  </article>
}
