import { useEffect, useState } from 'react'
import {
  getKnowledgeSettings,
  updateKnowledgeSettings,
  type KnowledgeSettings,
} from '@/services/knowledge-settings'
import { DEFAULT_KNOWLEDGE_SETTINGS } from '../../../shared/knowledge-settings'
import { useI18n } from '@/i18n/useI18n'
import styles from './NotificationSettingsPanel.module.css'

type StatusState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export function KnowledgeSettingsPanel() {
  const { t } = useI18n('settings')
  const [settings, setSettings] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [draft, setDraft] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [status, setStatus] = useState<StatusState>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    setStatus('loading')
    getKnowledgeSettings()
      .then((next) => {
        if (cancelled) return
        setSettings(next)
        setDraft(next)
        setStatus('idle')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('settings:knowledge.error.load'))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [t])

  const updateDraft = (enabled: boolean) => {
    setDraft((current) => ({ ...current, enabled }))
    if (status === 'saved' || status === 'error') {
      setStatus('idle')
      setError('')
    }
  }

  const handleReset = () => {
    setDraft(settings)
    setStatus('idle')
    setError('')
  }

  const handleSave = async () => {
    setStatus('saving')
    setError('')
    try {
      const next = await updateKnowledgeSettings(draft)
      setSettings(next)
      setDraft(next)
      setStatus('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings:knowledge.error.save'))
      setStatus('error')
    }
  }

  const isBusy = status === 'loading' || status === 'saving'
  const statusClass =
    status === 'error'
      ? `${styles.status} ${styles.statusError}`
      : status === 'saved'
        ? `${styles.status} ${styles.statusSuccess}`
        : styles.status

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings:knowledge.section.capture')}</h3>
        <SettingSwitch
          label={t('settings:knowledge.toggle.enable.label')}
          hint={t('settings:knowledge.toggle.enable.hint')}
          checked={draft.enabled}
          disabled={isBusy}
          onChange={updateDraft}
        />
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>{t('settings:knowledge.row.boundary.label')}</span>
            <span className={styles.hint}>
              {t('settings:knowledge.row.boundary.hint')}
            </span>
          </div>
        </div>
      </section>

      <div className={styles.footer}>
        <div className={statusClass}>
          {status === 'loading' && t('settings:footer.loading')}
          {status === 'saving' && t('settings:footer.saving')}
          {status === 'saved' && t('settings:footer.saved')}
          {status === 'error' && error}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.ghostButton}`}
            onClick={handleReset}
            disabled={isBusy}
          >
            {t('settings:footer.reset')}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primaryButton}`}
            onClick={handleSave}
            disabled={isBusy}
          >
            {t('settings:footer.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingSwitch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>
        <span className={styles.labelText}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </div>
      <label className={styles.switch}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.switchTrack} />
      </label>
    </div>
  )
}
