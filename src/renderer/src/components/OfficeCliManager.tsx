import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { OfficeInstallerProgressEvent, OfficeManagedInstallStatus } from '../../../shared/office'
import { officeService } from '@/services/office'
import styles from './AppSettingsModal.module.css'

const STATE_LABEL_KEY: Record<OfficeManagedInstallStatus['state'], string> = {
  'not-installed': 'settings:officeCli.state.notInstalled',
  'ready': 'settings:officeCli.state.ready',
  'busy': 'settings:officeCli.state.busy',
  'failed': 'settings:officeCli.state.failed',
}

export function OfficeCliManager() {
  const { t } = useI18n('settings')
  const [status, setStatus] = useState<OfficeManagedInstallStatus>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const result = await officeService.installerStatus({})
    if (result.ok) {
      setStatus(result.value)
      setError('')
    } else {
      setError(result.error.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const unsubscribe = officeService.onInstallerProgress((event: OfficeInstallerProgressEvent) => {
      setStatus((prev) => prev ? {
        ...prev,
        state: event.stage === 'complete' ? 'ready' : event.stage === 'failed' ? 'failed' : 'busy',
        error: event.stage === 'failed' ? event.message : prev.error,
      } : prev)
      if (event.stage === 'complete' || event.stage === 'failed') {
        setBusy(false)
        void refresh()
      }
    })
    return unsubscribe
  }, [refresh])

  const handleInstall = useCallback(async () => {
    setBusy(true)
    setError('')
    const result = await officeService.installerStart({ confirmed: true })
    if (result.ok) setStatus(result.value)
    else { setError(result.error.message); void refresh() }
    setBusy(false)
  }, [refresh])

  const handleRepair = useCallback(async () => {
    setBusy(true)
    setError('')
    const result = await officeService.installerStart({ confirmed: true, repair: true })
    if (result.ok) setStatus(result.value)
    else { setError(result.error.message); void refresh() }
    setBusy(false)
  }, [refresh])

  const handleRemove = useCallback(async () => {
    setBusy(true)
    setError('')
    const result = await officeService.installerRemove({ confirmed: true })
    if (result.ok) { setStatus(result.value); setError('') }
    else { setError(result.error.message); void refresh() }
    setBusy(false)
  }, [refresh])

  const handleCancel = useCallback(async () => {
    const result = await officeService.installerCancel({})
    if (result.ok) setStatus(result.value)
    else setError(result.error.message)
  }, [])

  if (loading) {
    return (
      <div className={styles.lsSection}>
        <div className={styles.lsLoading}>{t('settings:officeCli.loading')}</div>
      </div>
    )
  }

  const isBusy = status?.state === 'busy' || busy
  const isReady = status?.state === 'ready'
  const isFailed = status?.state === 'failed'

  return (
    <div className={styles.lsSection}>
      <div className={styles.lsCard}>
        <div className={styles.lsCardHeader}>
          <div className={styles.lsCardInfo}>
            <span className={styles.lsCardName}>
              {t('settings:officeCli.name')}
            </span>
            <span className={styles.lsCardDesc}>
              {t('settings:officeCli.desc')}
            </span>
          </div>
          <span
            className={`${styles.lsStateBadge} ${
              isReady ? styles.lsStateReady : isFailed ? styles.lsStateFailed : styles.lsStateIdle
            }`}
          >
            {t(STATE_LABEL_KEY[status?.state ?? 'not-installed'])}
          </span>
        </div>

        {(status?.version || status?.source) && (
          <div className={styles.lsCardMeta}>
            {status.version && (
              <span className={styles.lsMetaItem}>
                {t('settings:officeCli.label.version')}: {status.version}
              </span>
            )}
            {status.source && (
              <span className={styles.lsMetaItem}>
                {t('settings:officeCli.label.source')}: {status.source}
              </span>
            )}
          </div>
        )}

        {isFailed && (error || status?.error) && (
          <div className={styles.lsCardError}>{error || status?.error}</div>
        )}

        <div className={styles.lsCardActions}>
          {!isReady && !isBusy && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
              onClick={() => void handleInstall()}
            >
              {t('settings:officeCli.action.install')}
            </button>
          )}
          {isReady && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonGhost}`}
              disabled={isBusy}
              onClick={() => void handleRepair()}
            >
              {t('settings:officeCli.action.repair')}
            </button>
          )}
          {isReady && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonGhost}`}
              disabled={isBusy}
              onClick={() => void handleRemove()}
            >
              {t('settings:officeCli.action.remove')}
            </button>
          )}
          {isBusy && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonGhost}`}
              onClick={() => void handleCancel()}
            >
              {t('settings:officeCli.action.cancel')}
            </button>
          )}
          {isBusy && (
            <span className={styles.lsBusyText}>
              {t('settings:officeCli.action.working')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}