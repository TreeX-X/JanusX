// Note: CPA is an external management page, not a renderer plugin — see .agents/notes/workbench/service-integrations.md
export const CPA_CHANNELS = {
  get: 'cpa:settings:get',
  save: 'cpa:settings:save',
  open: 'cpa:surface:open',
  close: 'cpa:surface:close',
  openExternal: 'cpa:open-external',
  status: 'cpa:status',
  start: 'cpa:start',
  stop: 'cpa:stop',
  restart: 'cpa:restart',
  update: 'cpa:update',
  logs: 'cpa:logs',
  copyKey: 'cpa:copy-management-key',
} as const

export const CPA_SURFACE_ID = 'integration:cpa'
export const DEFAULT_CPA_MANAGEMENT_URL = 'http://127.0.0.1:8317/management.html'

export interface CpaSettings {
  managementUrl: string
  mode?: 'managed' | 'external'
  enabled?: boolean
  port?: number
  autoUpdate?: boolean
}
export interface CpaOAuthFallback {
  provider: 'codex' | 'claude' | 'antigravity'
  port: number
  reason: 'restricted' | 'occupied' | 'unavailable'
}
export interface CpaStatus {
  phase: 'not-installed' | 'stopped' | 'downloading' | 'starting' | 'running' | 'failed'
  version?: string
  pendingVersion?: string
  progress?: number
  error?: string
  updateError?: string
  pid?: number
  oauthFallback?: CpaOAuthFallback
  oauthBrowserError?: boolean
}
export interface CpaAPI {
  getSettings(): Promise<CpaSettings>
  saveSettings(settings: CpaSettings, managementKey?: string): Promise<CpaSettings>
  open(): Promise<void>
  close(): Promise<void>
  openExternal(): Promise<void>
  status(): Promise<CpaStatus>
  start(): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  update(): Promise<void>
  openLogs(): Promise<void>
  copyManagementKey(): Promise<void>
}

/** An optional write-only credential, never part of persisted settings or status. */
export function validateCpaManagementKey(input: unknown): string {
  if (typeof input !== 'string' || !/^[\x21-\x7e]{8,128}$/.test(input)) throw new Error('cpa-invalid-management-key')
  return input
}

export function normalizeCpaSettings(input: unknown): CpaSettings {
  const value = input as Partial<CpaSettings> | null
  const mode = value?.mode === 'managed' || !value ? 'managed' : 'external'
  const port = value?.port ?? 8317
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('cpa-invalid-port')
  return {
    mode, enabled: value?.enabled === true, port, autoUpdate: value?.autoUpdate !== false,
    managementUrl: mode === 'managed' ? `http://127.0.0.1:${port}/management.html`
      : normalizeCpaManagementUrl(value?.managementUrl),
  }
}

/** Store an address only; credentials belong to the management page's login. */
export function normalizeCpaManagementUrl(input: unknown): string {
  if (typeof input !== 'string' || input.length > 2048 || !input.trim()) throw new Error('invalid-cpa-url')
  const value = input.trim()
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value
    : /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value) ? `http://${value}` : `https://${value}`
  let url: URL
  try { url = new URL(candidate) } catch { throw new Error('invalid-cpa-url') }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search) {
    throw new Error('invalid-cpa-url')
  }
  if (url.pathname === '/') url.pathname = '/management.html'
  return url.href
}
