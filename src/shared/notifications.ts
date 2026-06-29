export interface AgentNotificationSettings {
  desktopEnabled: boolean
  notifyOnSuccess: boolean
  notifyOnFailure: boolean
  minDurationSeconds: number
  includeErrorMessage: boolean
  errorMessageMaxLength: number
}

export const DEFAULT_AGENT_NOTIFICATION_SETTINGS: AgentNotificationSettings = {
  desktopEnabled: true,
  notifyOnSuccess: true,
  notifyOnFailure: true,
  minDurationSeconds: 30,
  includeErrorMessage: false,
  errorMessageMaxLength: 120,
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
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
  }
}
