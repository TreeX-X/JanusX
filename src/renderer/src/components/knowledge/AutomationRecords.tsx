import { useKnowledgeAutomation, refreshKnowledgeAutomation } from '../../services/knowledge-automation'
import { useAutomationAction } from './AutomationStatus'
import { useI18n } from '@/i18n/useI18n'
import styles from './AutomationStatus.module.css'

/** Current exceptions and historical attempts have separate counts and actions. */
export function AutomationRecords({ active, attentionOnly, onFilterChange, onChanged }: {
  active: boolean; attentionOnly: boolean; onFilterChange: (value: boolean) => void; onChanged: () => void
}) {
  const { t } = useI18n('knowledge')
  const { status, error } = useKnowledgeAutomation(active)
  const { busy, failed, run } = useAutomationAction(undefined, onChanged)
  const queue = status?.reviewStateVersion === 1 ? status.queue : []
  const current = attentionOnly ? queue.filter(task => task.status === 'failed' || task.status === 'needs-review') : queue
  const currentIds = new Set(queue.map(task => task.id))
  const history = status?.tasks.filter(task => !currentIds.has(task.id)) ?? []
  return <section className={styles.root} aria-label={t('knowledge:summary.processingRecords')}>
    <div className={styles.actionButtons} role="group" aria-label={t('knowledge:summary.recordFilter')}>
      <button type="button" aria-pressed={!attentionOnly} onClick={() => onFilterChange(false)}>{t('knowledge:summary.allTasks')}</button>
      <button type="button" aria-pressed={attentionOnly} onClick={() => onFilterChange(true)}>{t('knowledge:summary.needsAttention')}</button>
      <button type="button" onClick={() => void refreshKnowledgeAutomation()}>{t('knowledge:summary.retry')}</button>
    </div>
    {(error || failed) && <p role="alert">{t(error ? 'knowledge:automation.loadFailed' : 'knowledge:automation.actionFailed')}</p>}
    {!status && !error && <p role="status">{t('knowledge:summary.loading')}</p>}
    {status && !error && <>
      <h4>{t('knowledge:summary.currentTasks')}</h4>
      {!current.length && <p>{t('knowledge:summary.noCurrentTasks')}</p>}
      {current.map((task, index) => <article className={styles.task} key={task.id ?? index}>
        <div className={styles.taskHeading}><strong>{task.displayTitle || t(`knowledge:automation.stage.${task.stage}`)}</strong><span>{t(`knowledge:automation.status.${task.status}`)}</span></div>
        <p>{t(`knowledge:automation.stage.${task.stage}`)}</p>
        {task.reason && <p>{task.reason === 'stage-not-configured' ? t('knowledge:automation.configurationHint') : task.reason}</p>}
        <details><summary>{t('knowledge:reviewContent.diagnostics')}</summary><p>{task.workspaceId} · {task.subject} · {task.id}</p></details>
        {task.id && task.canRetry && <button type="button" disabled={busy || status.running || !status.enabled} onClick={() => void run(false, task.id)}>{t('knowledge:automation.retry')}</button>}
      </article>)}
      {!attentionOnly && <>
        <h4>{t('knowledge:summary.recentTasks')}</h4>
        <p className={styles.hint}>{t('knowledge:summary.historyLimit')}</p>
        <p className={styles.hint}>{t('knowledge:automation.taskCountsHint')}</p>
        <p className={styles.hint}>{t('knowledge:automation.counts', status.counts)}</p>
        {!history.length && <p>{t('knowledge:summary.noHistory')}</p>}
        {history.map(task => <article className={styles.task} key={task.id}>
          <div className={styles.taskHeading}><strong>{task.displayTitle || t(`knowledge:automation.stage.${task.stage}`)}</strong><span>{t(`knowledge:automation.status.${task.status}`)}</span></div>
          <p>{t(`knowledge:automation.stage.${task.stage}`)} · <time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString()}</time></p>
          {task.reason && <p>{task.reason}</p>}
          <details><summary>{t('knowledge:reviewContent.diagnostics')}</summary>
            <p>{task.workspaceId} · {task.subject} · {task.id}</p>
            <p>{t(`knowledge:automation.provider.${task.model.provider}`)} / {task.model.model}</p>
          </details>
        </article>)}
      </>}
    </>}
  </section>
}
