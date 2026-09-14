import type { UpdaterEvent, UpdaterState } from '../../../shared/ipc/updater'

const IDLE_BASE: UpdaterState = {
  phase: 'idle',
  supported: true,
  unsupportedReason: null,
  currentVersion: '',
  availableVersion: null,
  downloadPercent: null,
  error: null,
}

/** 主进程 updater 事件到本地状态的归一映射，设置页与标题栏徽标共用。 */
export function applyUpdaterEvent(prev: UpdaterState | null, event: UpdaterEvent): UpdaterState {
  const base = prev ?? { ...IDLE_BASE }
  switch (event.type) {
    case 'checking':
      return { ...base, phase: 'checking', error: null }
    case 'available':
      return { ...base, phase: 'available', availableVersion: event.version, error: null }
    case 'not-available':
      return { ...base, phase: 'up-to-date', availableVersion: null, downloadPercent: null }
    case 'progress':
      return { ...base, phase: 'downloading', downloadPercent: event.percent }
    case 'downloaded':
      return { ...base, phase: 'downloaded', availableVersion: event.version, downloadPercent: 100 }
    case 'error':
      return { ...base, phase: 'error', error: event.message }
  }
}

export type UpdaterBadgeKind = 'available' | 'downloading' | 'downloaded'

export interface UpdaterBadge {
  kind: UpdaterBadgeKind
  version: string | null
  percent: number | null
}

/**
 * 标题栏徽标只在有动作价值时出现：发现新版、下载中、已就绪。
 * 检查中、已最新、失败、不支持一律不打扰。
 */
export function resolveUpdaterBadge(state: UpdaterState | null): UpdaterBadge | null {
  if (!state || !state.supported) return null
  switch (state.phase) {
    case 'available':
      return { kind: 'available', version: state.availableVersion, percent: null }
    case 'downloading':
      return { kind: 'downloading', version: state.availableVersion, percent: state.downloadPercent }
    case 'downloaded':
      return { kind: 'downloaded', version: state.availableVersion, percent: 100 }
    default:
      return null
  }
}
