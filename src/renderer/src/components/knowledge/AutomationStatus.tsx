import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { KnowledgeAutomationStatus } from '../../../../shared/knowledge-automation'

export function AutomationStatus({ active, beforeRun, disabled = false, onChanged }: {
  active: boolean; disabled?: boolean; beforeRun?: () => Promise<boolean>; onChanged?: () => void
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
  return <section aria-label={t('knowledge:automation.progress')}>
    <h4>{t('knowledge:automation.progress')}</h4>
    {error && <p role="alert">{error}</p>}
    {status && !error && <p role="status">{t(status.enabled ? 'knowledge:automation.active' : 'knowledge:automation.paused')} · {t('knowledge:automation.counts', status.counts)}</p>}
    <button type="button" disabled={busy || disabled || !beforeRun && !status?.enabled} onClick={() => void run()}>{t('knowledge:automation.run')}</button>
    {beforeRun && <button type="button" disabled={busy || disabled} onClick={() => void run(true)}>{t('knowledge:automation.backfill')}</button>}
    {beforeRun && <p>{t('knowledge:automation.backfillHint')}</p>}
    {!!status?.tasks.length && <details><summary>{t('knowledge:automation.records')}</summary>
      {status.tasks.map(task => <article key={task.id} style={{ padding: '8px 0', overflowWrap: 'anywhere' }}>
        <strong>{t(`knowledge:automation.stage.${task.stage}`)} · {t(`knowledge:automation.status.${task.status}`)}</strong>
        <p>{task.workspaceId} · {task.subject}</p>
        <p>{task.model.provider} / {task.model.model} · {task.updatedAt}</p>
        {task.reason && <p>{task.reason}</p>}
        {['failed', 'needs-review'].includes(task.status) && <button type="button" disabled={busy || disabled || !status.enabled} onClick={() => void run(false, task.id)}>{t('knowledge:automation.retry')}</button>}
      </article>)}
    </details>}
  </section>
}
