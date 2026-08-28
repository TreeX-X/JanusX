import type {
  AgentNotificationSettings,
  AgentNotificationSettingsView,
  FeishuControlStatus,
  RemoteNotificationSettings,
  RemoteSendResult,
} from '../notifications'
import type { AgentApprovalMode } from './agent-runtime'

export const AGENT_SETTINGS_CHANNELS = {
  get: 'settings:agent:get',
  update: 'settings:agent:update',
} as const

export interface AgentSettingsAPI {
  get(): Promise<{ approvalMode: AgentApprovalMode }>
  update(settings: { approvalMode: AgentApprovalMode }): Promise<{ approvalMode: AgentApprovalMode }>
}

export const NOTIFICATION_SETTINGS_CHANNELS = {
  get: 'settings:notifications:get',
  update: 'settings:notifications:update',
  testFeishu: 'settings:notifications:test-feishu',
  feishuControlStatus: 'settings:notifications:feishu-control-status',
} as const

export interface NotificationSettingsAPI {
  get(): Promise<AgentNotificationSettingsView>
  update(settings: Partial<AgentNotificationSettings>): Promise<AgentNotificationSettingsView>
  testFeishu(settings: RemoteNotificationSettings): Promise<RemoteSendResult>
  getFeishuControlStatus(): Promise<FeishuControlStatus>
}
