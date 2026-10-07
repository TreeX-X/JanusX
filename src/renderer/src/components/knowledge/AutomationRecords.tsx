import { useRef, useState } from 'react'
import { FileText, RotateCcw } from 'lucide-react'
import { useKnowledgeAutomation, refreshKnowledgeAutomation } from '../../services/knowledge-automation'
import { useAutomationAction } from './AutomationStatus'
import { AutomationExplanation } from './AutomationExplanation'
import { automationAction, type KnowledgeAutomationStatus, type KnowledgeAutomationTask } from '../../../../shared/knowledge-automation'
import { useI18n } from '@/i18n/useI18n'
import styles from './AutomationStatus.module.css'

export type ProcessingRecord = Pick<KnowledgeAutomationTask, 'stage' | 'subject' | 'status'> & Partial<KnowledgeAutomationTask> & { canRetry?: boolean }
export function processingRecords(status: KnowledgeAutomationStatus): ProcessingRecord[] {
  const current = status.reviewStateVersion === 1 ? status.queue : []
  const ids = new Set(current.map(task => task.id))
  return [...current.map(task => ({ ...status.tasks.find(item => item.id === task.id), ...task })), ...status.tasks.filter(task => !ids.has(task.id)).map(task => ({ ...task, canRetry: false }))]
}

export function ProcessingAction({ task, enabled, onChanged, onReview }: { task: ProcessingRecord; enabled: boolean; onChanged: () => void; onReview?: (id: string) => void }) {
  const { t } = useI18n('knowledge')
  const { busy, failed, run } = useAutomationAction(undefined, onChanged)
  const [attempted, setAttempted] = useState(false)
  const action = automationAction(task.reason)
  return <div className={styles.actionButtons}>
    {task.id && task.canRetry && action !== 'manual' && <button type="button" disabled={busy || !enabled} onClick={() => { setAttempted(true); void run(false, task.id) }}>
      <RotateCcw size={13} aria-hidden="true" />
      {t(busy ? 'knowledge:automationExplain.working' : action === 'recover' ? 'knowledge:automationExplain.recover' : 'knowledge:automationExplain.retry')}
    </button>}
    {action === 'manual' && onReview && task.stage !== 'extraction' && <button type="button" onClick={() => onReview(task.subject)}>{t('knowledge:automationExplain.manual')}</button>}
    {failed && <p role="alert">{t('knowledge:automation.actionFailed')}</p>}
    {attempted && !busy && !failed && <p role="status">{t('knowledge:automationExplain.result')}: {t(`knowledge:automation.status.${task.status}`)}</p>}
  </div>
}

// Note: task cards share aligned controls and readable status hierarchy; see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function AutomationRecords({ active, attentionOnly, onFilterChange, onChanged, selectedId, onSelect, onReview }: {
  active: boolean; attentionOnly: boolean; onFilterChange: (value: boolean) => void; onChanged: () => void
  selectedId?: string; onSelect?: (task: ProcessingRecord) => void; onReview?: (id: string) => void
}) {
  const { t } = useI18n('knowledge')
  const { status, error } = useKnowledgeAutomation(active)
  const queue = status?.reviewStateVersion === 1 ? status.queue : []
  const ids = new Set(queue.map(task => task.id))
  const records = status ? processingRecords(status) : []
  const attentionIds = useRef(new Set<string>())
  for (const task of records) if (ids.has(task.id) && (task.status === 'failed' || task.status === 'needs-review') && task.id) attentionIds.current.add(task.id)
  const current = records.filter(task => attentionOnly ? attentionIds.current.has(task.id ?? '') : ids.has(task.id))
  const history = records.filter(task => !ids.has(task.id))
  const render = (task: ProcessingRecord) => <article className={styles.task} key={task.id} data-selected={selectedId === task.id || undefined}>
    <div className={styles.taskHeading}><strong>{task.displayTitle || t(`knowledge:automation.stage.${task.stage}`)}</strong><span className={styles.taskStatus} data-status={task.status}>{t(`knowledge:automation.status.${task.status}`)}</span></div>
    <p className={styles.hint}>{t(`knowledge:automation.stage.${task.stage}`)}{task.updatedAt && <> · <time>{new Date(task.updatedAt).toLocaleString()}</time></>}</p>
    <AutomationExplanation reason={task.reason} status={task.status} />
    <div className={styles.taskActions}>
      {onSelect && <button type="button" data-processing-id={task.id} aria-pressed={selectedId === task.id} onClick={() => onSelect(task)}><FileText size={13} aria-hidden="true" />{t('knowledge:automationExplain.details')}</button>}
      <ProcessingAction task={task} enabled={status?.enabled ?? false} onReview={onReview} onChanged={onChanged} />
    </div>
  </article>
  return <section className={styles.root} aria-label={t('knowledge:summary.processingRecords')}>
    <div className={styles.actionButtons} role="group" aria-label={t('knowledge:summary.recordFilter')}>
      <button type="button" aria-pressed={!attentionOnly} onClick={() => onFilterChange(false)}>{t('knowledge:summary.allTasks')}</button>
      <button type="button" aria-pressed={attentionOnly} onClick={() => onFilterChange(true)}>{t('knowledge:summary.needsAttention')}</button>
      <button type="button" onClick={() => void refreshKnowledgeAutomation()}>{t('knowledge:summary.retry')}</button>
    </div>
    {error && <p role="alert">{t('knowledge:automation.loadFailed')}</p>}
    {!status && !error && <p role="status">{t('knowledge:summary.loading')}</p>}
    {status && !error && <>
      <h4>{t('knowledge:summary.currentTasks')}</h4>
      {!current.length && <p>{t('knowledge:summary.noCurrentTasks')}</p>}
      {current.map(render)}
      {!attentionOnly && <>
        <h4>{t('knowledge:summary.recentTasks')}</h4>
        <p className={styles.hint}>{t('knowledge:summary.historyLimit')}</p>
        <p className={styles.hint}>{t('knowledge:automation.taskCountsHint')}</p>
        <p className={styles.hint}>{t('knowledge:automation.counts', status.counts)}</p>
        {!history.length && <p>{t('knowledge:summary.noHistory')}</p>}
        {history.map(render)}
      </>}
    </>}
  </section>
}
