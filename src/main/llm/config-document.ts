import type { ProviderSettings } from '@janusx/llm-core'
import { LLM_CONSUMERS, channelModel, channelModels, type AgentModelBinding, type LlmConfiguration } from '../../shared/llm-configuration'
export type { LlmConsumer as LlmTerminalConsumer } from '../../shared/llm-configuration'
export const LLM_TERMINAL_CONSUMERS = LLM_CONSUMERS
export type LlmConfig = LlmConfiguration
export const LLM_CONFIG_VERSION = '3.0.0'

export function emptyLlmConfig(): LlmConfig {
  return { version: LLM_CONFIG_VERSION, providers: {}, bindings: {
    janus: { mode: 'unconfigured' }, claude: { mode: 'native' }, codex: { mode: 'native' },
    opencode: { mode: 'native' }, pi: { mode: 'native' },
  } }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function providersOf(value: unknown): Record<string, ProviderSettings> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, p]) => isRecord(p) && typeof p.name === 'string' && typeof p.authType === 'string')
    .map(([id, p]) => [id, { ...(p as unknown as ProviderSettings), id }]))
}
// Model choices belong to bindings; fold only identical channel identities.
function channelIdentity(provider: ProviderSettings): string {
  const { modelId: _model, defaultModelId: _default, models: _models, testModelId: _test, ...connection } = provider
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : isRecord(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
  return JSON.stringify(stable(connection))
}
export function normalizeLlmConfigDocument(value: unknown): { config: LlmConfig; migrated: boolean } | null {
  if (!isRecord(value)) return null
  const config = emptyLlmConfig()
  if (value.version === LLM_CONFIG_VERSION && isRecord(value.providers) && isRecord(value.bindings)) {
    config.providers = providersOf(value.providers)
    for (const consumer of LLM_CONSUMERS) {
      const binding = value.bindings[consumer]
      if (!isRecord(binding)) continue
      if (binding.mode === 'provider' && typeof binding.providerId === 'string' && config.providers[binding.providerId]) {
        config.bindings[consumer] = { mode: 'provider', providerId: binding.providerId,
          ...(typeof binding.modelId === 'string' ? { modelId: binding.modelId } : {}),
          ...(typeof binding.appliedFingerprint === 'string' ? { appliedFingerprint: binding.appliedFingerprint } : {}) }
      } else if (binding.mode === 'native' && consumer !== 'janus') config.bindings[consumer] = { mode: 'native' }
    }
    return { config, migrated: JSON.stringify(config) !== JSON.stringify(value) }
  }
  if (isRecord(value.terminals)) {
    for (const consumer of LLM_CONSUMERS) {
      const terminal = value.terminals[consumer]
      if (!isRecord(terminal)) continue
      const providers = providersOf(terminal.providers)
      const ids = new Map<string, string>()
      for (const [oldId, provider] of Object.entries(providers)) {
        let id = oldId
        if (config.providers[id] && channelIdentity(config.providers[id]!) !== channelIdentity(provider)) {
          id = `${oldId}--${consumer}`
          while (config.providers[id]) id += '-legacy'
        }
        const existing = config.providers[id]
        config.providers[id] = existing ? { ...existing, models: [...new Set([...channelModels(existing), ...channelModels(provider)])] } : { ...provider, id }
        ids.set(oldId, id)
      }
      const defaultId = typeof terminal.defaultId === 'string' && providers[terminal.defaultId] ? terminal.defaultId : Object.keys(providers)[0]
      if (defaultId) config.bindings[consumer] = { mode: 'provider', providerId: ids.get(defaultId)!, modelId: channelModel(providers[defaultId]!) }
    }
    return { config, migrated: true }
  }
  if (isRecord(value.providers)) {
    return { config: migrateV1Document(providersOf(value.providers), typeof value.defaultProvider === 'string' ? value.defaultProvider : null,
      isRecord(value.terminalBindings) ? value.terminalBindings : undefined), migrated: true }
  }
  return null
}
export function migrateV1Document(providers: Record<string, ProviderSettings>, defaultProvider: string | null,
  bindings?: Partial<Record<typeof LLM_CONSUMERS[number], { providerId?: unknown; modelId?: unknown }>>): LlmConfig {
  const config = emptyLlmConfig()
  config.providers = providers
  for (const consumer of LLM_CONSUMERS) {
    const old = bindings?.[consumer]
    const id = typeof old?.providerId === 'string' && providers[old.providerId] ? old.providerId
      : defaultProvider && providers[defaultProvider] ? defaultProvider : Object.keys(providers)[0]
    if (id) config.bindings[consumer] = { mode: 'provider', providerId: id,
      modelId: typeof old?.modelId === 'string' && old.modelId.trim() ? old.modelId.trim() : channelModel(providers[id]!) }
  }
  return config
}
export function countDistinctProviders(config: LlmConfig): number { return Object.keys(config.providers).length }
export type { AgentModelBinding }
