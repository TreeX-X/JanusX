import type { UpdaterSettings } from '../../../shared/ipc/updater'

export type { UpdaterSettings }

export async function getUpdaterSettings(): Promise<UpdaterSettings> {
  return window.electron.updater.getSettings()
}

export async function updateUpdaterSettings(
  settings: Partial<UpdaterSettings>,
): Promise<UpdaterSettings> {
  return window.electron.updater.updateSettings(settings)
}
