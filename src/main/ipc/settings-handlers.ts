import { ipcMain } from 'electron'
import { configService } from '../config/service'
import { remoteNotificationDispatcher } from '../remote-notifications/dispatcher'
import type { KnowledgeSettings } from '../../shared/knowledge-settings'
import { KNOWLEDGE_CHANNELS } from '../../shared/ipc/knowledge'
import type { AgentNotificationSettings, RemoteNotificationSettings } from '../../shared/notifications'
import { NOTIFICATION_SETTINGS_CHANNELS } from '../../shared/ipc/settings'

export function registerSettingsHandlers(): void {
  ipcMain.handle(NOTIFICATION_SETTINGS_CHANNELS.get, async () => {
    return configService.getNotificationSettings()
  })

  ipcMain.handle(
    NOTIFICATION_SETTINGS_CHANNELS.update,
    async (_event, settings: Partial<AgentNotificationSettings>) => {
      return configService.updateNotificationSettings(settings ?? {})
    },
  )

  ipcMain.handle(
    NOTIFICATION_SETTINGS_CHANNELS.testFeishu,
    async (_event, settings?: RemoteNotificationSettings) => {
      return remoteNotificationDispatcher.testFeishu(settings)
    },
  )

  ipcMain.handle(KNOWLEDGE_CHANNELS.getSettings, async () => {
    return configService.getKnowledgeSettings()
  })

  ipcMain.handle(
    KNOWLEDGE_CHANNELS.updateSettings,
    async (_event, settings: Partial<KnowledgeSettings>) => {
      return configService.updateKnowledgeSettings(settings ?? {})
    },
  )
}
