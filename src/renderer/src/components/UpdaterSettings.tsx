import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { UpdaterEvent, UpdaterState } from '../../../shared/ipc/updater'

const UNSUPPORTED_KEY: Record<string, string> = {
  'non-windows-p0': 'settings:updater.unsupportedWin',
  'dev-mode': 'settings:updater.unsupportedDev',
  portable: 'settings:updater.unsupportedPortable',
}

/**
 * 设置中心通用页的应用更新区（Win P0）。
 * 状态机归主进程，UI 只做展示与触发：检查更新 / 重启安装。
 */
export function UpdaterSettings() {
  const { t } = useI18n('settings')
  const [state, setState] = useState<UpdaterState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.electron?.updater
    if (!api) return
    let disposed = false
    void api.getState().then((initial) => {
      if (!disposed) setState(initial)
    }).catch(() => {})
    const off = api.onEvent((event: UpdaterEvent) => {
      setState((prev) => {
        const base: UpdaterState = prev ?? {
          phase: 'idle',
          supported: true,
          unsupportedReason: null,
          currentVersion: '',
          availableVersion: null,
          downloadPercent: null,
          error: null,
        }
        switch (event.type) {
          case 'checking':
            return { ...base, phase: 'checking', error: null }
          case 'available':
            return { ...base, phase: 'available', availableVersion: event.version, error: null }
          case 'not-available':
            return { ...base, phase: 'up-to-date', availableVersion: null, downloadPercent: null }
          case 'progress':
            return { ...base, phase: 'downloading', downloadPercent: event.percent }
          case 'downloaded':
            return { ...base, phase: 'downloaded', availableVersion: event.version, downloadPercent: 100 }
          case 'error':
            return { ...base, phase: 'error', error: event.message }
        }
      })
    })
    return () => {
      disposed = true
      off()
    }
  }, [])

  const check = async () => {
    const api = window.electron?.updater
    if (!api || busy) return
    setBusy(true)
    try {
      const next = await api.check()
      setState(next)
    } catch {
      /* 主进程错误经事件通道回传 error 状态 */
    } finally {
      setBusy(false)
    }
  }

  const install = async () => {
    const api = window.electron?.updater
    if (!api || busy) return
    setBusy(true)
    try {
      await api.install()
    } finally {
      setBusy(false)
    }
  }

  if (!window.electron?.updater) {
    return <div style={{ fontSize: 12, color: '#8a8a8a' }}>{t('settings:updater.unsupportedDev')}</div>
  }

  const unsupportedKey = state && !state.supported && state.unsupportedReason
    ? UNSUPPORTED_KEY[state.unsupportedReason]
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <div style={{ color: '#8a8a8a' }}>
        {t('settings:updater.currentVersion', { version: state?.currentVersion ?? '…' })}
      </div>
      {unsupportedKey
        ? <div style={{ color: '#8a8a8a' }}>{t(unsupportedKey)}</div>
        : (
          <>
            <StatusLine state={state} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => void check()}
                disabled={busy || state?.phase === 'checking' || state?.phase === 'downloading'}
              >
                {state?.phase === 'checking' ? t('settings:updater.checking') : t('settings:updater.check')}
              </button>
              {state?.phase === 'downloaded' && (
                <button type="button" onClick={() => void install()} disabled={busy}>
                  {t('settings:updater.restart')}
                </button>
              )}
            </div>
          </>
        )}
    </div>
  )
}

function StatusLine({ state }: { state: UpdaterState | null }) {
  const { t } = useI18n('settings')
  if (!state) return null
  switch (state.phase) {
    case 'up-to-date':
      return <div style={{ color: '#7fb069' }}>{t('settings:updater.upToDate')}</div>
    case 'available':
      return <div>{t('settings:updater.available', { version: state.availableVersion ?? '' })}</div>
    case 'downloading':
      return <div>{t('settings:updater.downloading', { percent: state.downloadPercent ?? 0 })}</div>
    case 'downloaded':
      return <div style={{ color: '#7fb069' }}>{t('settings:updater.downloaded', { version: state.availableVersion ?? '' })}</div>
    case 'error':
      return <div style={{ color: '#c96a5e' }}>{t('settings:updater.error', { message: state.error ?? '' })}</div>
    default:
      return null
  }
}
