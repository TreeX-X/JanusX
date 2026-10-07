import { useEffect, useRef } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { AutomationExplanation } from './AutomationExplanation'
import { ProcessingAction, ProcessingSubject, processingStatusKey, type ProcessingRecord } from './AutomationRecords'
import type { AutomationReviewTarget } from '../../../../shared/knowledge-automation'
import styles from './AuditRecords.module.css'

export function ProcessingDetail({ task, enabled, onClose, onChanged, onReview }: { task: ProcessingRecord; enabled: boolean; onClose: () => void; onChanged: () => void; onReview: (target: AutomationReviewTarget) => Promise<void> }) {
  const { t } = useI18n('knowledge')
  const root = useRef<HTMLElement>(null)
  useEffect(() => { root.current?.focus() }, [task.id])
  return <section ref={root} tabIndex={-1} className={styles.detail} aria-label={t('knowledge:automationExplain.details')} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <header><strong>{t('knowledge:summary.processingRecords')}</strong><button type="button" onClick={onClose}>{t('knowledge:automationExplain.close')}</button></header>
    <div className={styles.reading}>
      <h3>{task.displayTitle || t(`knowledge:automation.stage.${task.stage}`)}</h3>
      <p>{t(task.current === false ? 'knowledge:processing.pastResult' : 'knowledge:automationExplain.result')}: {t(processingStatusKey(task))}</p>
      {task.current === false && <p>{t('knowledge:processing.historyHint')}</p>}
      <ProcessingSubject task={task} />
      <AutomationExplanation reason={task.reason} status={task.status} scores={task.scores} detail showNext={task.current === true} />
      <ProcessingAction task={task} enabled={enabled} onChanged={onChanged} onReview={onReview} />
      <dl className={styles.metadata}>
        <dt>{t('knowledge:automationExplain.stage')}</dt><dd>{t(`knowledge:automation.stage.${task.stage}`)}</dd>
        {task.model && <><dt>{t('knowledge:automationExplain.model')}</dt><dd>{task.model.model}</dd></>}
        {task.updatedAt && <><dt>{t('knowledge:automationExplain.time')}</dt><dd>{new Date(task.updatedAt).toLocaleString()}</dd></>}
      </dl>
      <h4>{t('knowledge:automationExplain.history')}</h4>
      {!task.history?.length && <p>{t('knowledge:automationExplain.noHistory')}</p>}
      {[...(task.history ?? [])].reverse().map((attempt, index) => <section className={styles.change} key={index}>
        <time>{new Date(attempt.updatedAt).toLocaleString()}</time>
        <AutomationExplanation reason={attempt.reason} status={attempt.status} scores={attempt.scores} detail showNext={false} />
      </section>)}
      <details><summary>{t('knowledge:automationExplain.technical')}</summary><pre>{JSON.stringify(task, null, 2)}</pre></details>
    </div>
  </section>
}
