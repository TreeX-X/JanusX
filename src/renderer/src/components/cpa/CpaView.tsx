import { useEffect, useState } from 'react'
import { ExternalLink, Settings } from 'lucide-react'
import { BrowserSurface } from '@/components/browser/BrowserSurface'
import { ModalFrame } from '@/components/shared/ModalFrame'
import { useCpaStore } from '@/stores/cpa'
import { useBrowserStore } from '@/stores/browser'
import { useWorkspaceStore } from '@/stores/workspace'
import { getLeafPanes } from '@/lib/workspace-pane'
import { CPA_VIEW_ID } from '@/extensions/cpa'
import type { ExtensionViewProps } from '@/extensions/types'
import { useI18n } from '@/i18n/useI18n'
import { CPA_SURFACE_ID } from '../../../../shared/ipc/cpa'
import { CpaSettingsPanel } from './CpaSettingsPanel'
import styles from './Cpa.module.css'

function isViewOpen(): boolean {
  return getLeafPanes(useWorkspaceStore.getState().paneTree).some((leaf) =>
    leaf.tabs.some((tab) => tab.type === 'extension' && tab.viewId === CPA_VIEW_ID))
}

export function CpaView({ active }: ExtensionViewProps) {
  const { t } = useI18n('common')
  const settings = useCpaStore((state) => state.settings)
  const status = useCpaStore((state) => state.status)
  const shouldOpen = useCpaStore((state) => state.shouldOpen)
  const revision = useCpaStore((state) => state.revision)
  const [readyUrl, setReadyUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [configure, setConfigure] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let disposed = false
    void useCpaStore.getState().load().catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true }
  }, [retry])

  useEffect(() => {
    if (!settings || !shouldOpen || settings.mode === 'managed' && !settings.enabled) return
    let disposed = false
    setError(false)
    setReadyUrl(null)
    void window.electron.cpa.open().then(async () => {
      const state = await window.electron.browser.getState(CPA_SURFACE_ID)
      if (disposed) return
      if (!state) throw new Error('cpa-surface-unavailable')
      useBrowserStore.getState().applySurfaceState(state)
      setReadyUrl(settings.managementUrl)
    }).catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true }
  }, [settings, retry, revision, shouldOpen])

  useEffect(() => {
    if (!active || settings?.mode !== 'managed') return
    const poll = () => { void useCpaStore.getState().refreshStatus().catch(() => {}) }
    poll()
    const timer = setInterval(poll, 1000)
    return () => clearInterval(timer)
  }, [active, settings?.mode])

  useEffect(() => () => {
    // Application tabs transfer between projects: keep the same live guest.
    // Only a real close/removal releases it. Its isolated login data persists.
    if (!isViewOpen()) void window.electron.cpa.close().catch(() => {})
  }, [])

  useEffect(() => { if (!active) setConfigure(false) }, [active])

  return <div className={styles.shell} data-cpa-view>
    <div className={styles.toolbar}>
      <span>{t('common:cpa.title')}</span>
      {settings?.mode === 'managed' && settings.enabled && <button type="button" onClick={() => {
        void window.electron.cpa.copyManagementKey().then(() => setCopied(true)).catch(() => setError(true))
      }}>{copied ? t('common:cpa.keyCopied') : t('common:cpa.copyKey')}</button>}
      <button type="button" onClick={() => { void window.electron.cpa.openExternal().catch(() => setError(true)) }}>
        <ExternalLink size={13} aria-hidden="true" />{t('common:cpa.openExternal')}
      </button>
      <button type="button" onClick={() => setConfigure(true)}><Settings size={13} aria-hidden="true" />{t('common:cpa.configure')}</button>
    </div>
    {settings?.mode === 'managed' && shouldOpen && status?.oauthFallback && <div className={styles.oauthNotice} role="status" data-cpa-oauth-fallback>
      <strong>{t('common:cpa.oauthManual', { provider: status.oauthFallback.provider, port: status.oauthFallback.port })}</strong>
      <p>{t(`common:cpa.oauthReason.${status.oauthFallback.reason}`)} {t('common:cpa.oauthManualHelp')}</p>
    </div>}
    {settings?.mode === 'managed' && status?.oauthBrowserError && <p className={styles.oauthNotice} role="alert">{t('common:cpa.oauthBrowserFailed')}</p>}
    {settings?.mode === 'managed' && !settings.enabled ? <div className={styles.setup}><CpaSettingsPanel /></div>
      : !shouldOpen ? <div className={styles.message}>
        <p>{t('common:cpa.phase.stopped')}</p>
        <button type="button" onClick={() => { void useCpaStore.getState().operate('start').catch(() => setError(true)) }}>{t('common:cpa.start')}</button>
      </div> : error ? <div className={styles.message} role="alert">
      <p>{t('common:cpa.openFailed')}</p>
      {status?.error === 'cpa-port-in-use' && <p>{t('common:cpa.portInUse')}</p>}
      <button type="button" onClick={() => { setError(false); setRetry((value) => value + 1) }}>{t('common:action.retry')}</button>
    </div> : readyUrl === settings?.managementUrl
      ? <BrowserSurface surfaceId={CPA_SURFACE_ID} carrier="pane" visible={active} serviceUrl={readyUrl} />
      : <div className={styles.message} role="status">{settings?.mode === 'managed' && status ? t(`common:cpa.phase.${status.phase}`) : t('common:status.loading')}{status?.progress !== undefined && ` · ${status.progress}%`}</div>}
    {configure && <ModalFrame label={t('common:cpa.configure')} onClose={() => setConfigure(false)} panelClassName={styles.dialog}>
      {({ requestClose }) => <><CpaSettingsPanel onOpened={requestClose} />
        <div className={styles.dialogFooter}><button type="button" onClick={requestClose}>{t('common:action.close')}</button></div></>}
    </ModalFrame>}
  </div>
}
