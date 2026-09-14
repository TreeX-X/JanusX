import { ipcMain, shell } from 'electron'
import { UPDATER_CHANNELS, UPDATER_RELEASES_URL, type UpdaterSettings } from '../../shared/ipc/updater'
import { configService } from '../config/service'
import { updateService } from '../updater/service'

/** 幂等守卫：窗口重建重复调用不再触发重复 handler 注册。 */
let updaterIpcRegistered = false

export function registerUpdaterHandlers(): void {
  if (updaterIpcRegistered) return
  updaterIpcRegistered = true
  ipcMain.handle(UPDATER_CHANNELS.getState, () => updateService.getState())
  ipcMain.handle(UPDATER_CHANNELS.check, () => updateService.checkForUpdates())
  ipcMain.handle(UPDATER_CHANNELS.install, () => updateService.quitAndInstall())
  ipcMain.handle(UPDATER_CHANNELS.getSettings, () => configService.getUpdaterSettings())
  // 固定下载页，不接受渲染端传入的 URL，开新窗口不经过 updater 状态机。
  ipcMain.handle(UPDATER_CHANNELS.openReleases, () => shell.openExternal(UPDATER_RELEASES_URL))
  ipcMain.handle(
    UPDATER_CHANNELS.updateSettings,
    async (_event, settings: Partial<UpdaterSettings>) => {
      const next = await configService.updateUpdaterSettings(settings ?? {})
      // 落盘成功才动调度；手动检查通道不受开关影响。
      updateService.setAutoCheck(next.autoCheck)
      return next
    },
  )
}
