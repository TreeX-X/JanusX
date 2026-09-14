import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { getUpdaterSettings, updateUpdaterSettings } from '@/services/updater-settings'
import { DEFAULT_UPDATER_SETTINGS, type UpdaterState } from '../../../shared/ipc/updater'
import { applyUpdaterEvent } from '@/lib/updater-badge'
import styles from './NotificationSettingsPanel.module.css'

const UNSUPPORTED_KEY: Record<string, string> = {
  'non-windows-p0': 'settings:updater.unsupportedWin',
  'dev-mode': 'settings:updater.unsupportedDev',
  portable: 'settings:updater.unsupportedPortable',
}

/**
 * 设置中心通用页的应用更新区（Win P0）。
 * 状态机归主进程，UI 只做展示与触发：自动检查开关（即时保存）/ 手动检查 / 重启安装。
 */
export function UpdaterSettings() {
  const { t } = useI18n('settings')
  const [state, setState] = useState<UpdaterState | null>(null)
  const [autoCheck, setAutoCheck] = useState(DEFAULT_UPDATER_SETTINGS.autoCheck)
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const api = window.electron?.updater
    if (!api) return
    let disposed = false
    setBusy(true)
    Promise.all([getUpdaterSettings(), api.getState()]).then(([settings, initial]) => {
      if (disposed) return
      setAutoCheck(settings.autoCheck)
      setState(initial)
      setBusy(false)
    }).catch(() => {
      if (disposed) return
      setError(t('settings:updater.error.load'))
      setBusy(false)
    })
    const off = api.onEvent((event) => {
      if (!disposed) setState((prev) => applyUpdaterEvent(prev, event))
    })
    return () => {
      disposed = true
      off()
    }
  }, [t])

  const toggleAutoCheck = async (checked: boolean) => {
    if (!window.electron?.updater || saving) return
    setSaving(true)
    setError('')
    try {
      const next = await updateUpdaterSettings({ autoCheck: checked })
      setAutoCheck(next.autoCheck)
    } catch {
      setError(t('settings:updater.error.save'))
    } finally {
      setSaving(false)
    }
  }

  const check = async () => {
    const api = window.electron?.updater
    if (!api || busy) return
    setBusy(true)
    setError('')
    try {
      const next = await api.check()
      setState(next)
    } catch {
      setError(t('settings:updater.error.save'))
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
      <SettingSwitch
        label={t('settings:updater.autoCheck.label')}
        hint={t('settings:updater.autoCheck.hint')}
        checked={autoCheck}
        disabled={busy || saving}
        onChange={(checked) => void toggleAutoCheck(checked)}
      />
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
      {error && <div style={{ color: '#c96a5e' }}>{error}</div>}
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
      return <div style={{ color: '#c96a5e' }}>{t('settings:updater.error.update', { message: state.error ?? '' })}</div>
    default:
      return null
  }
}

function SettingSwitch({ label,
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
