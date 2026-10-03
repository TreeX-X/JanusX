import { useEffect, useRef, useState } from 'react'
import { Cpu } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { LOCAL_CONTEXT_OPTIONS, type KnowledgeLocalEnvironment, type KnowledgeLocalSettings } from '../../../shared/knowledge-automation'
import { Select } from './ui/Select'
import styles from './KnowledgeSettingsPanel.module.css'
import automationStyles from './KnowledgeAutomationPanel.module.css'

export function KnowledgeLocalModelPanel({ value, disabled, onPersist }: {
  value: KnowledgeLocalSettings; disabled: boolean; onPersist(value: KnowledgeLocalSettings): void
}) {
  const { t } = useI18n('knowledge')
  const [draft, setDraft] = useState(value)
  const [report, setReport] = useState<KnowledgeLocalEnvironment>()
  const [action, setAction] = useState<'checking' | 'stopping'>()
  const [error, setError] = useState('')
  const sequence = useRef(0)
  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => () => { sequence.current++ }, [])
  const enable = async () => {
    const current = ++sequence.current
    setAction('checking'); setError(''); setReport(undefined)
    try {
      const result = await window.electron.knowledge.configureLocalModel({ ...draft, enabled: true })
      if (sequence.current !== current) return
      setReport(result.report)
      if (result.report.ok && result.settings.automation) onPersist(result.settings.automation.local)
    } catch { if (sequence.current === current) setError(t('knowledge:automation.localCheckFailed')) }
    finally { if (sequence.current === current) setAction(undefined) }
  }
  const disable = async () => {
    const current = ++sequence.current
    setAction('stopping'); setError(''); setReport(undefined)
    onPersist({ ...value, enabled: false })
    try { await window.electron.knowledge.stopLocalModel() }
    catch { if (sequence.current === current) setError(t('knowledge:automation.localStopFailed')) }
    finally { if (sequence.current === current) setAction(undefined) }
  }
  const editable = !disabled && !value.enabled && !action
  return <details className={automationStyles.connection}>
    <summary><Cpu size={14} aria-hidden /><span>{t('knowledge:automation.localTitle')}</span>
      <small>{t(value.enabled ? 'knowledge:automation.localEnabled' : 'knowledge:automation.localDisabled')}</small></summary>
    <p className={styles.hint}>{t('knowledge:automation.localHint')}</p>
    <fieldset disabled={!editable} aria-label={t('knowledge:automation.localTitle')}>
      {(['endpoint', 'serverPath', 'modelPath'] as const).map(field => <label className={automationStyles.connectionField} key={field}>
        <span>{t(`knowledge:automation.local.${field}`)}</span><input value={draft[field]}
          onChange={event => { setReport(undefined); setDraft({ ...draft, [field]: event.target.value }) }} />
      </label>)}
      <div className={automationStyles.connectionField}>
        <span>{t('knowledge:automation.localContext')}</span>
        <Select disabled={!editable} value={String(draft.contextTokens)} ariaLabel={t('knowledge:automation.localContext')}
          options={[{ value: '0', label: t('knowledge:automation.localContextAuto') }, ...LOCAL_CONTEXT_OPTIONS.map(tokens => ({ value: String(tokens), label: `${tokens / 1024}K tokens` }))]}
          onChange={tokens => { setReport(undefined); setDraft({ ...draft, contextTokens: Number(tokens) }) }} />
      </div>
    </fieldset>
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={!editable} onClick={() => void enable()}>
        {t(action === 'checking' ? 'knowledge:automation.localChecking' : 'knowledge:automation.localEnable')}</button>
      <button type="button" className={styles.button} disabled={action === 'stopping'} onClick={() => void disable()}>
        {t(action === 'checking' ? 'knowledge:automation.localCancel' : 'knowledge:automation.localDisable')}</button>
    </div>
    {report && <div className={report.ok ? styles.status : `${styles.status} ${styles.statusError}`} role={report.ok ? 'status' : 'alert'}>
      <p>{report.ok ? t('knowledge:automation.localPassed', { tokens: report.selectedContextTokens / 1024 })
        : t(`knowledge:automation.localErrors.${report.reason as LocalErrorKey}`, { defaultValue: t('knowledge:automation.localCheckFailed') })}</p>
      <p>{t('knowledge:automation.localResources', { memory: (report.availableMemoryMiB / 1024).toFixed(1),
        device: report.mode === 'gpu' ? `${report.deviceName} · ${((report.availableVramMiB ?? 0) / 1024).toFixed(1)} GB` : t(report.mode === 'service' ? 'knowledge:automation.localService' : 'knowledge:automation.localCpu') })}</p>
      {!!report.recommendedContextTokens && <p>{t('knowledge:automation.localRecommendation', { tokens: report.recommendedContextTokens / 1024 })}</p>}
    </div>}
    {error && <p className={`${styles.status} ${styles.statusError}`} role="alert">{error}</p>}
  </details>
}

// Keep the reason vocabulary typed; unknown host failures use the generic localized message.
type LocalErrorKey = 'invalid-model-endpoint' | 'invalid-local-model-path' | 'invalid-local-model-metadata'
  | 'local-model-unsupported' | 'local-runtime-unavailable' | 'local-port-unavailable' | 'local-context-unsupported'
  | 'local-service-unavailable' | 'local-service-context-unknown' | 'local-memory-insufficient' | 'local-environment-failed'
