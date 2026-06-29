import { ipcMain } from 'electron'
import { configService } from '../config/service'
import type { AgentNotificationSettings } from '../../shared/notifications'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:notifications:get', async () => {
    return configService.getNotificationSettings()
  })

  ipcMain.handle(
    'settings:notifications:update',
    async (_event, settings: Partial<AgentNotificationSettings>) => {
      return configService.updateNotificationSettings(settings ?? {})
    },
  )
}
