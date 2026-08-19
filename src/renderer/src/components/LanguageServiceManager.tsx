import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type {
  LanguageServiceId,
  LanguageServiceInstallerProgressEvent,
  LanguageServiceManagedInstallStatus,
} from '../../../shared/ipc/language-service'
import { Select } from './ui/Select'
import styles from './AppSettingsModal.module.css'

interface ServiceCard {
  id: LanguageServiceId
  status: LanguageServiceManagedInstallStatus
}

const STATE_LABEL_KEY: Record<LanguageServiceManagedInstallStatus['state'], string> = {
  'not-installed': 'settings:languageService.state.notInstalled',
  'ready': 'settings:languageService.state.ready',
  'busy': 'settings:languageService.state.busy',
  'failed': 'settings:languageService.state.failed',
}

export function LanguageServiceManager() {
  const { t } = useI18n('settings')
  const [cards, setCards] = useState<ServiceCard[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<LanguageServiceId | null>(null)

  const refreshAll = useCallback(async () => {
    const serviceIds: LanguageServiceId[] = ['clangd']
    const results = await Promise.all(
      serviceIds.map((id) =>
        window.electron.languageService.installer.status({ serviceId: id }),
      ),
    )
    setCards(results.map((status, i) => ({ id: serviceIds[i], status })))
    setLoading(false)
  }, [])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  useEffect(() => {
    const unsubscribe = window.electron.languageService.installer.onInstallerProgress(
      (event: LanguageServiceInstallerProgressEvent) => {
        setCards((prev) =>
          prev.map((card) =>
            card.id === event.serviceId
              ? {
                  ...card,
                  status: {
                    ...card.status,
                    state: event.stage === 'complete' ? 'ready' : event.stage === 'failed' ? 'failed' : 'busy',
                    error: event.stage === 'failed' ? event.message : undefined,
                  },
                }
              : card,
          ),
        )
        if (event.stage === 'complete' || event.stage === 'failed') {
          setBusyId(null)
          void refreshAll()
        }
      },
    )
    return unsubscribe
  }, [refreshAll])

  const handleInstall = useCallback(async (serviceId: LanguageServiceId) => {
    setBusyId(serviceId)
    try {
      const status = await window.electron.languageService.installer.start({
        serviceId,
        confirmed: true,
      })
      setCards((prev) =>
        prev.map((card) => (card.id === serviceId ? { ...card, status } : card)),
      )
    } catch {
      void refreshAll()
    } finally {
      setBusyId(null)
    }
  }, [refreshAll])

  const handleRemove = useCallback(async (serviceId: LanguageServiceId) => {
    setBusyId(serviceId)
    try {
      const status = await window.electron.languageService.installer.remove({
        serviceId,
        confirmed: true,
      })
      setCards((prev) =>
        prev.map((card) => (card.id === serviceId ? { ...card, status } : card)),
      )
    } catch {
      void refreshAll()
    } finally {
      setBusyId(null)
    }
  }, [refreshAll])

  const handleRepair = useCallback(async (serviceId: LanguageServiceId) => {
    setBusyId(serviceId)
    try {
      const status = await window.electron.languageService.installer.start({
        serviceId,
        confirmed: true,
        repair: true,
      })
      setCards((prev) =>
        prev.map((card) => (card.id === serviceId ? { ...card, status } : card)),
      )
    } catch {
      void refreshAll()
    } finally {
      setBusyId(null)
    }
  }, [refreshAll])

  if (loading) {
    return (
      <div className={styles.lsSection}>
        <div className={styles.lsLoading}>{t('settings:languageService.loading')}</div>
      </div>
    )
  }

  return (
    <div className={styles.lsSection}>
      {cards.map((card) => {
        const { status } = card
        const isBusy = status.state === 'busy' || busyId === card.id
        const isReady = status.state === 'ready'
        const isFailed = status.state === 'failed'

        return (
          <div key={card.id} className={styles.lsCard}>
            <div className={styles.lsCardHeader}>
              <div className={styles.lsCardInfo}>
                <span className={styles.lsCardName}>
                  {t('settings:languageService.service.' + card.id + '.name')}
                </span>
                <span className={styles.lsCardDesc}>
                  {t('settings:languageService.service.' + card.id + '.desc')}
                </span>
              </div>
              <span
                className={`${styles.lsStateBadge} ${
                  isReady ? styles.lsStateReady : isFailed ? styles.lsStateFailed : styles.lsStateIdle
                }`}
              >
                {t(STATE_LABEL_KEY[status.state])}
              </span>
            </div>

            {(status.version || status.source) && (
              <div className={styles.lsCardMeta}>
                {status.version && (
                  <span className={styles.lsMetaItem}>
                    {t('settings:languageService.label.version')}: {status.version}
                  </span>
                )}
                {status.source && (
                  <span className={styles.lsMetaItem}>
                    {t('settings:languageService.label.source')}: {status.source}
                  </span>
                )}
              </div>
            )}

            {isFailed && status.error && (
              <div className={styles.lsCardError}>{status.error}</div>
            )}

            <div className={styles.lsCardActions}>
              {!isReady && !isBusy && (
                <button
                  type="button"
                  className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
                  onClick={() => void handleInstall(card.id)}
                >
                  {t('settings:languageService.action.install')}
                </button>
              )}
              {isReady && (
                <button
                  type="button"
                  className={`${styles.lsButton} ${styles.lsButtonGhost}`}
                  disabled={isBusy}
                  onClick={() => void handleRepair(card.id)}
                >
                  {t('settings:languageService.action.repair')}
                </button>
              )}
              {isReady && (
                <button
                  type="button"
                  className={`${styles.lsButton} ${styles.lsButtonGhost}`}
                  disabled={isBusy}
                  onClick={() => void handleRemove(card.id)}
                >
                  {t('settings:languageService.action.remove')}
                </button>
              )}
              {isBusy && (
                <span className={styles.lsBusyText}>
                  {t('settings:languageService.action.working')}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}