import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { isCliUpdateAvailable, type CcSwitchDetectResult } from '../../../shared/ipc/cc-switch'
import { ccSwitchService } from '@/services/cc-switch'
import styles from './AppSettingsModal.module.css'

type CardState = 'not-installed' | 'broken' | 'ready' | 'update-available'

const STATE_LABEL_KEY: Record<CardState, string> = {
  'not-installed': 'settings:cliTools.state.notInstalled',
  'broken': 'settings:cliTools.state.broken',
  'ready': 'settings:cliTools.state.ready',
  'update-available': 'settings:cliTools.state.updateAvailable',
}

function toCardState(detect: CcSwitchDetectResult | undefined, latestVersion: string | undefined): CardState {
  if (!detect || !detect.installed) return 'not-installed'
  if (!detect.runnable) return 'broken'
  if (isCliUpdateAvailable(detect.version, latestVersion)) return 'update-available'
  return 'ready'
}

export function CcSwitchManager() {
  const { t } = useI18n('settings')
  const [detect, setDetect] = useState<CcSwitchDetectResult>()
  const [latestVersion, setLatestVersion] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [detectResult, latestResult] = await Promise.all([
      ccSwitchService.detect('claude'),
      ccSwitchService.latest('claude'),
    ])
    setDetect(detectResult)
    setLatestVersion(latestResult.latestVersion)
    setError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      setLoading(false)
    })
  }, [refresh])

  const handleInstall = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const result = await ccSwitchService.install('claude')
      if (!result.success) {
        setError(result.error ?? '')
        await refresh()
        return
      }
      await refresh()
    } catch (installError: unknown) {
      setError(installError instanceof Error ? installError.message : String(installError))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  if (loading) {
    return (
      <div className={styles.lsSection}>
        <div className={styles.lsLoading}>{t('settings:cliTools.loading')}</div>
      </div>
    )
  }

  const state = toCardState(detect, latestVersion)
  const showHint = (state === 'not-installed' || state === 'broken') && detect?.hint

  return (
    <div className={styles.lsSection}>
      <div className={styles.lsCard}>
        <div className={styles.lsCardHeader}>
          <div className={styles.lsCardInfo}>
            <span className={styles.lsCardName}>
              {t('settings:cliTools.name')}
            </span>
            <span className={styles.lsCardDesc}>
              {t('settings:cliTools.desc')}
            </span>
          </div>
          <span
            className={`${styles.lsStateBadge} ${
              state === 'ready' ? styles.lsStateReady : state === 'not-installed' ? styles.lsStateIdle : styles.lsStateFailed
            }`}
          >
            {t(STATE_LABEL_KEY[state])}
          </span>
        </div>

        {(detect?.version || latestVersion || detect?.source) && (
          <div className={styles.lsCardMeta}>
            {detect?.version && (
              <span className={styles.lsMetaItem}>
                {t('settings:cliTools.label.version')}: {detect.version}
              </span>
            )}
            {latestVersion && (
              <span className={styles.lsMetaItem}>
                {t('settings:cliTools.label.latest')}: {latestVersion}
              </span>
            )}
            {detect?.source && (
              <span className={styles.lsMetaItem}>
                {t('settings:cliTools.label.source')}: {detect.source}
              </span>
            )}
          </div>
        )}

        {showHint && <div className={styles.lsCardError}>{detect?.hint}</div>}
        {error && <div className={styles.lsCardError}>{error}</div>}
        {detect?.existingTerminalNotice && state === 'ready' && (
          <div className={styles.lsCardMeta}>
            <span className={styles.lsMetaItem}>{t('settings:cliTools.notice.existingTerminal')}</span>
          </div>
        )}

        <div className={styles.lsCardActions}>
          {state === 'not-installed' && !busy && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
              onClick={() => void handleInstall()}
            >
              {t('settings:cliTools.action.install')}
            </button>
          )}
          {state === 'update-available' && !busy && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
              onClick={() => void handleInstall()}
            >
              {t('settings:cliTools.action.upgrade')}
            </button>
          )}
          {(state === 'ready' || state === 'broken') && !busy && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonGhost}`}
              onClick={() => void refresh()}
            >
              {t('settings:cliTools.action.refresh')}
            </button>
          )}
          {busy && (
            <span className={styles.lsBusyText}>
              {t('settings:cliTools.action.working')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
