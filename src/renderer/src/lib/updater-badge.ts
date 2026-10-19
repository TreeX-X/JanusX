import type { UpdaterEvent, UpdaterState } from '../../../shared/ipc/updater'

/** 主进程 updater 事件到本地状态的归一映射，设置页与标题栏徽标共用。 */
export function applyUpdaterEvent(_prev: UpdaterState | null, event: UpdaterEvent): UpdaterState {
  return { ...event.state }
}

export type UpdaterBadgeKind = 'available' | 'downloading' | 'downloaded'

export interface UpdaterBadge {
  kind: UpdaterBadgeKind
  version: string | null
  percent: number | null
}

/**
 * 标题栏徽标只在有动作价值时出现：发现新版、下载中、已就绪。
 * 下载失败仍保留提示，点击后可以到设置页重试。
 */
export function resolveUpdaterBadge(state: UpdaterState | null): UpdaterBadge | null {
  if (!state || !state.supported) return null
  switch (state.phase) {
    case 'available':
      return { kind: 'available', version: state.availableVersion, percent: null }
    case 'error':
      return state.availableVersion ? { kind: 'available', version: state.availableVersion, percent: null } : null
    case 'downloading':
      return { kind: 'downloading', version: state.availableVersion, percent: state.downloadPercent }
    case 'downloaded':
      return { kind: 'downloaded', version: state.availableVersion, percent: 100 }
    default:
      return null
  }
}
