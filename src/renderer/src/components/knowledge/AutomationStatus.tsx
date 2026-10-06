import { useEffect, useRef, useState } from 'react'
import { Activity, LoaderCircle, Settings } from 'lucide-react'
import { useKnowledgeAutomation, refreshKnowledgeAutomation } from '../../services/knowledge-automation'
import { useAppStore } from '@/stores/app'
import { useAssistantStore } from '@/stores/assistant'
import { useI18n } from '@/i18n/useI18n'
import { KNOWLEDGE_STAGES } from '../../../../shared/knowledge-automation'
import styles from './AutomationStatus.module.css'

export function openAutomationView(view: 'processing' | 'attention' | 'settings') {
  useAssistantStore.getState().requestAutomationView(view)
  useAppStore.getState().setActiveWorkbench('knowledge')
}

// Note: compact status links to records; configuration stays in settings — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function AutomationStatus({ active, hidden = false, onChanged, onOpenRecords, onOpenSettings }: {
  active: boolean; hidden?: boolean; onChanged?: () => void
  onOpenRecords?: (attention: boolean) => void; onOpenSettings?: () => void
}) {
  const { t } = useI18n('knowledge')
  const { status, error } = useKnowledgeAutomation(active)
  const changed = useRef(onChanged)
  changed.current = onChanged
  const last = useRef('')
  useEffect(() => {
    if (!active || !status) return
    const next = JSON.stringify([status.counts, status.queue, status.stages, status.enabled])
    if (last.current && last.current !== next) changed.current?.()
    last.current = next
  }, [active, status])
  const current = status?.reviewStateVersion === 1 ? status : null
  const queue = current?.queue ?? []
  const running = current?.enabled && current.running ? queue.find(task => task.status === 'running') : undefined
  const pending = queue.filter(task => task.status === 'pending').length
  const attention = queue.filter(task => task.status === 'failed' || task.status === 'needs-review').length
  const missing = current ? KNOWLEDGE_STAGES.filter(stage => current.stages[stage] === 'unconfigured') : []
  const automatic = current ? KNOWLEDGE_STAGES.filter(stage => current.stages[stage] === 'automatic') : []
  const partial = current && automatic.length > 0 && KNOWLEDGE_STAGES.some(stage => current.stages[stage] === 'manual')
  const unavailable = error || Boolean(status && !current)
  const label = unavailable ? t('knowledge:summary.unavailable') : !current ? t('knowledge:summary.loading')
    : !current.enabled ? t('knowledge:automation.paused')
      : running ? t('knowledge:automation.runningStage', { stage: t(`knowledge:automation.stage.${running.stage}`) })
        : current.running ? t('knowledge:automation.processing')
          : pending ? t('knowledge:automation.queued', { count: pending })
            : attention ? t('knowledge:automation.waitingForReview')
              : missing.length ? t('knowledge:summary.setupNeeded', { stages: missing.map(stage => t(`knowledge:automation.stage.${stage}`)).join(' · ') })
                : !automatic.length ? t('knowledge:summary.rulesOnly') : t('knowledge:summary.idle')
  const title = running?.displayTitle ? `${label} · ${running.displayTitle}` : label
  const openRecords = (filter: boolean) => onOpenRecords ? onOpenRecords(filter) : openAutomationView(filter ? 'attention' : 'processing')
  if (hidden) return null
  return <section className={styles.compact} data-automation-summary aria-label={t('knowledge:automation.progress')}>
    <div className={styles.compactLine}>
      <span className={styles.scope}>{t('knowledge:summary.scope')}</span>
      <button type="button" className={styles.current} title={title} onClick={() => openRecords(false)}>
        {current?.enabled && current.running ? <LoaderCircle size={12} className={styles.spinner} aria-hidden /> : <Activity size={12} aria-hidden />}
        <span role={unavailable ? 'alert' : 'status'}>{title}</span>
      </button>
      {attention > 0 && <button type="button" className={styles.attentionLink} onClick={() => openRecords(true)}>{t('knowledge:summary.attention', { count: attention })}</button>}
    </div>
    <div className={styles.compactLine}>
      <span className={styles.secondary} title={missing.map(stage => t(`knowledge:automation.stage.${stage}`)).join(' · ')}>
        {unavailable ? <button type="button" onClick={() => void refreshKnowledgeAutomation()}>{t('knowledge:summary.retry')}</button>
          : current?.running && pending > 0 ? t('knowledge:automation.queued', { count: pending })
            : current?.enabled && missing.length ? t('knowledge:summary.setupNeeded', { stages: missing.map(stage => t(`knowledge:automation.stage.${stage}`)).join(' · ') })
              : current?.enabled && partial ? t('knowledge:automation.partial')
                : current?.lastCompletedAt ? t('knowledge:summary.lastCompleted', { time: new Date(current.lastCompletedAt).toLocaleString() }) : ''}
      </span>
      <button type="button" onClick={() => openRecords(false)}>{t('knowledge:summary.records')}</button>
      <button type="button" aria-label={t('knowledge:summary.settings')} title={t('knowledge:summary.settings')} onClick={onOpenSettings ?? (() => openAutomationView('settings'))}><Settings size={13} aria-hidden /></button>
    </div>
  </section>
}

export function useAutomationAction(beforeRun?: () => Promise<boolean>, onChanged?: () => void) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const lock = useRef(false)
  const run = async (backfill = false, taskId?: string) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setFailed(false)
    try {
      if (beforeRun && !await beforeRun()) return
      if (taskId) await window.electron.knowledge.automationRetry(taskId)
      await window.electron.knowledge.automationRun({ backfill })
      await refreshKnowledgeAutomation(); onChanged?.()
    } catch { setFailed(true) }
    finally { lock.current = false; setBusy(false) }
  }
  return { busy, failed, run }
}

/** Saved stage modes are distinct from the editable draft above this section. */
export function AutomationSettingsStatus({ beforeRun, disabled }: { beforeRun: () => Promise<boolean>; disabled: boolean }) {
  const { t } = useI18n('knowledge')
  const { status, error } = useKnowledgeAutomation(true)
  const { busy, failed, run } = useAutomationAction(beforeRun)
  return <section className={styles.root} aria-label={t('knowledge:automation.progress')}>
    <h4>{t('knowledge:summary.savedStages')}</h4>
    <p className={styles.hint}>{t('knowledge:summary.scope')} · {t('knowledge:automation.backgroundHint')}</p>
    {status && !error && <ul className={styles.stageList}>{KNOWLEDGE_STAGES.map(stage => <li key={stage}><span>{t(`knowledge:automation.stage.${stage}`)}</span><span>{t(`knowledge:automation.stageMode.${status.stages[stage]}`)}</span></li>)}</ul>}
    {(error || failed) && <p role="alert">{t(error ? 'knowledge:automation.loadFailed' : 'knowledge:automation.actionFailed')}</p>}
    <details className={styles.actions}><summary>{t('knowledge:review.moreActions')}</summary>
      <div className={styles.actionButtons}>
        <button type="button" disabled={disabled || busy || error || status?.running} onClick={() => void run()}>{t('knowledge:automation.run')}</button>
        <button type="button" disabled={disabled || busy || error || status?.running} onClick={() => void run(true)}>{t('knowledge:automation.backfill')}</button>
      </div><p className={styles.hint}>{t('knowledge:automation.backfillHint')}</p>
    </details>
    <button type="button" onClick={() => openAutomationView('processing')}>{t('knowledge:summary.records')}</button>
  </section>
}
