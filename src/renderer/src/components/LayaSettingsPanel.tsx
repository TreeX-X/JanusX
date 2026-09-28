import { useEffect, useRef, useState } from 'react'
import type { LayaAction, LayaSettings, LayaStatus } from '../../../shared/laya'
import { useI18n } from '@/i18n/useI18n'
import styles from './NotificationSettingsPanel.module.css'

export function LayaSettingsPanel({ value, onChange, onSave, disabled }: {
  value?: LayaSettings; onChange: (value: LayaSettings) => void; onSave: () => Promise<boolean>; disabled: boolean
}) {
  const { t } = useI18n('knowledge')
  const settings = value ?? { enabled: false, pythonPath: '', modelPath: '' }
  const [status, setStatus] = useState<LayaStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const actionVersion = useRef(0)
  const actionPending = useRef(false)
  useEffect(() => {
    let mounted = true
    const version = actionVersion
    const refresh = () => window.electron.knowledge.layaControl('status').then(next => { if (mounted) setStatus(next) }).catch(() => { if (mounted) setError(true) })
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => { mounted = false; version.current++; clearInterval(timer) }
  }, [])
  const act = async (action: LayaAction) => {
    if (actionPending.current && action !== 'stop') return
    actionPending.current = true
    const version = ++actionVersion.current
    setBusy(true); setError(false)
    try {
      if (action !== 'stop' && !await onSave()) return
      if (version !== actionVersion.current) return
      const next = await window.electron.knowledge.layaControl(action)
      if (version === actionVersion.current) setStatus(next)
    } catch { if (version === actionVersion.current) setError(true) }
    finally { if (version === actionVersion.current) { setBusy(false); actionPending.current = false } }
  }
  return <section className={styles.section}>
    <h3 className={styles.sectionTitle}>Laya</h3>
    <p>{t('knowledge:laya.description')}</p>
    <label><input type="checkbox" checked={settings.enabled} disabled={disabled || busy}
      onChange={event => onChange({ ...settings, enabled: event.target.checked })} />{t('knowledge:laya.enabled')}</label>
    <label>{t('knowledge:laya.python')}<input value={settings.pythonPath} disabled={disabled || busy}
      onChange={event => onChange({ ...settings, pythonPath: event.target.value })} /></label>
    <label>{t('knowledge:laya.model')}<input value={settings.modelPath} disabled={disabled || busy}
      onChange={event => onChange({ ...settings, modelPath: event.target.value })} /></label>
    <p role="status">{status ? `${status.phase}${status.reason ? ': ' + status.reason : ''}` : t('knowledge:laya.unknown')}</p>
    {status?.warmupMs !== undefined && <p>{t('knowledge:laya.timing', { warmup: status.warmupMs, inference: status.lastInferenceMs ?? 0 })}</p>}
    {error && <p role="alert">{t('knowledge:laya.failed')}</p>}
    <button type="button" disabled={disabled || busy || !settings.enabled} onClick={() => void act('prepare')}>{t('knowledge:laya.prepare')}</button>
    <button type="button" disabled={disabled || busy || !settings.enabled} onClick={() => void act('warm')}>{t('knowledge:laya.warm')}</button>
    <button type="button" onClick={() => void act('stop')}>{t('knowledge:laya.stop')}</button>
  </section>
}
