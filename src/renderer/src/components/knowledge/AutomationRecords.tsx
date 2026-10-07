import { useState } from 'react'
import { FileText, RotateCcw } from 'lucide-react'
import { useKnowledgeAutomation, refreshKnowledgeAutomation } from '../../services/knowledge-automation'
import { openAutomationView, useAutomationAction } from './AutomationStatus'
import { AutomationExplanation } from './AutomationExplanation'
import { automationAction, type AutomationReviewTarget, type AutomationSubjectState, type KnowledgeAutomationStatus, type KnowledgeAutomationTask } from '../../../../shared/knowledge-automation'
import { useI18n } from '@/i18n/useI18n'
import styles from './AutomationStatus.module.css'

export type ProcessingRecord = Pick<KnowledgeAutomationTask, 'stage' | 'subject' | 'status'> & Partial<KnowledgeAutomationTask> & {
  canRetry?: boolean; current?: boolean; reviewEnabled?: boolean; subjectState?: AutomationSubjectState
}
export function processingRecords(status: KnowledgeAutomationStatus): ProcessingRecord[] {
  const current = status.reviewStateVersion === 1 ? status.queue : []
  const ids = new Set(current.map(task => task.id))
  return [...current.map(task => ({ ...status.tasks.find(item => item.id === task.id), ...task, current: true, reviewEnabled: status.reviewEnabled !== false })),
    ...status.tasks.filter(task => !ids.has(task.id)).map(task => ({ ...task, current: false, canRetry: false, reviewEnabled: status.reviewEnabled !== false }))]
}

export function processingStatusKey(task: ProcessingRecord) {
  if (task.current === undefined) return 'knowledge:processing.statusUnavailable' as const
  if (!task.current && (task.status === 'needs-review' || task.status === 'failed')) return 'knowledge:processing.historicalIncomplete' as const
  if (task.status === 'needs-review') return task.subjectState?.kind === 'candidate' && task.subjectState.target.status === 'proposed'
    ? 'knowledge:processing.awaitingReview' as const : 'knowledge:processing.blocked' as const
  return `knowledge:automation.status.${task.status}` as const
}

export function ProcessingSubject({ task }: { task: ProcessingRecord }) {
  const { t } = useI18n('knowledge')
  const state = task.subjectState
  return <p className={styles.hint}>{t(!state ? 'knowledge:processing.unverified' : !task.current && state.kind === 'no-candidate' ? 'knowledge:processing.noCandidateHistory' : state.kind === 'candidate'
    ? `knowledge:processing.candidate.${state.target.status}` : `knowledge:processing.${state.kind}`)}</p>
}

export function ProcessingAction({ task, enabled, onChanged, onReview }: { task: ProcessingRecord; enabled: boolean; onChanged: () => void; onReview?: (target: AutomationReviewTarget) => Promise<void> }) {
  const { t } = useI18n('knowledge')
  const { busy, failed, run } = useAutomationAction(undefined, onChanged)
  const [attempted, setAttempted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [openFailed, setOpenFailed] = useState(false)
  const action = automationAction(task.reason)
  const target = task.subjectState?.kind === 'candidate' ? task.subjectState.target : undefined
  const openReview = async () => {
    if (opening || !target || !onReview) return
    setOpening(true); setOpenFailed(false)
    try { await onReview(target) } catch { setOpenFailed(true) }
    finally { setOpening(false) }
  }
  return <div className={styles.actionButtons}>
    {task.current && task.id && task.canRetry && action !== 'manual' && <button type="button" disabled={busy || !enabled} onClick={() => { setAttempted(true); void run(false, task.id) }}>
      <RotateCcw size={13} aria-hidden="true" />
      {t(busy ? 'knowledge:automationExplain.working' : action === 'recover' ? 'knowledge:automationExplain.recover' : 'knowledge:automationExplain.retry')}
    </button>}
    {target?.status === 'proposed' && onReview && <button type="button" disabled={opening || busy || !task.reviewEnabled} onClick={() => void openReview()}>{t('knowledge:processing.openInbox')}</button>}
    {task.current && (task.reason === 'stage-not-configured' || task.status === 'failed') && <button type="button" onClick={() => openAutomationView('settings')}>{t('knowledge:automationExplain.configured')}</button>}
    {openFailed && <p role="alert">{t('knowledge:processing.targetChanged')}</p>}
    {failed && <p role="alert">{t('knowledge:automation.actionFailed')}</p>}
    {attempted && !busy && !failed && <p role="status">{t('knowledge:automationExplain.result')}: {t(processingStatusKey(task))}</p>}
  </div>
}

// Note: task cards share aligned controls and readable status hierarchy; see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function AutomationRecords({ active, attentionOnly, onFilterChange, onChanged, selectedId, onSelect, onReview }: {
  active: boolean; attentionOnly: boolean; onFilterChange: (value: boolean) => void; onChanged: () => void
  selectedId?: string; onSelect?: (task: ProcessingRecord) => void; onReview?: (target: AutomationReviewTarget) => Promise<void>
}) {
  const { t } = useI18n('knowledge')
  const { status, error } = useKnowledgeAutomation(active)
  const records = status ? processingRecords(status) : []
  const current = records.filter(task => task.current && (!attentionOnly || task.status === 'failed' || task.status === 'needs-review'))
  const history = records.filter(task => !task.current)
  const render = (task: ProcessingRecord) => <article className={styles.task} key={task.id} data-selected={selectedId === task.id || undefined}>
    <div className={styles.taskHeading}><strong>{task.displayTitle || t(`knowledge:automation.stage.${task.stage}`)}</strong><span className={styles.taskStatus} data-status={task.current ? task.status : 'history'}>{t(processingStatusKey(task))}</span></div>
    <p className={styles.hint}>{t(`knowledge:automation.stage.${task.stage}`)}{task.updatedAt && <> · <time>{new Date(task.updatedAt).toLocaleString()}</time></>}</p>
    {!task.current && <p className={styles.hint}>{t('knowledge:processing.historyHint')}</p>}
    <ProcessingSubject task={task} />
    <AutomationExplanation reason={task.reason} status={task.status} showNext={task.current === true} />
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
      <p className={styles.hint}>{t('knowledge:processing.currentHint')}</p>
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
