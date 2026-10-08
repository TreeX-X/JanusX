import { ExternalMcpPanel } from './ExternalMcpPanel'
// Note: compact knowledge controls share explicit typography and theme tokens — see .agents/notes/knowledge/requirements/knowledge-accumulate-review-wiki-rereview.md
import { KnowledgeAutomationPanel } from './KnowledgeAutomationPanel'
import { Database } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { defaultKnowledgeAutomation, normalizeKnowledgeAutomation, type KnowledgeLocalSettings } from '../../../shared/knowledge-automation'
import {
  getKnowledgeSettings,
  updateKnowledgeSettings,
  type KnowledgeSettings,
} from '@/services/knowledge-settings'
import { DEFAULT_KNOWLEDGE_SETTINGS, type KnowledgeProcessingMode } from '../../../shared/knowledge-settings'
import { useI18n } from '@/i18n/useI18n'
import { Select } from './ui/Select'
import styles from './KnowledgeSettingsPanel.module.css'

type StatusState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'
const applyLocal = (current: KnowledgeSettings, local: KnowledgeLocalSettings): KnowledgeSettings => ({ ...current,
  automation: normalizeKnowledgeAutomation({ ...(current.automation ?? defaultKnowledgeAutomation()), local }) })

export function KnowledgeSettingsPanel() {
  const { t } = useI18n('settings')
  const [settings, setSettings] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [draft, setDraft] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [status, setStatus] = useState<StatusState>('loading')
  const [error, setError] = useState('')
  const localRevision = useRef(0)
  const latestLocal = useRef<KnowledgeLocalSettings>()
  const localPersisted = (local: KnowledgeLocalSettings) => {
    localRevision.current++; latestLocal.current = local
    setDraft(current => applyLocal(current, local))
    setSettings(current => applyLocal(current, local))
  }

  useEffect(() => {
    let cancelled = false
    const revision = localRevision.current

    setStatus('loading')
    getKnowledgeSettings()
      .then((next) => {
        if (cancelled) return
        if (revision !== localRevision.current && latestLocal.current) next = applyLocal(next, latestLocal.current)
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

  const updateModeDraft = (mode: KnowledgeProcessingMode) => {
    setDraft((current) => ({ ...current, mode }))
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
    const revision = localRevision.current
    setStatus('saving')
    setError('')
    try {
      let next = await updateKnowledgeSettings(draft)
      if (revision !== localRevision.current && latestLocal.current) next = applyLocal(next, latestLocal.current)
      setSettings(next)
      setDraft(next)
      setStatus('saved')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings:knowledge.error.save'))
      setStatus('error')
      return false
    }
  }

  const isBusy = status === 'loading' || status === 'saving'
  const modeOptions = [
    { value: 'auto', label: t('settings:knowledge.row.mode.auto') },
    { value: 'deterministic-only', label: t('settings:knowledge.row.mode.deterministicOnly') },
    { value: 'llm-preferred', label: t('settings:knowledge.row.mode.llmPreferred') },
  ]
  const statusClass =
    status === 'error'
      ? `${styles.status} ${styles.statusError}`
      : status === 'saved'
        ? `${styles.status} ${styles.statusSuccess}`
        : styles.status

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}><Database size={14} aria-hidden />{t('settings:knowledge.section.capture')}</h3>
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
        {!draft.automation?.enabled && <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>{t('settings:knowledge.row.mode.label')}</span>
            <span className={styles.hint}>
              {t('settings:knowledge.row.mode.hint')}
            </span>
          </div>
          <Select
            value={draft.mode}
            disabled={isBusy}
            onChange={(value) => updateModeDraft(normalizeMode(value))}
            options={modeOptions}
            ariaLabel={t('settings:knowledge.row.mode.label')}
          />
        </div>}
      </section>

      <KnowledgeAutomationPanel value={draft.automation} knowledgeEnabled={draft.enabled} onChange={automation => {
        setDraft(current => ({ ...current, automation }))
        if (status === 'saved' || status === 'error') { setStatus('idle'); setError('') }
      }} onSave={handleSave} onLocalPersist={localPersisted} disabled={isBusy} />
      <ExternalMcpPanel />

      <div className={styles.footer}>
        <div className={statusClass} role="status">
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

const PROCESSING_MODES: KnowledgeProcessingMode[] = ['auto', 'deterministic-only', 'llm-preferred']

function normalizeMode(value: string): KnowledgeProcessingMode {
  return (PROCESSING_MODES as string[]).includes(value) ? (value as KnowledgeProcessingMode) : 'auto'
}

function SettingSwitch({  label,
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
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.switchTrack} />
      </label>
    </div>
  )
}
