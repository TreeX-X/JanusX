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
  return window.electron.invoke('settings:notifications:get') as Promise<AgentNotificationSettings>
}

export async function updateNotificationSettings(
  settings: Partial<AgentNotificationSettings>,
): Promise<AgentNotificationSettings> {
  return window.electron.invoke(
    'settings:notifications:update',
    settings,
  ) as Promise<AgentNotificationSettings>
}

export async function testFeishuNotification(
  settings: RemoteNotificationSettings,
): Promise<RemoteSendResult> {
  return window.electron.invoke(
    'settings:notifications:test-feishu',
    settings,
  ) as Promise<RemoteSendResult>
}
