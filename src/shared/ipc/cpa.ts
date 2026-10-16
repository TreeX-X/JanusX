// Note: CPA is an external management page, not a renderer plugin — see .agents/notes/workbench/service-integrations.md
export const CPA_CHANNELS = {
  get: 'cpa:settings:get',
  save: 'cpa:settings:save',
  open: 'cpa:surface:open',
  close: 'cpa:surface:close',
  openExternal: 'cpa:open-external',
} as const

export const CPA_SURFACE_ID = 'integration:cpa'
export const DEFAULT_CPA_MANAGEMENT_URL = 'http://127.0.0.1:8317/management.html'

export interface CpaSettings { managementUrl: string }
export interface CpaAPI {
  getSettings(): Promise<CpaSettings>
  saveSettings(settings: CpaSettings): Promise<CpaSettings>
  open(): Promise<void>
  close(): Promise<void>
  openExternal(): Promise<void>
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
