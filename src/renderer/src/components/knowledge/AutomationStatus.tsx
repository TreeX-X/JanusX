import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, LoaderCircle, RotateCw } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { KNOWLEDGE_STAGES, type KnowledgeAutomationStatus } from '../../../../shared/knowledge-automation'
import styles from './AutomationStatus.module.css'

// Note: mode, current work and human review have separate meanings — see .agents/notes/2026-10-04-assistant-persona-layout--6e9c114d.md
export function AutomationStatus({ active, beforeRun, disabled = false, hidden = false, onChanged, onOpenSettings, onStatusChange }: {
  active: boolean; disabled?: boolean; hidden?: boolean; beforeRun?: () => Promise<boolean>; onChanged?: () => void; onOpenSettings?: () => void
  onStatusChange?: (status: KnowledgeAutomationStatus | null) => void
}) {
  const { t } = useI18n('knowledge')
  const [status, setStatus] = useState<KnowledgeAutomationStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const changed = useRef(onChanged)
  changed.current = onChanged
  const statusChanged = useRef(onStatusChange)
  statusChanged.current = onStatusChange
  const actionLock = useRef(false)
  const lastCounts = useRef('')
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try { const next = await window.electron.knowledge.automationStatus(); if (request === generation.current) {
      setStatus(next); setError('')
      statusChanged.current?.(next)
      const counts = JSON.stringify([next.counts, next.queue, next.stages, next.enabled])
      if (lastCounts.current && lastCounts.current !== counts) changed.current?.()
      lastCounts.current = counts
    } }
    catch { if (request === generation.current) { setError(t('knowledge:automation.loadFailed')); statusChanged.current?.(null) } }
  }, [t])
  useEffect(() => {
    if (!active) return
    void refresh()
    const timer = setInterval(() => void refresh(), 5000)
    return () => { clearInterval(timer); invalidate() }
    function invalidate() { generation.current++ }
  }, [active, refresh])
  const run = async (backfill = false, taskId?: string) => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true); setError('')
    try {
      if (beforeRun && !await beforeRun()) return
      if (taskId) await window.electron.knowledge.automationRetry(taskId)
      await window.electron.knowledge.automationRun({ backfill })
      await refresh(); onChanged?.()
    } catch { setError(t('knowledge:automation.actionFailed')) }
    finally { actionLock.current = false; setBusy(false) }
  }
  const stages = status?.stages
  const automaticStages = stages ? (['entryReview', 'wikiGeneration', 'wikiReview'] as const).filter(stage => stages[stage] === 'automatic').length : 0
  const mode = !status?.enabled ? 'paused' : automaticStages === 0 ? 'unconfigured' : automaticStages < 3 || Object.values(stages ?? {}).includes('unconfigured') ? 'partial' : 'active'
  const queue = status?.queue ?? []
  const running = queue.find(task => task.status === 'running')
  const pending = queue.filter(task => task.status === 'pending').length
  const failed = queue.filter(task => task.status === 'failed').length
  const needsReview = queue.filter(task => task.status === 'needs-review').length
  const openSettings = () => onOpenSettings ? onOpenSettings() : window.dispatchEvent(new Event('janusx:open-knowledge-settings'))
  if (hidden) return null
  return <section className={styles.root} aria-label={t('knowledge:automation.progress')}>
    <div className={styles.overview}>
      <h4><Activity size={13} aria-hidden />{t('knowledge:automation.progress')}</h4>
      <details className={styles.actions}>
        <summary>{t('knowledge:review.moreActions')}</summary>
        <div className={styles.actionButtons}>
        <button type="button" disabled={busy || disabled || Boolean(error) || status?.running || !beforeRun && !status?.enabled} onClick={() => void run()}><RotateCw size={12} aria-hidden />{t('knowledge:automation.run')}</button>
        {beforeRun && <button type="button" disabled={busy || disabled} onClick={() => void run(true)}>{t('knowledge:automation.backfill')}</button>}
        </div>
      </details>
    </div>
    {status && !error && <>
      <div className={styles.summary} role="status">
        <span className={styles.state} data-mode={mode}>{t(`knowledge:automation.${mode}`)}</span>
        {status.enabled && (automaticStages > 0 || status.running || pending > 0) && <span className={styles.activity}>
          {status.running && <LoaderCircle size={12} className={styles.spinner} aria-hidden />}
          {running ? t('knowledge:automation.runningStage', { stage: t(`knowledge:automation.stage.${running.stage}`) })
            : status.running ? t('knowledge:automation.processing') : pending ? t('knowledge:automation.queued', { count: pending })
              : failed || needsReview ? t('knowledge:automation.waitingForReview') : t('knowledge:automation.idle')}
        </span>}
      </div>
      <p className={styles.hint}>{t(mode === 'paused' ? 'knowledge:automation.pausedHint' : mode === 'unconfigured' ? 'knowledge:automation.configurationHint' : 'knowledge:automation.backgroundHint')}</p>
      {(failed > 0 || needsReview > 0) && <p className={styles.attention}>{t('knowledge:automation.attention', { failed, review: needsReview })}</p>}
      <details className={styles.configuration}>
        <summary>{t('knowledge:automation.stageDetails')}</summary>
        <ul>{KNOWLEDGE_STAGES.map(stage => <li key={stage}><span>{t(`knowledge:automation.stage.${stage}`)}</span><span>{t(`knowledge:automation.stageMode.${stages?.[stage] ?? 'unconfigured'}`)}</span></li>)}</ul>
      </details>
      {!beforeRun && mode !== 'active' && <button type="button" onClick={openSettings}>{t('knowledge:domains.settings')}</button>}
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {beforeRun && <p className={styles.hint}>{t('knowledge:automation.backfillHint')}</p>}
    {!!status?.tasks.length && <details className={styles.records}><summary>{t('knowledge:automation.records')}</summary>
      <p className={styles.hint}>{t('knowledge:automation.taskCountsHint')}</p>
      <p className={styles.hint}>{t('knowledge:automation.counts', status.counts)}</p>
      <div className={styles.taskList}>{status.tasks.map(task => <article className={styles.task} key={task.id}>
        <div className={styles.taskHeading}><strong>{t(`knowledge:automation.stage.${task.stage}`)}</strong><span data-attention={['failed', 'needs-review'].includes(task.status)}>{t(`knowledge:automation.status.${task.status}`)}</span></div>
        <p>{task.subject}</p>
        <p className={styles.hint}>{task.workspaceId} · {t(`knowledge:automation.provider.${task.model.provider}`)} / {task.model.model} · <time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString()}</time></p>
        {task.reason && <p className={styles.hint}>{task.reason}</p>}
        {['failed', 'needs-review'].includes(task.status) && <button type="button" disabled={busy || disabled || Boolean(error) || status.running || !status.enabled} onClick={() => void run(false, task.id)}><RotateCw size={12} aria-hidden />{t('knowledge:automation.retry')}</button>}
      </article>)}</div>
    </details>}
  </section>
}
