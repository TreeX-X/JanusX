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
  inboundControlEnabled: boolean
  allowedOpenIds: string[]
  bindingTtlMinutes: number
  actionTokenTtlMinutes: number
  auditRetentionDays: number
  maxPromptLength: number
  groupPromptPrefix: string
  webhookUrl: string
  appId: string
  appSecret: string
  receiveIdType: 'chat_id' | 'open_id'
  receiveId: string
}

export const FEISHU_CONTROL_DEFAULTS = {
  bindingTtlMinutes: 8 * 60,
  actionTokenTtlMinutes: 10,
  auditRetentionDays: 30,
  maxPromptLength: 4_000,
  groupPromptPrefix: '/p',
} as const

export const FEISHU_CONTROL_LIMITS = {
  bindingTtlMinutes: { min: 5, max: 7 * 24 * 60 },
  actionTokenTtlMinutes: { min: 1, max: 60 },
  auditRetentionDays: { min: 1, max: 365 },
  maxPromptLength: { min: 1, max: 4_000 },
} as const

export type FeishuRemoteProviderView = Omit<FeishuRemoteProviderConfig, 'appSecret'> & {
  appSecretConfigured: boolean
}

export type RemoteNotificationSettingsView = Omit<RemoteNotificationSettings, 'providers'> & {
  providers: { feishu: FeishuRemoteProviderView }
}

export type AgentNotificationSettingsView = Omit<AgentNotificationSettings, 'remote'> & {
  remote: RemoteNotificationSettingsView
}

export interface FeishuControlStatus {
  state: 'disabled' | 'connecting' | 'connected' | 'error'
  enabled: boolean
  configured: boolean
  error?: string
  updatedAt: number
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
        inboundControlEnabled: false,
        allowedOpenIds: [],
        ...FEISHU_CONTROL_DEFAULTS,
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
        inboundControlEnabled:
          typeof feishu.inboundControlEnabled === 'boolean'
            ? feishu.inboundControlEnabled
            : defaultFeishu.inboundControlEnabled,
        allowedOpenIds: Array.isArray(feishu.allowedOpenIds)
          ? normalizeFeishuOpenIds(feishu.allowedOpenIds)
          : defaultFeishu.allowedOpenIds,
        bindingTtlMinutes: clampNumber(
          feishu.bindingTtlMinutes,
          FEISHU_CONTROL_LIMITS.bindingTtlMinutes.min,
          FEISHU_CONTROL_LIMITS.bindingTtlMinutes.max,
          defaultFeishu.bindingTtlMinutes,
        ),
        actionTokenTtlMinutes: clampNumber(
          feishu.actionTokenTtlMinutes,
          FEISHU_CONTROL_LIMITS.actionTokenTtlMinutes.min,
          FEISHU_CONTROL_LIMITS.actionTokenTtlMinutes.max,
          defaultFeishu.actionTokenTtlMinutes,
        ),
        auditRetentionDays: clampNumber(
          feishu.auditRetentionDays,
          FEISHU_CONTROL_LIMITS.auditRetentionDays.min,
          FEISHU_CONTROL_LIMITS.auditRetentionDays.max,
          defaultFeishu.auditRetentionDays,
        ),
        maxPromptLength: clampNumber(
          feishu.maxPromptLength,
          FEISHU_CONTROL_LIMITS.maxPromptLength.min,
          FEISHU_CONTROL_LIMITS.maxPromptLength.max,
          defaultFeishu.maxPromptLength,
        ),
        groupPromptPrefix: isValidFeishuGroupPrefix(feishu.groupPromptPrefix)
          ? feishu.groupPromptPrefix.trim()
          : defaultFeishu.groupPromptPrefix,
        webhookUrl: stringValue(feishu.webhookUrl),
        appId: stringValue(feishu.appId),
        appSecret: stringValue(feishu.appSecret),
        receiveIdType: feishu.receiveIdType === 'open_id' ? 'open_id' : defaultFeishu.receiveIdType,
        receiveId: stringValue(feishu.receiveId),
      },
    },
  }
}

export function normalizeFeishuOpenIds(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => (
    typeof value === 'string' && /^ou_[A-Za-z0-9_-]{1,128}$/.test(value.trim())
  )).map((value) => value.trim()))]
}

export function isValidFeishuGroupPrefix(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const prefix = value.trim()
  return /^\/[a-z][a-z0-9_-]{0,14}$/.test(prefix)
    && !['/status', '/bind', '/unbind', '/stop'].includes(prefix)
}

export function validateFeishuControlConfig(
  config: FeishuRemoteProviderConfig,
  appSecretConfigured = Boolean(config.appSecret.trim()),
): string | null {
  if (!config.inboundControlEnabled) return null
  if (config.mode !== 'app') return 'Feishu inbound control requires App mode'
  if (!config.enabled) return 'Enable the Feishu provider before enabling inbound control'
  if (!config.appId.trim()) return 'Feishu App ID is required for inbound control'
  if (!appSecretConfigured) return 'Feishu App Secret is required for inbound control'
  if (!config.receiveId.trim()) return 'Feishu Receive ID is required for inbound control'
  if (config.allowedOpenIds.length === 0) return 'Add at least one valid Feishu open_id (ou_...)'
  if (!isValidFeishuGroupPrefix(config.groupPromptPrefix)) {
    return 'Group prompt prefix must be a non-reserved /name value'
  }
  return null
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

export function toAgentNotificationSettingsView(
  settings: AgentNotificationSettings,
): AgentNotificationSettingsView {
  const { appSecret, ...feishu } = settings.remote.providers.feishu
  return {
    ...settings,
    remote: {
      ...settings.remote,
      providers: {
        feishu: { ...feishu, appSecretConfigured: Boolean(appSecret.trim()) },
      },
    },
  }
}
