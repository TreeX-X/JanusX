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
  const [syncBusy, setSyncBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [syncedProvider, setSyncedProvider] = useState('')
  const [justInstalled, setJustInstalled] = useState(false)

  // refresh 只更新探测数据，从不碰 error/notice：调用方自己决定何时清错，
  // 否则安装失败信息会被随后一次重探洗掉。
  const refresh = useCallback(async () => {
    const [detectResult, latestResult] = await Promise.all([
      ccSwitchService.detect('claude'),
      ccSwitchService.latest('claude'),
    ])
    setDetect(detectResult)
    setLatestVersion(latestResult.latestVersion)
    setLoading(false)
  }, [])

  const refreshQuiet = useCallback(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      setLoading(false)
    })
  }, [refresh])

  useEffect(() => {
    refreshQuiet()
  }, [refreshQuiet])

  const handleInstall = useCallback(async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.install('claude')
      if (!result.success) {
        setError(result.error ?? '')
      } else {
        setJustInstalled(true)
        setNotice(t('settings:cliTools.notice.installed'))
      }
      await refresh()
    } catch (installError: unknown) {
      setError(installError instanceof Error ? installError.message : String(installError))
    } finally {
      setBusy(false)
    }
  }, [refresh, t])

  const handleApplyLlm = useCallback(async () => {
    setSyncBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.applyLlm('claude')
      if (!result.success) {
        setError(result.error === 'NO_LLM_PROVIDER' ? t('settings:cliTools.sync.error.noProvider') : (result.error ?? ''))
        return
      }
      setSyncedProvider(result.providerName ?? '')
      setNotice(t('settings:cliTools.sync.notice.synced', { name: result.providerName ?? '' }))
    } catch (applyError: unknown) {
      setError(applyError instanceof Error ? applyError.message : String(applyError))
    } finally {
      setSyncBusy(false)
    }
  }, [t])

  const handleRollback = useCallback(async () => {
    setSyncBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.rollbackProfile()
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setSyncedProvider('')
      setNotice(t('settings:cliTools.sync.notice.rolledBack'))
    } catch (rollbackError: unknown) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setSyncBusy(false)
    }
  }, [t])

  if (loading) {
    return (
      <div className={styles.lsSection}>
        <div className={styles.lsLoading}>{t('settings:cliTools.loading')}</div>
      </div>
    )
  }

  const state = toCardState(detect, latestVersion)
  const hint = (state === 'not-installed' || state === 'broken') ? detect?.hint : undefined

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
              state === 'ready'
                ? styles.lsStateReady
                : state === 'update-available'
                  ? styles.lsStateUpdate
                  : state === 'not-installed'
                    ? styles.lsStateIdle
                    : styles.lsStateFailed
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

        {hint && <div className={styles.lsCardHint}>{hint}</div>}
        {notice && (
          <div className={styles.lsCardMeta}>
            <span className={styles.lsMetaItem}>{notice}</span>
          </div>
        )}
        {error && <div className={styles.lsCardError}>{error}</div>}
        {justInstalled && state === 'ready' && (
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
              onClick={refreshQuiet}
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

        <div className={styles.lsCardMeta}>
          <span className={styles.lsMetaItem}>{t('settings:cliTools.sync.desc')}</span>
          {syncedProvider && (
            <span className={styles.lsMetaItem}>
              {t('settings:cliTools.sync.label.source')}: {syncedProvider}
            </span>
          )}
        </div>
        <div className={styles.lsCardActions}>
          <button
            type="button"
            className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
            disabled={syncBusy}
            onClick={() => void handleApplyLlm()}
          >
            {t('settings:cliTools.sync.action.apply')}
          </button>
          <button
            type="button"
            className={`${styles.lsButton} ${styles.lsButtonGhost}`}
            disabled={syncBusy}
            onClick={() => void handleRollback()}
          >
            {t('settings:cliTools.sync.action.rollback')}
          </button>
          {syncBusy && (
            <span className={styles.lsBusyText}>
              {t('settings:cliTools.action.working')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
