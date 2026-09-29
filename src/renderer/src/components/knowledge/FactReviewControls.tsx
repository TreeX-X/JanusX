import { useEffect, useState } from 'react'
import type { CandidateFact } from '../../../../shared/knowledge'
import type { FactReviewContext, ReviewCandidateInput } from '../../../../shared/ipc/knowledge'
import { reviewCandidateInput, reviewCandidateSnapshot } from '../../../../shared/review-candidate-snapshot'
import { useI18n } from '@/i18n/useI18n'
import styles from './MemoryReviewTool.module.css'

export function FactReviewControls({ candidate, disabled, onApprove }: {
  candidate: CandidateFact; disabled: boolean; onApprove: (replacement?: ReviewCandidateInput['replacement']) => void
}) {
  const { t } = useI18n('knowledge')
  const snapshot = reviewCandidateSnapshot(candidate)
  const [loaded, setLoaded] = useState<{ snapshot: string; context: FactReviewContext }>()
  const [error, setError] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let current = true
    setLoaded(undefined); setError(false); setConfirmed(false)
    void reviewCandidateInput(candidate).then(input => window.electron.knowledge.factReviewContext(input))
      .then(context => { if (current) setLoaded({ snapshot, context }) })
      .catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [candidate, snapshot, retry])
  const context = loaded?.snapshot === snapshot ? loaded.context : undefined
  const target = context?.targets[0]
  return <div className={styles.factReview}>
    {error && <p role="alert">{t('knowledge:review.conflictLoadFailed')}</p>}
    {!context && !error && <p role="status">{t('knowledge:review.checkingConflicts')}</p>}
    {context?.factKey && <p>{t('knowledge:review.singleValue')}: {t(context.factKey === 'release.command' ? 'knowledge:review.slotRelease' : 'knowledge:review.slotLanguage')}</p>}
    {!!context?.competing.length && <div><strong>{t('knowledge:review.competingValues')}</strong>{context.competing.map(item => <p key={item.id}>{item.content}</p>)}</div>}
    {context?.targets.map(item => <blockquote key={item.id}><strong>{t('knowledge:review.currentValue', { version: item.version })}</strong><p>{item.content}</p></blockquote>)}
    {context?.blocked && <p role="alert">{t('knowledge:review.conflictBlocked')}</p>}
    {target && !context?.blocked && <label><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />{t('knowledge:review.confirmReplacement')}</label>}
    <button type="button" disabled={disabled || !context || !!context.blocked || !!target && !confirmed}
      onClick={() => onApprove(target ? { id: target.id, hash: target.hash } : undefined)}>{t(target ? 'knowledge:review.approveReplacement' : 'knowledge:action.approve')}</button>
    <button type="button" disabled={disabled} onClick={() => { setLoaded(undefined); setConfirmed(false); setRetry(value => value + 1) }}>{t('knowledge:review.refreshConflicts')}</button>
  </div>
}
