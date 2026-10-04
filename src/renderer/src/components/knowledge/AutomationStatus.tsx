import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, RotateCw } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { KnowledgeAutomationStatus } from '../../../../shared/knowledge-automation'
import styles from './AutomationStatus.module.css'

// Note: background scheduling is primary; manual checks are secondary — see .agents/notes/2026-10-04-assistant-persona-layout--6e9c114d.md
export function AutomationStatus({ active, beforeRun, disabled = false, onChanged, onOpenSettings }: {
  active: boolean; disabled?: boolean; beforeRun?: () => Promise<boolean>; onChanged?: () => void; onOpenSettings?: () => void
}) {
  const { t } = useI18n('knowledge')
  const [status, setStatus] = useState<KnowledgeAutomationStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const changed = useRef(onChanged)
  changed.current = onChanged
  const lastCounts = useRef('')
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try { const next = await window.electron.knowledge.automationStatus(); if (request === generation.current) {
      setStatus(next); setError('')
      const counts = JSON.stringify(next.counts)
      if (lastCounts.current && lastCounts.current !== counts) changed.current?.()
      lastCounts.current = counts
    } }
    catch { if (request === generation.current) setError(t('knowledge:automation.loadFailed')) }
  }, [t])
  useEffect(() => {
    if (!active) return
    void refresh()
    const timer = setInterval(() => void refresh(), 5000)
    return () => { clearInterval(timer); invalidate() }
    function invalidate() { generation.current++ }
  }, [active, refresh])
  const run = async (backfill = false, taskId?: string) => {
    setBusy(true); setError('')
    try {
      if (beforeRun && !await beforeRun()) return
      if (taskId) await window.electron.knowledge.automationRetry(taskId)
      await window.electron.knowledge.automationRun({ backfill })
      await refresh(); onChanged?.()
    } catch { setError(t('knowledge:automation.actionFailed')) }
    finally { setBusy(false) }
  }
  return <section className={styles.root} aria-label={t('knowledge:automation.progress')}>
    <div className={styles.overview}>
      <h4><Activity size={13} aria-hidden />{t('knowledge:automation.progress')}</h4>
      {status && !error && <div className={styles.metrics} role="status">
        <span className={styles.state} data-enabled={status.enabled}>{t(status.running ? 'knowledge:automation.processing' : status.enabled ? 'knowledge:automation.active' : 'knowledge:automation.paused')}</span>
        {(['pending', 'running', 'succeeded', 'needs-review', 'failed'] as const).map(name => <span className={styles.metric} key={name} data-attention={status.counts[name] > 0 && (name === 'failed' || name === 'needs-review')}>
          <span>{t(`knowledge:automation.status.${name}`)}</span><b>{status.counts[name]}</b>
        </span>)}
      </div>}
      <details className={styles.actions}>
        <summary>{t('knowledge:review.moreActions')}</summary>
        <div className={styles.actionButtons}>
        <button type="button" disabled={busy || disabled || status?.running || !beforeRun && !status?.enabled} onClick={() => void run()}><RotateCw size={12} aria-hidden />{t('knowledge:automation.run')}</button>
        {beforeRun && <button type="button" disabled={busy || disabled} onClick={() => void run(true)}>{t('knowledge:automation.backfill')}</button>}
        </div>
      </details>
    </div>
    {status && !error && <p className={styles.hint}>{t(status.enabled ? 'knowledge:automation.backgroundHint' : 'knowledge:automation.pausedHint')}</p>}
    {status?.tasks.some(task => task.status === 'needs-review' && task.reason === 'stage-not-configured') && <p className={styles.hint}>{t('knowledge:automation.configurationHint')}</p>}
    {!beforeRun && status && (!status.enabled || status.tasks.some(task => task.reason === 'stage-not-configured' && task.status === 'needs-review')) && <button type="button" onClick={() => onOpenSettings ? onOpenSettings() : window.dispatchEvent(new Event('janusx:open-knowledge-settings'))}>{t('knowledge:domains.settings')}</button>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {beforeRun && <p className={styles.hint}>{t('knowledge:automation.backfillHint')}</p>}
    {!!status?.tasks.length && <details className={styles.records}><summary>{t('knowledge:automation.records')}</summary>
      <div className={styles.taskList}>{status.tasks.map(task => <article className={styles.task} key={task.id}>
        <div className={styles.taskHeading}><strong>{t(`knowledge:automation.stage.${task.stage}`)}</strong><span data-attention={['failed', 'needs-review'].includes(task.status)}>{t(`knowledge:automation.status.${task.status}`)}</span></div>
        <p>{task.subject}</p>
        <p className={styles.hint}>{task.workspaceId} · {t(`knowledge:automation.provider.${task.model.provider}`)} / {task.model.model} · <time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString()}</time></p>
        {task.reason && <p className={styles.hint}>{task.reason}</p>}
        {['failed', 'needs-review'].includes(task.status) && <button type="button" disabled={busy || disabled || !status.enabled} onClick={() => void run(false, task.id)}><RotateCw size={12} aria-hidden />{t('knowledge:automation.retry')}</button>}
      </article>)}</div>
    </details>}
  </section>
}
