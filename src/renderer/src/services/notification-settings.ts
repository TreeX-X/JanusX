import type {
  AgentNotificationSettings,
  FeishuRemoteProviderConfig,
  RemoteNotificationSettings,
  RemoteSendResult,
  AgentNotificationSettingsView,
  FeishuControlStatus,
} from '../../../shared/notifications'

export type {
  AgentNotificationSettings,
  FeishuRemoteProviderConfig,
  RemoteNotificationSettings,
  RemoteSendResult,
}

export async function getNotificationSettings(): Promise<AgentNotificationSettings> {
  return hydrateSettings(await window.electron.notificationSettings.get())
}

export async function updateNotificationSettings(
  settings: Partial<AgentNotificationSettings>,
): Promise<AgentNotificationSettings> {
  return hydrateSettings(await window.electron.notificationSettings.update(settings))
}

function hydrateSettings(settings: AgentNotificationSettingsView): AgentNotificationSettings {
  const { appSecretConfigured: _configured, ...feishu } = settings.remote.providers.feishu
  return {
    ...settings,
    remote: {
      ...settings.remote,
      providers: { feishu: { ...feishu, appSecret: '' } },
    },
  }
}

export async function testFeishuNotification(
  settings: RemoteNotificationSettings,
): Promise<RemoteSendResult> {
  return window.electron.notificationSettings.testFeishu(settings)
}

export async function getFeishuControlStatus(): Promise<FeishuControlStatus> {
  return window.electron.notificationSettings.getFeishuControlStatus()
}
