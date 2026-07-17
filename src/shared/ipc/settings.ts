import type { AgentNotificationSettings, RemoteNotificationSettings, RemoteSendResult } from '../notifications'

export const NOTIFICATION_SETTINGS_CHANNELS = {
  get: 'settings:notifications:get', update: 'settings:notifications:update', testFeishu: 'settings:notifications:test-feishu',
} as const

export interface NotificationSettingsAPI {
  get(): Promise<AgentNotificationSettings>
  update(settings: Partial<AgentNotificationSettings>): Promise<AgentNotificationSettings>
  testFeishu(settings: RemoteNotificationSettings): Promise<RemoteSendResult>
}
