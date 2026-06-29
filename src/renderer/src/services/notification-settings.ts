import type { AgentNotificationSettings } from '../../../shared/notifications'

export type { AgentNotificationSettings }

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
