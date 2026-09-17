import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { ProviderSettings } from '@janusx/llm-core'
import type { CcSwitchSyncState } from '../../../shared/ipc/cc-switch'
import { ccSwitchService } from '@/services/cc-switch'
import styles from './LlmConfigModal.module.css'

interface CliSyncSectionProps {
  providers: ProviderSettings[]
  defaultProviderId: string | null
}

function formatSyncTime(syncedAt: number): string {
  try {
    return new Date(syncedAt).toLocaleString()
  } catch {
    return String(syncedAt)
  }
}

export function CliSyncSection({ providers, defaultProviderId }: CliSyncSectionProps) {
  const { t } = useI18n('llm')
  const [syncState, setSyncState] = useState<CcSwitchSyncState>({ claude: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setSyncState(await ccSwitchService.syncState())
  }, [])

  useEffect(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    })
  }, [refresh])

  const defaultProvider = providers.find((provider) => provider.id === defaultProviderId) ?? null

  const handleApplyDefault = useCallback(async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.applyProvider({ toolId: 'claude', providerId: null })
      if (!result.success) {
        setError(result.error === 'NO_LLM_PROVIDER' ? t('llm:cli.error.noProvider') : (result.error ?? ''))
        return
      }
      setNotice(t('llm:cli.notice.synced', { name: result.providerName ?? '' }))
      await refresh()
    } catch (applyError: unknown) {
      setError(applyError instanceof Error ? applyError.message : String(applyError))
    } finally {
      setBusy(false)
    }
  }, [refresh, t])

  const handleRollback = useCallback(async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.rollbackProfile()
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('llm:cli.notice.rolledBack'))
      await refresh()
    } catch (rollbackError: unknown) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setBusy(false)
    }
  }, [refresh, t])

  const claude = syncState.claude
  const sourceAlive = claude ? providers.some((provider) => provider.id === claude.providerId) : false

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('llm:cli.sectionTitle')}</h3>
      <div className={styles.providerList}>
        <div className={styles.providerItem}>
          <div className={styles.providerMeta}>
            <div className={styles.providerName}>
              {t('llm:cli.janus.name')}
              <span className={styles.providerBadge}>{t('llm:cli.janus.badge')}</span>
            </div>
            <div className={styles.providerModel}>
              {defaultProvider
                ? t('llm:cli.janus.using', { name: defaultProvider.name })
                : t('llm:cli.janus.unconfigured')}
            </div>
          </div>
        </div>

        <div className={styles.providerItem}>
          <div className={styles.providerMeta}>
            <div className={styles.providerName}>{t('llm:cli.claude.name')}</div>
            <div className={styles.providerModel}>
              {claude
                ? t('llm:cli.claude.synced', { name: claude.providerName, time: formatSyncTime(claude.syncedAt) })
                : t('llm:cli.claude.notSynced')}
              {claude && !sourceAlive && ` · ${t('llm:cli.claude.sourceGone')}`}
            </div>
          </div>
          <div className={styles.providerActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact} ${styles.btnAccent}`}
              disabled={busy}
              onClick={() => void handleApplyDefault()}
            >
              {t('llm:cli.claude.applyDefault')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
              disabled={busy || !claude}
              onClick={() => void handleRollback()}
            >
              {t('llm:cli.claude.rollback')}
            </button>
          </div>
        </div>
      </div>

      {notice && <div className={styles.inlineHint}>{notice}</div>}
      {error && <div className={styles.notice}>{error}</div>}
      <div className={styles.inlineHint}>{t('llm:cli.hint')}</div>
    </section>
  )
}
