import type { ReviewScores } from '../../../../shared/knowledge-automation'
import { useI18n } from '@/i18n/useI18n'

export function automationReason(reason?: string, status?: string) {
  if (reason === 'historical') return 'historical'
  if (reason === 'automation-disabled') return 'disabled'
  if (reason === 'stage-not-configured') return 'config'
  if (reason === 'incomplete-task-evidence:turn-failed' || reason === 'incomplete-task-evidence:transcript-workspace-mismatch') return 'source'
  if (reason?.startsWith('incomplete-task-evidence:')) return 'missing'
  if (reason?.includes('exceeds') || reason?.includes('too-long')) return 'budget'
  if (reason === 'evidence-coverage-or-conflict-needs-review' || reason === 'wiki-missing-required-knowledge') return 'score'
  if (reason?.startsWith('source-') || reason?.startsWith('review-context-')) return 'source'
  if (reason?.includes('conflict') || reason?.includes('correction')) return 'conflict'
  if (status === 'succeeded') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'running' || status === 'pending') return status
  if (status === 'failed' || /^(model-|jev-|processing-failed|invalid-)/.test(reason ?? '')) return 'failed'
  return 'unknown'
}

export function AutomationExplanation({ reason, status, scores, detail = false }: { reason?: string; status?: string; scores?: ReviewScores; detail?: boolean }) {
  const { t } = useI18n('knowledge')
  const key = automationReason(reason, status)
  const proseReason = reason && /\s/.test(reason) && !/^[a-z]+-[a-z-]+/.test(reason)
  return <section aria-label={t('knowledge:automationExplain.title')}>
    <p>{proseReason ? reason : t(`knowledge:automationExplain.${key}`)}</p>
    <p>{t(`knowledge:automationExplain.${key}Next`)}</p>
    {scores ? <details open={detail || undefined}><summary>{t('knowledge:automationExplain.scores')}</summary>
      <p>{t('knowledge:automationExplain.threshold')}: {scores.threshold.toFixed(2)}</p>
      <ul>{([['support', scores.support], ['consistent', scores.consistent], ...scores.coverage.map(value => ['coverage', value] as const)] as const).map(([label, value], index) => <li key={index}>
        {t(`knowledge:automationExplain.${label}`)}: {value.toFixed(2)} · {t(value >= scores.threshold ? 'knowledge:automationExplain.passed' : 'knowledge:automationExplain.below')}
      </li>)}</ul>
    </details> : detail && key === 'score' && <p>{t('knowledge:automationExplain.scoreMissing')}</p>}
    {detail && reason && !proseReason && <details><summary>{t('knowledge:automationExplain.technical')}</summary><p>{reason}</p></details>}
  </section>
}
