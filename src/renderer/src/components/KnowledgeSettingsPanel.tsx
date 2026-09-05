import { useEffect, useState } from 'react'
import {
  getKnowledgeSettings,
  updateKnowledgeSettings,
  type KnowledgeSettings,
} from '@/services/knowledge-settings'
import { getExternalMcpStatus, registerExternalMcp } from '@/services/knowledge'
import { DEFAULT_KNOWLEDGE_SETTINGS, type KnowledgeProcessingMode } from '../../../shared/knowledge-settings'
import type { ExternalMcpClientId, ExternalMcpStatus } from '../../../shared/ipc/knowledge'
import { useI18n } from '@/i18n/useI18n'
import { Select } from './ui/Select'
import styles from './NotificationSettingsPanel.module.css'

type StatusState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export function KnowledgeSettingsPanel() {
  const { t } = useI18n('settings')
  const [settings, setSettings] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [draft, setDraft] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [status, setStatus] = useState<StatusState>('loading')
  const [error, setError] = useState('')
  const [mcpStatus, setMcpStatus] = useState<ExternalMcpStatus | null>(null)
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpMsg, setMcpMsg] = useState('')
  const [mcpOk, setMcpOk] = useState(true)

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

  useEffect(() => {
    let cancelled = false
    getExternalMcpStatus()
      .then((next) => {
        if (!cancelled) setMcpStatus(next)
      })
      .catch(() => {
        if (!cancelled) setMcpStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  const updateAutoAcceptDraft = (autoAcceptDeterministicFacts: boolean) => {
    setDraft((current) => ({ ...current, autoAcceptDeterministicFacts }))
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

  const refreshMcpStatus = async () => {
    try {
      setMcpStatus(await getExternalMcpStatus())
    } catch {
      setMcpStatus(null)
    }
  }

  const handleCopyEntry = async () => {
    if (!mcpStatus) return
    try {
      await navigator.clipboard.writeText(`node "${mcpStatus.entry}"`)
      setMcpMsg(t('settings:knowledge.mcp.copied'))
      setMcpOk(true)
    } catch (err) {
      setMcpMsg(t('settings:knowledge.mcp.failed', { error: err instanceof Error ? err.message : String(err) }))
      setMcpOk(false)
    }
  }

  const handleRegisterClient = async (client: ExternalMcpClientId) => {
    setMcpBusy(true)
    setMcpMsg('')
    try {
      const result = await registerExternalMcp(client)
      await refreshMcpStatus()
      if (result.ok) {
        setMcpMsg(t('settings:knowledge.mcp.saved', { path: result.configPath }))
        setMcpOk(true)
      } else {
        setMcpMsg(t('settings:knowledge.mcp.failed', { error: result.error ?? result.configPath }))
        setMcpOk(false)
      }
    } catch (err) {
      setMcpMsg(t('settings:knowledge.mcp.failed', { error: err instanceof Error ? err.message : String(err) }))
      setMcpOk(false)
    } finally {
      setMcpBusy(false)
    }
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
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>{t('settings:knowledge.row.mode.label')}</span>
            <span className={styles.hint}>
              {t('settings:knowledge.row.mode.hint')}
            </span>
          </div>
          <Select
            value={draft.mode}
            onChange={(value) => updateModeDraft(normalizeMode(value))}
            options={modeOptions}
            ariaLabel={t('settings:knowledge.row.mode.label')}
          />
        </div>
        <SettingSwitch
          label={t('settings:knowledge.toggle.autoAccept.label')}
          hint={t('settings:knowledge.toggle.autoAccept.hint')}
          checked={draft.autoAcceptDeterministicFacts}
          disabled={isBusy}
          onChange={updateAutoAcceptDraft}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings:knowledge.section.externalMcp')}</h3>
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>{t('settings:knowledge.mcp.entry.label')}</span>
            <span className={styles.hint}>
              {mcpStatus
                ? (mcpStatus.entryExists ? mcpStatus.entry : t('settings:knowledge.mcp.notBuilt'))
                : t('settings:knowledge.mcp.unavailable')}
            </span>
          </div>
          <button
            type="button"
            className={`${styles.button} ${styles.ghostButton}`}
            disabled={!mcpStatus?.entryExists || mcpBusy}
            onClick={() => void handleCopyEntry()}
          >
            {t('settings:knowledge.mcp.copy')}
          </button>
        </div>
        {mcpStatus?.clients.map((client) => (
          <div className={styles.row} key={client.id}>
            <div className={styles.label}>
              <span className={styles.labelText}>{client.label}</span>
              <span className={styles.hint}>{client.configPath}</span>
            </div>
            <button
              type="button"
              className={`${styles.button} ${styles.ghostButton}`}
              disabled={!mcpStatus.entryExists || mcpBusy || client.registered}
              onClick={() => void handleRegisterClient(client.id)}
            >
              {client.registered
                ? t('settings:knowledge.mcp.registered')
                : t('settings:knowledge.mcp.register')}
            </button>
          </div>
        ))}
        {mcpMsg && (
          <div className={`${styles.status} ${mcpOk ? styles.statusSuccess : styles.statusError}`}>
            {mcpMsg}
          </div>
        )}
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
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.switchTrack} />
      </label>
    </div>
  )
}
