export interface AgentNotificationSettings {
  desktopEnabled: boolean
  notifyOnSuccess: boolean
  notifyOnFailure: boolean
  minDurationSeconds: number
  includeErrorMessage: boolean
  errorMessageMaxLength: number
  remote: RemoteNotificationSettings
}

export interface RemoteNotificationSettings {
  enabled: boolean
  notifyOnCompleted: boolean
  notifyOnFailed: boolean
  notifyOnAttention: boolean
  notifyOnApproval: boolean
  minDurationSeconds: number
  dedupeWindowSeconds: number
  timeoutSeconds: number
  providers: RemoteNotificationProviders
}

export interface RemoteNotificationProviders {
  feishu: FeishuRemoteProviderConfig
}

export type RemoteProviderId = 'feishu'

export interface RemoteSendResult {
  providerId: RemoteProviderId
  ok: boolean
  skipped?: boolean
  reason?: string
}

export interface FeishuRemoteProviderConfig {
  enabled: boolean
  mode: 'webhook' | 'app'
  webhookUrl: string
  appId: string
  appSecret: string
  receiveIdType: 'chat_id' | 'open_id'
  receiveId: string
}

export const DEFAULT_AGENT_NOTIFICATION_SETTINGS: AgentNotificationSettings = {
  desktopEnabled: true,
  notifyOnSuccess: true,
  notifyOnFailure: true,
  minDurationSeconds: 30,
  includeErrorMessage: false,
  errorMessageMaxLength: 120,
  remote: {
    enabled: false,
    notifyOnCompleted: true,
    notifyOnFailed: true,
    notifyOnAttention: true,
    notifyOnApproval: true,
    minDurationSeconds: 30,
    dedupeWindowSeconds: 300,
    timeoutSeconds: 10,
    providers: {
      feishu: {
        enabled: false,
        mode: 'webhook',
        webhookUrl: '',
        appId: '',
        appSecret: '',
        receiveIdType: 'chat_id',
        receiveId: '',
      },
    },
  },
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeRemoteNotificationSettings(
  input?: Partial<RemoteNotificationSettings> | null,
): RemoteNotificationSettings {
  const source = input ?? {}
  const providers = (source.providers ?? {}) as Partial<RemoteNotificationProviders>
  const feishu = (providers.feishu ?? {}) as Partial<FeishuRemoteProviderConfig>
  const defaultRemote = DEFAULT_AGENT_NOTIFICATION_SETTINGS.remote
  const defaultFeishu = defaultRemote.providers.feishu

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaultRemote.enabled,
    notifyOnCompleted:
      typeof source.notifyOnCompleted === 'boolean'
        ? source.notifyOnCompleted
        : defaultRemote.notifyOnCompleted,
    notifyOnFailed:
      typeof source.notifyOnFailed === 'boolean'
        ? source.notifyOnFailed
        : defaultRemote.notifyOnFailed,
    notifyOnAttention:
      typeof source.notifyOnAttention === 'boolean'
        ? source.notifyOnAttention
        : defaultRemote.notifyOnAttention,
    notifyOnApproval:
      typeof source.notifyOnApproval === 'boolean'
        ? source.notifyOnApproval
        : defaultRemote.notifyOnApproval,
    minDurationSeconds: clampNumber(
      source.minDurationSeconds,
      0,
      24 * 60 * 60,
      defaultRemote.minDurationSeconds,
    ),
    dedupeWindowSeconds: clampNumber(
      source.dedupeWindowSeconds,
      0,
      24 * 60 * 60,
      defaultRemote.dedupeWindowSeconds,
    ),
    timeoutSeconds: clampNumber(source.timeoutSeconds, 1, 120, defaultRemote.timeoutSeconds),
    providers: {
      feishu: {
        enabled:
          typeof feishu.enabled === 'boolean' ? feishu.enabled : defaultFeishu.enabled,
        mode: feishu.mode === 'app' ? 'app' : defaultFeishu.mode,
        webhookUrl: stringValue(feishu.webhookUrl),
        appId: stringValue(feishu.appId),
        appSecret: stringValue(feishu.appSecret),
        receiveIdType: feishu.receiveIdType === 'open_id' ? 'open_id' : defaultFeishu.receiveIdType,
        receiveId: stringValue(feishu.receiveId),
      },
    },
  }
}

export function normalizeAgentNotificationSettings(
  input?: Partial<AgentNotificationSettings> | null,
): AgentNotificationSettings {
  const source = input ?? {}

  return {
    desktopEnabled:
      typeof source.desktopEnabled === 'boolean'
        ? source.desktopEnabled
        : DEFAULT_AGENT_NOTIFICATION_SETTINGS.desktopEnabled,
    notifyOnSuccess:
      typeof source.notifyOnSuccess === 'boolean'
        ? source.notifyOnSuccess
        : DEFAULT_AGENT_NOTIFICATION_SETTINGS.notifyOnSuccess,
    notifyOnFailure:
      typeof source.notifyOnFailure === 'boolean'
        ? source.notifyOnFailure
        : DEFAULT_AGENT_NOTIFICATION_SETTINGS.notifyOnFailure,
    minDurationSeconds: clampNumber(
      source.minDurationSeconds,
      0,
      24 * 60 * 60,
      DEFAULT_AGENT_NOTIFICATION_SETTINGS.minDurationSeconds,
    ),
    includeErrorMessage:
      typeof source.includeErrorMessage === 'boolean'
        ? source.includeErrorMessage
        : DEFAULT_AGENT_NOTIFICATION_SETTINGS.includeErrorMessage,
    errorMessageMaxLength: clampNumber(
      source.errorMessageMaxLength,
      40,
      500,
      DEFAULT_AGENT_NOTIFICATION_SETTINGS.errorMessageMaxLength,
    ),
    remote: normalizeRemoteNotificationSettings(source.remote),
  }
}
