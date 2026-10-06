import { useEffect, useRef, useState } from 'react'
import type { KnowledgeProvenance } from '../../../../shared/knowledge'
import type { InboxCandidate } from './inboxScope'
import { useI18n } from '@/i18n/useI18n'
import styles from './MemoryReviewTool.module.css'

/** The parent keys this reader to the complete candidate snapshot, never just its ID. */
export function CandidateEvidence({ candidate, provenance, onBlocked }: {
  candidate: InboxCandidate; provenance?: KnowledgeProvenance; onBlocked: (blocked: boolean) => void
}) {
  const { t } = useI18n('knowledge')
  const [reads, setReads] = useState<Record<string, { content?: string; failed?: boolean; revoked?: boolean; pending?: boolean }>>({})
  const requested = useRef(new Set<string>())
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onBlocked(Object.values(reads).some(read => read.pending || read.failed || read.revoked)) }, [reads, onBlocked])
  const quotes = candidate.evidence.sources ?? provenance?.sourceEvidence ?? []
  const identities = new Map<string, { id: string; workspaceId: string }>()
  for (const id of candidate.evidence.observationIds) {
    const sources = quotes.filter(source => source.observationId === id)
    const workspaces = sources.length ? sources.map(source => source.workspaceId) : [provenance?.workspaceId ?? '']
    for (const workspaceId of workspaces) identities.set(JSON.stringify([workspaceId, id]), { workspaceId, id })
  }
  const read = async (key: string, identity: { id: string; workspaceId: string }, retry = false) => {
    if (requested.current.has(key) && !retry) return
    requested.current.add(key)
    setReads(current => ({ ...current, [key]: { pending: true } }))
    try {
      if (!identity.workspaceId) throw new Error('unbound source')
      const result = await window.electron.knowledge.observationRevocationContext(identity)
      if (mounted.current) setReads(current => ({ ...current, [key]: { content: result.content, revoked: result.revoked } }))
    } catch { if (mounted.current) setReads(current => ({ ...current, [key]: { failed: true } })) }
  }
  return <section className={styles.section} aria-label={t('knowledge:reviewContent.evidence')}>
    <h4>{t('knowledge:reviewContent.evidence')}</h4>
    {!identities.size && <p>{t('knowledge:reviewContent.noEvidence')}</p>}
    {quotes.map((source, index) => <blockquote key={index}>
      <p>{source.excerpt.slice(0, 600)}{source.excerpt.length > 600 ? '…' : ''}</p>
      <small>{source.speaker} · {source.authority} · {source.workspaceId} · {source.observationId}</small>
    </blockquote>)}
    {[...identities].map(([key, identity]) => <details key={key} onToggle={event => { if (event.currentTarget.open) void read(key, identity) }}>
      <summary>{t('knowledge:reviewContent.readSource')} · {identity.id}</summary>
      {reads[key]?.pending && <p role="status">{t('knowledge:reviewContent.loadingSource')}</p>}
      {reads[key]?.failed && <div role="alert"><p>{t('knowledge:reviewContent.sourceUnavailable')}</p><button type="button" onClick={() => void read(key, identity, true)}>{t('knowledge:reviewContent.refreshSource')}</button></div>}
      {reads[key]?.revoked && <p role="alert">{t('knowledge:reviewContent.sourceRevoked')}</p>}
      {reads[key]?.content !== undefined && <pre className={styles.sourceText} tabIndex={0}>{reads[key]?.content}</pre>}
    </details>)}
  </section>
}
