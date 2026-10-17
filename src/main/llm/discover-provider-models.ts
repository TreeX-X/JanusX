import type { ProviderSettings } from '@janusx/llm-core'
import { channelProtocol } from '../../shared/llm-configuration'

/** Query the provider's own catalog. Static adapter registries are not proof that a key can use a model. */
export async function discoverProviderModels(
  provider: ProviderSettings,
  request: typeof fetch = fetch,
): Promise<string[]> {
  const protocol = channelProtocol(provider)
  if (protocol === 'vertex') throw new Error('Vertex AI does not expose a compatible model list')
  const base = provider.baseURL?.trim()
  if (!base || !/^https?:\/\//i.test(base)) throw new Error('Enter an API endpoint first')
  if (provider.authType !== 'none' && !provider.apiKey?.trim()) throw new Error('Enter an API key first')

  const root = base.replace(/\/+$/, '')
  const url = new URL(root + (protocol === 'anthropic' && !root.endsWith('/v1') ? '/v1/models' : '/models'))
  const headers: Record<string, string> = protocol === 'anthropic'
    ? { 'x-api-key': provider.apiKey || '', 'anthropic-version': '2023-06-01' }
    : provider.authType === 'none' ? {} : { Authorization: `Bearer ${provider.apiKey}` }
  const response = await request(url, { headers, redirect: 'error', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`Model list request failed (HTTP ${response.status})`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
    throw new Error('This service did not return a model list')
  }
  return [...new Set(payload.data
    .map((item: unknown) => item && typeof item === 'object' && 'id' in item ? item.id : undefined)
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0))]
}
