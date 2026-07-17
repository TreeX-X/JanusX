import { ipcMain } from 'electron'
import { configService } from '../config/service'
import { remoteNotificationDispatcher } from '../remote-notifications/dispatcher'
import type { KnowledgeSettings } from '../../shared/knowledge-settings'
import { KNOWLEDGE_CHANNELS } from '../../shared/ipc/knowledge'
import type { AgentNotificationSettings, RemoteNotificationSettings } from '../../shared/notifications'

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

  ipcMain.handle(
    'settings:notifications:test-feishu',
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
