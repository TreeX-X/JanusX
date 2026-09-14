import { useEffect, useState, type MouseEvent } from 'react'
import { ArrowUpCircle, Download, Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { UpdaterState } from '../../../shared/ipc/updater'
import { applyUpdaterEvent, resolveUpdaterBadge } from '@/lib/updater-badge'

/**
 * 标题栏 JanusX 右侧的更新徽标：仅在有新版动作价值时出现。
 * 已就绪则点击直接重启安装，其余点击打开设置通用页查看进度。
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

  const title = badge.kind === 'available'
    ? t('settings:updater.badge.available', { version: badge.version ?? '' })
    : badge.kind === 'downloading'
      ? t('settings:updater.badge.downloading', { percent: badge.percent ?? 0 })
      : t('settings:updater.badge.downloaded', { version: badge.version ?? '' })

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation()
    if (badge.kind === 'downloaded') {
      void window.electron?.updater.install().catch(() => {})
      return
    }
    onOpenSettings()
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={handleClick}
      className="relative flex items-center justify-center w-5 h-5 rounded-full cursor-pointer hover:brightness-125 active:brightness-90"
      style={{
        background: badge.kind === 'downloaded' ? 'rgba(255,120,48,0.22)' : 'rgba(255,120,48,0.12)',
        border: '1px solid rgba(255,120,48,0.55)',
      }}
    >
      {badge.kind === 'available' && <Download size={11} color="#ff7830" aria-hidden="true" />}
      {badge.kind === 'downloading' && <Loader2 size={11} color="#ff7830" className="animate-spin" aria-hidden="true" />}
      {badge.kind === 'downloaded' && <ArrowUpCircle size={12} color="#ff7830" aria-hidden="true" />}
      {badge.kind === 'downloaded' && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-ping" style={{ background: '#ff7830' }} />
      )}
    </button>
  )
}
