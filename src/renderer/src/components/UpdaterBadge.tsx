import { useEffect, useState, type MouseEvent } from 'react'
import { ArrowUpCircle, Download, Loader2, RotateCw } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { UpdaterState } from '../../../shared/ipc/updater'
import { applyUpdaterEvent, resolveUpdaterBadge } from '@/lib/updater-badge'
import styles from './UpdaterBadge.module.css'

/**
 * 标题栏 JanusX 右侧的更新徽标：仅在有新版动作价值时出现。
 * 点击打开设置关于页，查看更新说明并选择下载、重试或重启安装。
 */
export function UpdaterBadge({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useI18n('settings')
  const [state, setState] = useState<UpdaterState | null>(null)

  useEffect(() => {
    const api = window.electron?.updater
    if (!api) return
    let disposed = false
    void api.getState().then((initial) => {
      if (!disposed) setState(initial)
    }).catch(() => {})
    const off = api.onEvent((event) => {
      if (!disposed) setState((prev) => applyUpdaterEvent(prev, event))
    })
    return () => {
      disposed = true
      off()
    }
  }, [])

  const badge = resolveUpdaterBadge(state)
  if (!badge) return null

  const verifying = badge.kind === 'downloading' && badge.percent === 100
  const retry = state?.phase === 'error'
  const title = retry ? t('settings:updater.badge.error') : verifying ? t('settings:updater.verifying') : badge.kind === 'available'
    ? t('settings:updater.badge.available', { version: badge.version ?? '' })
    : badge.kind === 'downloading'
      ? t('settings:updater.badge.downloading', { percent: badge.percent ?? 0 })
      : t('settings:updater.badge.downloaded', { version: badge.version ?? '' })
  const label = retry ? t('settings:updater.badge.retryLabel')
    : verifying ? t('settings:updater.verifying')
      : badge.kind === 'available' ? t('settings:updater.badge.availableLabel')
        : badge.kind === 'downloaded' ? t('settings:updater.badge.downloadedLabel')
          : t('settings:updater.badge.downloadingLabel')

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation()
    onOpenSettings()
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={handleClick}
      className={styles.badge}
      data-state={retry ? 'error' : verifying ? 'verifying' : badge.kind}
    >
      {retry ? <RotateCw size={12} aria-hidden="true" /> : badge.kind === 'available' && <Download size={12} aria-hidden="true" />}
      {badge.kind === 'downloading' && <Loader2 size={12} className={styles.spinner} aria-hidden="true" />}
      {badge.kind === 'downloaded' && <ArrowUpCircle size={12} aria-hidden="true" />}
      <span>{label}</span>
      {badge.kind === 'downloading' && !verifying && <span className={styles.percent}>{badge.percent ?? 0}%</span>}
      {badge.kind === 'downloading' && (
        <span className={styles.track} aria-hidden="true"><span style={{ width: `${badge.percent ?? 0}%` }} /></span>
      )}
    </button>
  )
}
