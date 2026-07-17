import type {
  AgentNotificationSettings,
  FeishuRemoteProviderConfig,
  RemoteNotificationSettings,
  RemoteSendResult,
} from '../../../shared/notifications'

export type {
  AgentNotificationSettings,
  FeishuRemoteProviderConfig,
  RemoteNotificationSettings,
  RemoteSendResult,
}

export async function getNotificationSettings(): Promise<AgentNotificationSettings> {
  return window.electron.notificationSettings.get()
}

export async function updateNotificationSettings(
  settings: Partial<AgentNotificationSettings>,
): Promise<AgentNotificationSettings> {
  return window.electron.notificationSettings.update(settings)
}

export async function testFeishuNotification(
  settings: RemoteNotificationSettings,
): Promise<RemoteSendResult> {
  return window.electron.notificationSettings.testFeishu(settings)
}
