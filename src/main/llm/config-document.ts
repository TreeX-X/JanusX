/**
 * @file LLM 配置文档形态
 * @description 无 Electron 依赖的纯文档层：v2 按终端分集合形态、v1 旧池迁移、规范化。
 *              托管存储（ConfigStore）与安装版同步（development-config-sync）共用同一入口。
 */

import type { ProviderSettings } from '@janusx/llm-core'

/** 与 external-cli 外部 CLI 对齐的终端消费者；shell 无 LLM，不参与配置。 */
export type LlmTerminalConsumer = 'janus' | 'claude' | 'codex' | 'opencode' | 'pi'

export const LLM_TERMINAL_CONSUMERS: readonly LlmTerminalConsumer[] = ['janus', 'claude', 'codex', 'opencode', 'pi']

/** 单终端的独立配置集合：自有列表＋自有默认，不跨终端共享。 */
export interface TerminalProviderCollection {
  providers: Record<string, ProviderSettings>
  defaultId: string | null
}

export interface LlmConfig {
  version: string
  terminals: Record<LlmTerminalConsumer, TerminalProviderCollection>
}

export const LLM_CONFIG_VERSION = '2.0.0'

function emptyCollection(): TerminalProviderCollection {
  return { providers: {}, defaultId: null }
}

export function emptyLlmConfig(): LlmConfig {
  return {
    version: LLM_CONFIG_VERSION,
    terminals: { janus: emptyCollection(), claude: emptyCollection(), codex: emptyCollection(), opencode: emptyCollection(), pi: emptyCollection() },
  }
}

function isProviderMap(value: unknown): value is Record<string, ProviderSettings> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCollection(value: unknown): { collection: TerminalProviderCollection; dirty: boolean } {
  const collection = emptyCollection()
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { collection, dirty: true }
  const providers = (value as { providers?: unknown }).providers
  if (!isProviderMap(providers)) return { collection, dirty: true }
  collection.providers = { ...(providers as Record<string, ProviderSettings>) }
  const rawDefault = (value as { defaultId?: unknown }).defaultId
  const ids = Object.keys(collection.providers)
  if (typeof rawDefault === 'string' && collection.providers[rawDefault]) {
    collection.defaultId = rawDefault
    return { collection, dirty: false }
  }
  if (ids.length > 0) {
    collection.defaultId = ids[0]!
    return { collection, dirty: true }
  }
  return { collection, dirty: rawDefault !== undefined && rawDefault !== null }
}

/** v1 旧池迁移：整池复制进每个终端，默认沿用该终端绑定（无则全局默认），模型覆盖折进默认条目。 */
export function migrateV1Document(
  providers: Record<string, ProviderSettings>,
  defaultProvider: string | null,
  bindings?: Partial<Record<LlmTerminalConsumer, { providerId?: unknown; modelId?: unknown }>>,
): LlmConfig {
  const config = emptyLlmConfig()
  const ids = Object.keys(providers)
  for (const consumer of LLM_TERMINAL_CONSUMERS) {
    const binding = bindings?.[consumer]
    const bindingId = typeof binding?.providerId === 'string' && providers[binding.providerId] ? binding.providerId : null
    const fallbackId = typeof defaultProvider === 'string' && providers[defaultProvider] ? defaultProvider : null
    const defaultId = bindingId ?? fallbackId ?? (ids.length > 0 ? ids[0]! : null)
    const copied: Record<string, ProviderSettings> = {}
    for (const [id, settings] of Object.entries(providers)) {
      copied[id] = { ...settings }
    }
    const overrideModel = typeof binding?.modelId === 'string' && binding.modelId.trim() ? binding.modelId.trim() : ''
    if (overrideModel && defaultId && copied[defaultId]) {
      const entry = { ...copied[defaultId]! }
      entry.modelId = overrideModel
      if (entry.models?.length) entry.defaultModelId = overrideModel
      copied[defaultId] = entry
    }
    config.terminals[consumer] = { providers: copied, defaultId }
  }
  return config
}

/**
 * 规范化任意来源文档：v2 直接校验，v1 旧池走迁移，其余返回 null。
 */
export function normalizeLlmConfigDocument(value: unknown): { config: LlmConfig; migrated: boolean } | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (isProviderMap(record['terminals'])) {
    const config = emptyLlmConfig()
    let dirty = false
    const terminals = record['terminals'] as Record<string, unknown>
    for (const consumer of LLM_TERMINAL_CONSUMERS) {
      const { collection, dirty: collectionDirty } = normalizeCollection(terminals[consumer])
      config.terminals[consumer] = collection
      dirty = dirty || collectionDirty
    }
    return { config, migrated: dirty }
  }
  if (isProviderMap(record['providers'])) {
    const bindings = record['terminalBindings']
    return {
      config: migrateV1Document(
        record['providers'] as Record<string, ProviderSettings>,
        typeof record['defaultProvider'] === 'string' ? record['defaultProvider'] : null,
        (typeof bindings === 'object' && bindings !== null ? bindings : undefined) as
          | Partial<Record<LlmTerminalConsumer, { providerId?: unknown; modelId?: unknown }>>
          | undefined,
      ),
      migrated: true,
    }
  }
  return null
}

/** 跨终端去重计数（迁移复制后同一 id 出现多次只计一次）。 */
export function countDistinctProviders(config: LlmConfig): number {
  const ids = new Set<string>()
  for (const consumer of LLM_TERMINAL_CONSUMERS) {
    for (const id of Object.keys(config.terminals[consumer].providers)) ids.add(id)
  }
  return ids.size
}
