import { ipcMain } from 'electron'
import { configService } from '../config/service'
import { remoteNotificationDispatcher } from '../remote-notifications/dispatcher'
import { redactErrorText } from '../remote-notifications/secret-redaction'
import type { KnowledgeSettings } from '../../shared/knowledge-settings'
import { KNOWLEDGE_CHANNELS } from '../../shared/ipc/knowledge'
import {
  normalizeRemoteNotificationSettings,
  toAgentNotificationSettingsView,
  type AgentNotificationSettings,
  type RemoteNotificationSettings,
  type RemoteSendResult,
} from '../../shared/notifications'
import { NOTIFICATION_SETTINGS_CHANNELS } from '../../shared/ipc/settings'

export function registerSettingsHandlers(): void {
  ipcMain.handle(NOTIFICATION_SETTINGS_CHANNELS.get, async () => {
    return toAgentNotificationSettingsView(await configService.getNotificationSettings())
  })

  ipcMain.handle(
    NOTIFICATION_SETTINGS_CHANNELS.update,
    async (_event, settings: Partial<AgentNotificationSettings>) => {
      const updated = await configService.updateNotificationSettings(settings ?? {})
      const { feishuInboundRuntime } = await import('../remote-notifications/feishu-inbound/runtime')
      await feishuInboundRuntime.reconfigure(updated.remote)
      return toAgentNotificationSettingsView(updated)
    },
  )

  ipcMain.handle(
    NOTIFICATION_SETTINGS_CHANNELS.testFeishu,
    async (_event, settings?: RemoteNotificationSettings) => {
      const stored = await configService.getRemoteNotificationSettings()
      const supplied = settings?.providers.feishu
      const resolved = normalizeRemoteNotificationSettings({
        ...stored,
        ...settings,
        providers: {
          feishu: {
            ...stored.providers.feishu,
            ...supplied,
            appSecret: supplied?.appSecret.trim() || stored.providers.feishu.appSecret,
          },
        },
      })
      return sanitizeSendResult(
        await remoteNotificationDispatcher.testFeishu(resolved),
        [resolved.providers.feishu.appSecret, resolved.providers.feishu.appId],
      )
    },
  )

  ipcMain.handle(NOTIFICATION_SETTINGS_CHANNELS.feishuControlStatus, async () => {
    const { feishuInboundRuntime } = await import('../remote-notifications/feishu-inbound/runtime')
    return feishuInboundRuntime.getControlStatus()
  })

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

function sanitizeSendResult(result: RemoteSendResult, secrets: string[]): RemoteSendResult {
  if (!result.reason) return result
  return { ...result, reason: redactErrorText(result.reason, secrets, 300) }
}
