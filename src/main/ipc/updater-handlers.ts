import { ipcMain } from 'electron'
import { UPDATER_CHANNELS } from '../../shared/ipc/updater'
import { updateService } from '../updater/service'

/** 幂等守卫：窗口重建重复调用不再触发重复 handler 注册。 */
let updaterIpcRegistered = false

export function registerUpdaterHandlers(): void {
  if (updaterIpcRegistered) return
  updaterIpcRegistered = true
  ipcMain.handle(UPDATER_CHANNELS.getState, () => updateService.getState())
  ipcMain.handle(UPDATER_CHANNELS.check, () => updateService.checkForUpdates())
  ipcMain.handle(UPDATER_CHANNELS.install, () => updateService.quitAndInstall())
}
