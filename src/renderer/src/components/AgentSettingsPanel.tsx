import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { Select } from './ui/Select'
import { getAgentSettings, updateAgentSettings, type AgentSettings } from '@/services/agent-settings'
import { normalizeAgentApprovalMode, type AgentApprovalMode } from '../../../shared/ipc/agent-runtime'
import styles from './NotificationSettingsPanel.module.css'

type StatusState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'
const DEFAULT_SETTINGS: AgentSettings = { approvalMode: 'per-action' }

export function AgentSettingsPanel() {
  const { t } = useI18n('settings')
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [draft, setDraft] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<StatusState>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getAgentSettings().then((next) => {
      if (cancelled) return
      const normalized = { approvalMode: normalizeAgentApprovalMode(next.approvalMode) }
      setSettings(normalized); setDraft(normalized); setStatus('idle')
    }).catch((err) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : t('settings:agent.error.load')); setStatus('error')
    })
    return () => { cancelled = true }
  }, [t])

  const updateDraft = (approvalMode: AgentApprovalMode) => {
    setDraft({ approvalMode })
    if (status === 'saved' || status === 'error') { setStatus('idle'); setError('') }
  }

  const handleSave = async () => {
    setStatus('saving'); setError('')
    try {
      const next = await updateAgentSettings(draft)
      setSettings(next); setDraft(next); setStatus('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings:agent.error.save')); setStatus('error')
    }
  }

  const isBusy = status === 'loading' || status === 'saving'
  const statusClass = status === 'error' ? `${styles.status} ${styles.statusError}` : status === 'saved' ? `${styles.status} ${styles.statusSuccess}` : styles.status
  const options = [
    { value: 'per-action', label: t('settings:agent.default.mode.perAction') },
    { value: 'auto-run', label: t('settings:agent.default.mode.autoRun') },
  ]

  return <div className={styles.panel}>
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('settings:agent.section.permissions')}</h3>
      <div className={styles.row}>
        <div className={styles.label}>
          <span className={styles.labelText}>{t('settings:agent.default.label')}</span>
          <span className={styles.hint}>{t('settings:agent.default.hint')}</span>
        </div>
        <Select
          value={draft.approvalMode}
          onChange={(value) => updateDraft(normalizeAgentApprovalMode(value))}
          options={options}
          ariaLabel={t('settings:agent.default.label')}
        />
      </div>
      <p className={styles.hint}>{t('settings:agent.safety')}</p>
    </section>
    <div className={styles.footer}>
      <div className={statusClass}>{status === 'loading' && t('settings:footer.loading')}{status === 'saving' && t('settings:footer.saving')}{status === 'saved' && t('settings:footer.saved')}{status === 'error' && error}</div>
      <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.ghostButton}`} onClick={() => { setDraft(settings); setStatus('idle'); setError('') }} disabled={isBusy}>{t('settings:footer.reset')}</button>
        <button type="button" className={`${styles.button} ${styles.primaryButton}`} onClick={() => void handleSave()} disabled={isBusy}>{t('settings:footer.save')}</button>
      </div>
    </div>
  </div>
}
