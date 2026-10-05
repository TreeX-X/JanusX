import { useEffect, useRef, useState } from 'react'
import { Cpu } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { LOCAL_CONTEXT_OPTIONS, type KnowledgeLocalEnvironment, type KnowledgeLocalResources, type KnowledgeLocalSettings } from '../../../shared/knowledge-automation'
import { Select } from './ui/Select'
import styles from './KnowledgeSettingsPanel.module.css'
import automationStyles from './KnowledgeAutomationPanel.module.css'

export function KnowledgeLocalModelPanel({ value, disabled, onPersist }: {
  value: KnowledgeLocalSettings; disabled: boolean; onPersist(value: KnowledgeLocalSettings): void
}) {
  const { t } = useI18n('knowledge')
  const [draft, setDraft] = useState(value)
  const [report, setReport] = useState<KnowledgeLocalEnvironment>()
  const [action, setAction] = useState<'checking' | 'stopping' | 'installing'>()
  const [resources, setResources] = useState<KnowledgeLocalResources>()
  const applyResources = useRef(false)
  const appliedResources = useRef('')
  const [error, setError] = useState('')
  const sequence = useRef(0)
  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => () => { sequence.current++ }, [])
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const current = sequence.current
      try {
        const result = await window.electron.knowledge.localResourcesStatus()
        if (live && current === sequence.current) setResources(result)
      } catch { /* The explicit install action surfaces connection errors. */ }
      if (live) timer = setTimeout(() => void poll(), 800)
    }
    void poll()
    return () => { live = false; clearTimeout(timer) }
  }, [])
  useEffect(() => {
    if (resources?.phase !== 'ready' || !resources.serverPath || !resources.modelPath) return
    const requested = applyResources.current
    const identity = `${resources.serverPath}\n${resources.modelPath}`
    if (!requested && appliedResources.current === identity) return
    appliedResources.current = identity
    applyResources.current = false
    setDraft(current => current.enabled || !requested && (current.serverPath || current.modelPath) ? current
      : { ...current, serverPath: resources.serverPath!, modelPath: resources.modelPath! })
  }, [resources])
  const install = async () => {
    const current = ++sequence.current
    setAction('installing'); setError(''); setReport(undefined)
    try {
      const result = await window.electron.knowledge.installLocalResources()
      if (sequence.current === current) { applyResources.current = true; setResources(result) }
    } catch { if (sequence.current === current) setError(t('knowledge:automation.localErrors.local-download-failed')) }
    finally { if (sequence.current === current) setAction(undefined) }
  }
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
    applyResources.current = false
    onPersist({ ...value, enabled: false })
    try { await window.electron.knowledge.stopLocalModel() }
    catch { if (sequence.current === current) setError(t('knowledge:automation.localStopFailed')) }
    finally { if (sequence.current === current) setAction(undefined) }
  }
  const installing = resources && ['checking', 'downloading', 'verifying', 'extracting'].includes(resources.phase)
  const editable = !disabled && !value.enabled && !action && !installing
  const resourceError = resources?.phase === 'failed'
  return <details className={automationStyles.connection}>
    <summary><Cpu size={14} aria-hidden /><span>{t('knowledge:automation.localTitle')}</span>
      <small>{t(value.enabled ? 'knowledge:automation.localEnabled' : 'knowledge:automation.localDisabled')}</small></summary>
    <p className={styles.hint}>{t('knowledge:automation.localHint')}</p>
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={!editable || resources?.supported === false} onClick={() => void install()}>
        {t(resources?.phase === 'failed' || resources?.phase === 'cancelled' ? 'knowledge:automation.localDownloadRetry' : 'knowledge:automation.localDownload')}</button>
      <span className={styles.hint}>{t(resources?.supported === false ? 'knowledge:automation.localErrors.local-download-unsupported' : 'knowledge:automation.localDownloadHint')}</span>
    </div>
    {resources && !value.enabled && resources.phase !== 'idle' && <div className={resourceError ? `${styles.status} ${styles.statusError}` : styles.status} role={resourceError ? 'alert' : 'status'}>
      <p>{resourceError ? t(`knowledge:automation.localErrors.${resources.reason as LocalErrorKey}`, { defaultValue: t('knowledge:automation.localErrors.local-download-failed') })
        : t(`knowledge:automation.localDownloadPhases.${resources.phase}`)}</p>
      {installing && <>
        <progress aria-label={t('knowledge:automation.localDownloadProgress')} max={resources.totalBytes || 1}
          value={resources.phase === 'downloading' ? resources.receivedBytes : undefined} style={{ width: '100%', height: 6, accentColor: 'var(--shell-accent)' }} />
        {resources.phase === 'downloading' && <small>{t(resources.component === 'model' ? 'knowledge:automation.localDownloadModel' : 'knowledge:automation.localDownloadRuntime')}
          {' · '}{(resources.receivedBytes / 1024 ** 2).toFixed(1)} / {(resources.totalBytes / 1024 ** 2).toFixed(1)} MB</small>}
      </>}
    </div>}
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
        {t(installing || action === 'installing' ? 'knowledge:automation.localDownloadCancel' : action === 'checking' ? 'knowledge:automation.localCancel' : 'knowledge:automation.localDisable')}</button>
    </div>
    {report && <div className={report.ok ? styles.status : `${styles.status} ${styles.statusError}`} role={report.ok ? 'status' : 'alert'}>
      <p>{report.ok ? t('knowledge:automation.localPassed', { tokens: report.selectedContextTokens / 1024 })
        : t(`knowledge:automation.localErrors.${report.reason as LocalErrorKey}`, { endpoint: draft.endpoint, defaultValue: t('knowledge:automation.localCheckFailed') })}</p>
      <p>{t('knowledge:automation.localResources', { memory: (report.availableMemoryMiB / 1024).toFixed(1),
        device: report.mode === 'gpu' ? `${report.deviceName} · ${report.availableVramMiB === undefined ? '?' : (report.availableVramMiB / 1024).toFixed(1)} GB` : t(report.mode === 'service' ? 'knowledge:automation.localService' : 'knowledge:automation.localGpuUnavailable') })}</p>
      {!!report.recommendedContextTokens && <p>{t('knowledge:automation.localRecommendation', { tokens: report.recommendedContextTokens / 1024 })}</p>}
    </div>}
    {error && <p className={`${styles.status} ${styles.statusError}`} role="alert">{error}</p>}
  </details>
}

// Keep the reason vocabulary typed; unknown host failures use the generic localized message.
type LocalErrorKey = 'invalid-model-endpoint' | 'invalid-local-model-path' | 'invalid-local-model-metadata'
  | 'local-model-unsupported' | 'local-runtime-unavailable' | 'local-port-unavailable' | 'local-context-unsupported'
  | 'local-service-unavailable' | 'local-service-context-unknown' | 'local-memory-insufficient' | 'local-environment-failed'
  | 'local-gpu-unavailable' | 'local-vram-unknown' | 'local-vram-insufficient'
  | 'local-download-failed' | 'local-download-unsupported' | 'local-download-size-mismatch'
  | 'local-download-hash-mismatch' | 'local-disk-insufficient' | 'local-runtime-extract-failed'
