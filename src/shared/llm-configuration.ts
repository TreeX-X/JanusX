import type { ProviderSettings } from '@janusx/llm-core'

export const LLM_CONSUMERS = ['janus', 'claude', 'codex', 'opencode', 'pi'] as const
export type LlmConsumer = typeof LLM_CONSUMERS[number]
export type ChannelProtocol = 'openai' | 'responses' | 'anthropic' | 'vertex'
export function authTypeForProtocol(protocol: ChannelProtocol, noAuth = false): ProviderSettings['authType'] {
  return (protocol === 'vertex' ? 'vertex-ai' : protocol === 'anthropic' ? 'anthropic' : noAuth ? 'none' : 'api-key') as ProviderSettings['authType']
}
export interface AgentModelBinding {
  mode: 'provider' | 'native' | 'unconfigured'
  providerId?: string
  modelId?: string
  appliedFingerprint?: string
  /** Read-time status, never a persisted receipt. */
  needsApply?: boolean
}
export interface LlmConfiguration {
  version: string
  providers: Record<string, ProviderSettings>
  bindings: Record<LlmConsumer, AgentModelBinding>
}
export function channelProtocol(provider: ProviderSettings): ChannelProtocol {
  if (provider.authType === 'anthropic') return 'anthropic'
  if (provider.authType === 'vertex-ai') return 'vertex'
  return provider.extra?.protocol === 'responses' ? 'responses' : 'openai'
}
export function channelModel(provider: ProviderSettings): string {
  return provider.defaultModelId || provider.modelId || provider.models?.[0] || ''
}
export function channelModels(provider: ProviderSettings): string[] {
  return [...new Set([channelModel(provider), ...(provider.models || [])].filter(Boolean))]
}
/** Direct configuration: the channel must already speak the Agent's protocol. */
export function supportsChannel(consumer: LlmConsumer, provider: ProviderSettings): boolean {
  if (provider.enabled === false) return false
  const protocol = channelProtocol(provider)
  if (consumer === 'claude') return protocol === 'anthropic'
  if (consumer === 'codex') return protocol === 'responses'
  if (consumer === 'janus') return true
  return protocol !== 'vertex'
}
