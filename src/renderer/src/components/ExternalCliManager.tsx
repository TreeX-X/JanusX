import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import {
  EXTERNAL_CLI_TOOL_META,
  isCliUpdateAvailable,
  type ExternalCliDetectResult,
  type ExternalCliToolId,
} from '../../../shared/ipc/external-cli'
import { externalCliService } from '@/services/external-cli'
import { EXTERNAL_CLI_TOOL_ICONS } from '@/lib/cli-tool-icons'
import styles from './AppSettingsModal.module.css'

type RowState = 'not-installed' | 'broken' | 'ready' | 'update-available'

const STATE_LABEL_KEY: Record<RowState, string> = {
  'not-installed': 'settings:cliTools.state.notInstalled',
  'broken': 'settings:cliTools.state.broken',
  'ready': 'settings:cliTools.state.ready',
  'update-available': 'settings:cliTools.state.updateAvailable',
}

function toRowState(detect: ExternalCliDetectResult | undefined, latestVersion: string | undefined): RowState {
  if (!detect || !detect.installed) return 'not-installed'
  if (!detect.runnable) return 'broken'
  if (isCliUpdateAvailable(detect.version, latestVersion)) return 'update-available'
  return 'ready'
}

export function ExternalCliManager({ toolId }: { toolId: ExternalCliToolId }) {
  const { t } = useI18n('settings')
  const meta = EXTERNAL_CLI_TOOL_META[toolId]
  const [detect, setDetect] = useState<ExternalCliDetectResult>()
  const [latestVersion, setLatestVersion] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [iconFailed, setIconFailed] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [justInstalled, setJustInstalled] = useState(false)

  // refresh 只更新探测数据，从不碰 error/notice：调用方自己决定何时清错，
  // 否则安装失败信息会被随后一次重探洗掉。
  // 最新版查询独立于本地探测：注册表往返可达 15 秒，行内先按本地结果首绘。
  const refreshDetect = useCallback(async () => {
    const detectResult = await externalCliService.detect(toolId)
    setDetect(detectResult)
    setLoading(false)
  }, [toolId])

  const refreshLatest = useCallback(async () => {
    const latestResult = await externalCliService.latest(toolId)
    setLatestVersion(latestResult.latestVersion)
  }, [toolId])

  const refresh = useCallback(async () => {
    await refreshDetect()
    await refreshLatest()
  }, [refreshDetect, refreshLatest])

  const refreshQuiet = useCallback(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      setLoading(false)
    })
  }, [refresh])

  // 手动重测必须有可见反馈：置 refreshing 态禁用按钮并转菊花，
  // 否则探测太快、值不变时用户会误以为点击无反应。
  // 菊花只跟本地探测走；latest 后台跟进，到了静默点亮徽标。
  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    setError('')
    void refreshDetect()
      .then(() => refreshLatest().catch(() => undefined))
      .catch((refreshError: unknown) => {
        setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      })
      .finally(() => {
        setRefreshing(false)
      })
  }, [refreshDetect, refreshLatest])

  useEffect(() => {
    refreshQuiet()
  }, [refreshQuiet])

  const handleInstall = useCallback(async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await externalCliService.install(toolId)
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
  }, [refresh, t, toolId])

  const state = toRowState(detect, latestVersion)
  const hint = (state === 'not-installed' || state === 'broken') ? detect?.hint : undefined
  const versionLine = [detect?.version, latestVersion && latestVersion !== detect?.version ? `→ ${latestVersion}` : '', detect?.source]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={styles.lsToolRow}>
      <div className={styles.lsToolRowMain}>
        {iconFailed ? (
          <span
            className={styles.lsToolIcon}
            style={{ background: `${meta.color}22`, borderColor: `${meta.color}55`, color: meta.color }}
            aria-hidden="true"
          >
            {meta.monogram}
          </span>
        ) : (
          <img
            className={styles.lsToolImg}
            src={EXTERNAL_CLI_TOOL_ICONS[toolId]}
            alt={meta.displayName}
            draggable={false}
            onError={() => setIconFailed(true)}
          />
        )}
        <div className={styles.lsToolRowInfo}>
          <span className={styles.lsCardName}>{meta.displayName}</span>
          {loading
            ? (
              <span className={styles.lsLoadingRow}>
                <span className={styles.lsSpinner} aria-hidden="true" />
                <span className={styles.lsToolRowMeta}>{t('settings:cliTools.loading')}</span>
              </span>
            )
            : versionLine
              ? <span className={styles.lsToolRowMeta}>{versionLine}</span>
              : <span className={styles.lsToolRowMeta}>{t(`settings:cliTools.tools.${toolId}.desc`)}</span>}
        </div>
        {!loading && (
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
        )}
        <span className={styles.lsToolRowActions}>
          {!loading && state === 'not-installed' && !busy && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
              onClick={() => void handleInstall()}
            >
              {t('settings:cliTools.action.install')}
            </button>
          )}
          {!loading && state === 'update-available' && !busy && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
              onClick={() => void handleInstall()}
            >
              {t('settings:cliTools.action.upgrade')}
            </button>
          )}
          {!loading && (state === 'ready' || state === 'broken') && !busy && !refreshing && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonGhost}`}
              onClick={handleRefresh}
            >
              {t('settings:cliTools.action.refresh')}
            </button>
          )}
          {refreshing && (
            <span className={styles.lsLoadingRow}>
              <span className={styles.lsSpinner} aria-hidden="true" />
              <span className={styles.lsBusyText}>
                {t('settings:cliTools.action.refreshing')}
              </span>
            </span>
          )}
          {busy && (
            <span className={styles.lsBusyText}>
              {t('settings:cliTools.action.working')}
            </span>
          )}
        </span>
      </div>

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
    </div>
  )
}
