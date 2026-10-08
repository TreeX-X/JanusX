// Note: setup and runtime status remain separate from review — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Download, FolderOpen, Loader2, Play, Square } from 'lucide-react'
import type { LayaAction, LayaSettings, LayaStatus } from '../../../shared/laya'
import { useI18n } from '@/i18n/useI18n'
import shared from './NotificationSettingsPanel.module.css'
import styles from './LayaSettingsPanel.module.css'

const phaseKeys = {
  disabled: 'knowledge:laya.phase.disabled', stopped: 'knowledge:laya.phase.stopped', starting: 'knowledge:laya.phase.starting',
  downloading: 'knowledge:laya.phase.downloading', ready: 'knowledge:laya.phase.ready', failed: 'knowledge:laya.phase.failed',
} as const
const reasonKeys = {
  'absolute-paths-required': 'knowledge:laya.reason.paths', 'verification-or-warmup-failed': 'knowledge:laya.reason.environment',
  'spawn-failed': 'knowledge:laya.reason.environment', 'process-error': 'knowledge:laya.reason.environment',
  'download-timeout': 'knowledge:laya.reason.download', 'startup-timeout': 'knowledge:laya.reason.startup',
  'calibration-invalid': 'knowledge:laya.reason.calibration', prepared: 'knowledge:laya.reason.prepared', idle: 'knowledge:laya.reason.idle',
  'configuration-changed': 'knowledge:laya.reason.changed',
} as const
const absolutePath = (value: string) => /^(?:[a-z]:[\\/]|\/|\\\\[^\\]+\\[^\\]+)/i.test(value.trim())

export function LayaSettingsPanel({ value, onChange, onSave, disabled, knowledgeEnabled = true, onBusyChange }: {
  value?: LayaSettings; onChange: (value: LayaSettings) => void; onSave: () => Promise<boolean>; disabled: boolean
  knowledgeEnabled?: boolean; onBusyChange?: (busy: boolean) => void
}) {
  const { t } = useI18n('knowledge')
  const id = useId()
  const settings = value ?? { enabled: false, pythonPath: '', modelPath: '' }
  const [status, setStatus] = useState<LayaStatus | null>(null)
  const [pending, setPending] = useState<LayaAction | null>(null)
  const [saving, setSaving] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [readError, setReadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const actionVersion = useRef(0)
  const readVersion = useRef(0)
  const actionPending = useRef(false)
  const mounted = useRef(false)
  const busy = pending !== null || choosing
  const controlsDisabled = disabled || busy || !knowledgeEnabled
  const refresh = useCallback(async () => {
    const request = ++readVersion.current
    const version = actionVersion.current
    try {
      const next = await window.electron.knowledge.layaControl('status')
      if (mounted.current && request === readVersion.current && version === actionVersion.current) { setStatus(next); setReadError(false) }
    } catch {
      if (mounted.current && request === readVersion.current && version === actionVersion.current) setReadError(true)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    const actionGeneration = actionVersion
    const readGeneration = readVersion
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => { mounted.current = false; actionGeneration.current++; readGeneration.current++; clearInterval(timer) }
  }, [refresh])
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  const pythonInvalid = !!settings.pythonPath.trim() && !absolutePath(settings.pythonPath)
  const modelInvalid = !!settings.modelPath.trim() && !absolutePath(settings.modelPath)
  const canStart = knowledgeEnabled && settings.enabled && absolutePath(settings.pythonPath) && !modelInvalid
  const runtimeBusy = status?.phase === 'starting' || status?.phase === 'downloading'
  const canStop = pending !== null && pending !== 'stop' || runtimeBusy || status?.phase === 'ready'
  const act = async (action: LayaAction) => {
    if (action === 'stop' ? pending === 'stop' || !canStop : actionPending.current || disabled || !canStart || runtimeBusy) return
    actionPending.current = true
    const version = ++actionVersion.current
    readVersion.current++
    setPending(action); setActionError(false)
    // 同步通知父面板进入忙态：effect flush 在 await onSave() 间隙可能滞后，
    // 会出现保存已开始、父级 isBusy 仍为 false 的竞态窗口。
    onBusyChange?.(true)
    try {
      if (action !== 'stop') {
        setSaving(true)
        const saved = await onSave()
        if (version !== actionVersion.current || !mounted.current) return
        setSaving(false)
        if (!saved) { setActionError(true); return }
      } else setSaving(false)
      const next = await window.electron.knowledge.layaControl(action)
      if (version === actionVersion.current && mounted.current) { readVersion.current++; setStatus(next); setReadError(false) }
    } catch { if (version === actionVersion.current && mounted.current) setActionError(true) }
    finally {
      if (version === actionVersion.current && mounted.current) { setPending(null); setSaving(false); actionPending.current = false }
    }
  }
  const chooseDirectory = async () => {
    if (controlsDisabled) return
    setChoosing(true); setActionError(false)
    const version = actionVersion.current
    try {
      const result = await window.electron.dialog.openDirectory()
      if (mounted.current && version === actionVersion.current && !result.canceled && result.filePaths[0]) onChange({ ...settings, modelPath: result.filePaths[0] })
    } catch { if (mounted.current) setActionError(true) }
    finally { if (mounted.current) setChoosing(false) }
  }
  const phase = status && phaseKeys[status.phase]
  const stateLabel = readError ? t('knowledge:laya.unknown') : saving ? t('knowledge:laya.saving')
    : pending === 'stop' ? t('knowledge:laya.stopping') : pending === 'prepare' ? t('knowledge:laya.preparing')
    : pending === 'warm' ? t('knowledge:laya.warming') : phase ? t(phase) : t('knowledge:laya.checking')
  const reason = status?.reason && reasonKeys[status.reason as keyof typeof reasonKeys]
  return <section className={`${shared.section} ${styles.section}`} aria-labelledby={`${id}-title`}>
    <div className={styles.header}>
      <div className={styles.heading}><h3 id={`${id}-title`}>{t('knowledge:laya.title')}</h3><p>{t('knowledge:laya.description')}</p></div>
      <label className={`${shared.switch} ${styles.switch}`}>
        <input type="checkbox" role="switch" aria-label={t('knowledge:laya.enabled')} checked={settings.enabled} disabled={controlsDisabled}
          onChange={event => onChange({ ...settings, enabled: event.target.checked })} /><span className={shared.switchTrack} />
      </label>
    </div>
    {!knowledgeEnabled && <p className={styles.notice}>{t('knowledge:laya.knowledgeDisabled')}</p>}
    <div className={styles.runtime}>
      <span role="status" className={styles.state} data-phase={readError ? 'unknown' : status?.phase ?? 'unknown'}><span className={styles.dot} />{stateLabel}</span>
      {readError && <button type="button" className={`${shared.button} ${shared.ghostButton}`} onClick={() => void refresh()}>{t('knowledge:laya.retry')}</button>}
      {!readError && !pending && reason && <span className={styles.runtimeHint}>{t(reason)}</span>}
      {!readError && !pending && status?.phase === 'failed' && !reason && <span className={styles.runtimeHint}>{t('knowledge:laya.failed')}</span>}
    </div>
    {(settings.enabled || canStop) && <>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-python`}>{t('knowledge:laya.python')}</label>
          <input id={`${id}-python`} className={styles.pathInput} value={settings.pythonPath} disabled={controlsDisabled}
            aria-invalid={pythonInvalid} aria-describedby={`${id}-python-help`} spellCheck={false} autoComplete="off"
            placeholder={t('knowledge:laya.pythonPlaceholder')} onChange={event => onChange({ ...settings, pythonPath: event.target.value })} />
          <p id={`${id}-python-help`} className={pythonInvalid ? styles.error : styles.hint}>{t(pythonInvalid ? 'knowledge:laya.pathInvalid' : 'knowledge:laya.pythonHint')}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-model`}>{t('knowledge:laya.model')}</label>
          <div className={styles.pathRow}>
            <input id={`${id}-model`} className={styles.pathInput} value={settings.modelPath} disabled={controlsDisabled}
              aria-invalid={modelInvalid} aria-describedby={`${id}-model-help`} spellCheck={false} autoComplete="off"
              placeholder={t('knowledge:laya.modelPlaceholder')} onChange={event => onChange({ ...settings, modelPath: event.target.value })} />
            <button type="button" className={`${shared.button} ${shared.ghostButton} ${styles.button}`} disabled={controlsDisabled} onClick={() => void chooseDirectory()}><FolderOpen size={14} aria-hidden="true" />{t('knowledge:laya.browse')}</button>
          </div>
          <p id={`${id}-model-help`} className={modelInvalid ? styles.error : styles.hint}>{t(modelInvalid ? 'knowledge:laya.pathInvalid' : 'knowledge:laya.modelHint')}</p>
        </div>
      </div>
      <div className={styles.operations}>
        <div className={styles.actions}>
          <button type="button" className={`${shared.button} ${shared.ghostButton} ${styles.button}`} disabled={disabled || busy || !canStart || runtimeBusy} onClick={() => void act('prepare')}>
            {pending === 'prepare' ? <Loader2 size={14} className={styles.spinner} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}{t(pending === 'prepare' ? 'knowledge:laya.preparing' : 'knowledge:laya.prepare')}
          </button>
          <button type="button" className={`${shared.button} ${shared.primaryButton} ${styles.button}`} disabled={disabled || busy || !canStart || runtimeBusy || status?.phase === 'ready'} onClick={() => void act('warm')}>
            {pending === 'warm' ? <Loader2 size={14} className={styles.spinner} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{t(pending === 'warm' ? 'knowledge:laya.warming' : 'knowledge:laya.warm')}
          </button>
          <button type="button" className={`${shared.button} ${shared.ghostButton} ${styles.button}`} disabled={!canStop || pending === 'stop'} onClick={() => void act('stop')}><Square size={13} aria-hidden="true" />{t(canStop && status?.phase !== 'ready' ? 'knowledge:laya.cancel' : 'knowledge:laya.stop')}</button>
        </div>
        <p className={styles.hint}>{t('knowledge:laya.actionHint')}</p>
      </div>
    </>}
    {actionError && <p role="alert" className={styles.error}>{t('knowledge:laya.failed')}</p>}
    {status && <details className={styles.diagnostics}>
      <summary>{t('knowledge:laya.diagnostics')}</summary>
      <dl>
        <div><dt>{t('knowledge:laya.revision')}</dt><dd>{status.modelRevision}</dd></div>
        {status.warmupMs !== undefined && <div><dt>{t('knowledge:laya.warmupTime')}</dt><dd>{status.warmupMs} ms</dd></div>}
        {status.lastInferenceMs !== undefined && <div><dt>{t('knowledge:laya.inferenceTime')}</dt><dd>{status.lastInferenceMs} ms</dd></div>}
        {status.reason && <div><dt>{t('knowledge:laya.reasonCode')}</dt><dd>{status.reason}</dd></div>}
      </dl>
    </details>}
  </section>
}
