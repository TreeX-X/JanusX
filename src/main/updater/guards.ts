import type { UpdaterUnsupportedReason } from '../../shared/ipc/updater'

export interface UpdateRuntime {
  platform: NodeJS.Platform
  isPackaged: boolean
  portableDir: string | undefined
}

/** P0 只承接 Win nsis 安装版；其余一律降级为只读提示，永不尝试静默安装。 */
export function resolveUnsupportedReason(runtime: UpdateRuntime): UpdaterUnsupportedReason {
  if (runtime.platform !== 'win32') return 'non-windows-p0'
  if (!runtime.isPackaged) return 'dev-mode'
  if (runtime.portableDir) return 'portable'
  return null
}

export function isAutoUpdateSupported(runtime: UpdateRuntime): boolean {
  return resolveUnsupportedReason(runtime) === null
}
