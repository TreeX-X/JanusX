/** Win P0 自动更新 IPC 契约：nsis 安装版经 GitHub Releases 拉取，其余形态降级提示。 */
export const UPDATER_CHANNELS = {
  getState: 'updater:get-state',
  check: 'updater:check',
  install: 'updater:install',
  getSettings: 'updater:get-settings',
  updateSettings: 'updater:update-settings',
} as const

export const UPDATER_EVENT_CHANNELS = {
  event: 'updater:event',
} as const

export type UpdaterUnsupportedReason = 'non-windows-p0' | 'dev-mode' | 'portable' | null

export type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

export interface UpdaterState {
  phase: UpdaterPhase
  supported: boolean
  unsupportedReason: UpdaterUnsupportedReason
  currentVersion: string
  availableVersion: string | null
  downloadPercent: number | null
  error: string | null
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

export interface UpdaterAPI {
  getState(): Promise<UpdaterState>
  check(): Promise<UpdaterState>
  install(): Promise<{ ok: boolean; error?: string }>
  onEvent(callback: (event: UpdaterEvent) => void): () => void
  getSettings(): Promise<UpdaterSettings>
  updateSettings(settings: Partial<UpdaterSettings>): Promise<UpdaterSettings>
}

export interface UpdaterSettings {
  /** 启动延迟首检 + 6h 轮询；关闭后仅保留手动检查。默认 true。 */
  autoCheck: boolean
}

export const DEFAULT_UPDATER_SETTINGS: UpdaterSettings = {
  autoCheck: true,
}

export function normalizeUpdaterSettings(value: unknown): UpdaterSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_UPDATER_SETTINGS }
  const autoCheck = (value as { autoCheck?: unknown }).autoCheck
  return { autoCheck: autoCheck === undefined ? DEFAULT_UPDATER_SETTINGS.autoCheck : autoCheck === true }
}
