import { useEffect, useState } from 'react'
import { useCpaStore } from '@/stores/cpa'
import { openExtensionView } from '@/extensions/workbench'
import { CPA_VIEW_ID } from '@/extensions/cpa'
import { useI18n } from '@/i18n/useI18n'
import { normalizeCpaSettings } from '../../../../shared/ipc/cpa'
import styles from './Cpa.module.css'

export function CpaSettingsPanel({ onOpened }: { onOpened?: () => void }) {
  const { t } = useI18n('common')
  const settings = useCpaStore((state) => state.settings)
  const status = useCpaStore((state) => state.status)
  const [draft, setDraft] = useState(settings?.managementUrl ?? '')
  const [mode, setMode] = useState<'managed' | 'external'>(settings?.mode ?? 'managed')
  const [enabled, setEnabled] = useState(settings?.enabled ?? false)
  const [port, setPort] = useState(String(settings?.port ?? 8317))
  const [autoUpdate, setAutoUpdate] = useState(settings?.autoUpdate ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let disposed = false
    void useCpaStore.getState().load().catch(() => { if (!disposed) setError(t('common:cpa.settingsFailed')) })
    return () => { disposed = true }
  }, [t])
  useEffect(() => {
    if (!settings) return
    setDraft(settings.managementUrl); setMode(settings.mode ?? 'external'); setPort(String(settings.port ?? 8317))
    setEnabled(settings.enabled ?? false); setAutoUpdate(settings.autoUpdate ?? true)
  }, [settings])
  useEffect(() => {
    if (mode !== 'managed') return
    const poll = () => { void useCpaStore.getState().refreshStatus().catch(() => {}) }
    poll()
    const timer = setInterval(poll, 1000)
    return () => clearInterval(timer)
  }, [mode])

  const save = async (open: boolean) => {
    setError(null)
    setSaved(false)
    let next
    try { next = normalizeCpaSettings({ mode, enabled, port: Number(port), autoUpdate, managementUrl: draft }) }
    catch { setError(mode === 'managed' ? t('common:cpa.invalidPort') : t('common:cpa.invalidUrl')); return }
    setBusy(true)
    try {
      await useCpaStore.getState().save(next)
      setSaved(true)
      if (open) {
        if (!openExtensionView(CPA_VIEW_ID)) throw new Error('cpa-unavailable')
        onOpened?.()
      }
    } catch (failure) { setError(operationError(failure)) }
    finally { setBusy(false) }
  }

  const operationError = (failure: unknown) => {
    const message = failure instanceof Error ? failure.message : ''
    if (message.includes('cpa-port-in-use')) return t('common:cpa.portInUse')
    if (message.includes('cpa-encryption-unavailable')) return t('common:cpa.encryptionUnavailable')
    if (message.includes('cpa-checksum-mismatch')) return t('common:cpa.checksumFailed')
    return t('common:cpa.operationFailed')
  }
  const operate = async (action: 'start' | 'stop' | 'restart' | 'update' | 'copyManagementKey' | 'openLogs') => {
    setBusy(true); setError(null); setNotice(null)
    try {
      if (action === 'copyManagementKey' || action === 'openLogs') {
        await window.electron.cpa[action]()
        if (action === 'copyManagementKey') setNotice(t('common:cpa.keyCopied'))
      } else await useCpaStore.getState().operate(action)
    } catch (failure) { setError(operationError(failure)) }
    finally { setBusy(false) }
  }

  return <section className={styles.settings} aria-label={t('common:cpa.title')}>
    <h3>CPA · CLIProxyAPI</h3>
    <p>{t('common:cpa.description')}</p>
    <label className={styles.field}>
      <span>{t('common:cpa.mode')}</span>
      <select value={mode} disabled={busy} onChange={(event) => setMode(event.target.value as 'managed' | 'external')}>
        <option value="managed">{t('common:cpa.managed')}</option>
        <option value="external">{t('common:cpa.external')}</option>
      </select>
    </label>
    {mode === 'managed' ? <>
      <label className={styles.check}><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.target.checked)} />{t('common:cpa.enableManaged')}</label>
      <p>{t('common:cpa.managedHelp')}</p>
      <label className={styles.field}><span>{t('common:cpa.port')}</span>
        <input type="number" min={1024} max={65535} value={port} disabled={busy} onChange={(event) => setPort(event.target.value)} />
      </label>
      <p>{t('common:cpa.portHelp')}</p>
      <label className={styles.check}><input type="checkbox" checked={autoUpdate} disabled={busy} onChange={(event) => setAutoUpdate(event.target.checked)} />{t('common:cpa.autoUpdate')}</label>
      <p>{t('common:cpa.updateHelp')}</p>
      {status && <p role="status">{t('common:cpa.runtimeStatus')}: {t(`common:cpa.phase.${status.phase}`)}{status.progress !== undefined && ` · ${status.progress}%`}{status.version && ` · ${status.version}`}</p>}
      {status?.pendingVersion && <p>{t('common:cpa.updateReady')}: {status.pendingVersion}</p>}
      {(status?.error || status?.updateError) && <p role="alert">{operationError(new Error(status.error ?? status.updateError))}</p>}
      {settings?.mode === 'managed' && settings.enabled && <div className={styles.actions}>
        <button type="button" disabled={busy || status?.phase === 'running'} onClick={() => void operate('start')}>{t('common:cpa.start')}</button>
        <button type="button" disabled={status?.phase !== 'running' && status?.phase !== 'starting' && status?.phase !== 'downloading'} onClick={() => void operate('stop')}>{t('common:cpa.stop')}</button>
        <button type="button" disabled={busy} onClick={() => void operate('restart')}>{t('common:cpa.restart')}</button>
        <button type="button" disabled={busy} onClick={() => void operate('update')}>{t('common:cpa.updateNow')}</button>
        <button type="button" disabled={busy} onClick={() => void operate('copyManagementKey')}>{t('common:cpa.copyKey')}</button>
        <button type="button" disabled={busy} onClick={() => void operate('openLogs')}>{t('common:cpa.logs')}</button>
      </div>}
      <p>{t('common:cpa.managedLoginHelp')}</p>
    </> : <>
    <label className={styles.field}>
      <span>{t('common:cpa.managementUrl')}</span>
      <input value={draft} spellCheck={false} placeholder="http://127.0.0.1:8317/management.html"
        disabled={busy} onChange={(event) => { setDraft(event.target.value); setSaved(false) }} />
    </label>
    <p>{t('common:cpa.addressHelp')}</p>
    <p>{t('common:cpa.loginHelp')}</p>
    </>}
    <p>{t('common:cpa.quotaHelp')}</p>
    <div className={styles.actions}>
      <button type="button" disabled={busy || !settings} onClick={() => void save(false)}>{settings?.mode === 'managed' && status?.phase === 'running' && (Number(port) !== settings.port || mode !== settings.mode || !enabled) ? t('common:cpa.saveRestart') : t('common:action.save')}</button>
      <button type="button" disabled={busy || !settings || mode === 'managed' && !enabled} onClick={() => void save(true)}>{t('common:cpa.saveAndOpen')}</button>
    </div>
    {saved && <p role="status">{t('common:cpa.saved')}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
