import { app } from 'electron'
import { join } from 'node:path'
import { readFile, rename } from 'node:fs/promises'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import type { ProviderSettings } from '@janusx/llm-core'
import { emptyLlmConfig, LLM_TERMINAL_CONSUMERS, normalizeLlmConfigDocument, type LlmConfig, type LlmTerminalConsumer, type AgentModelBinding } from './config-document'
import { channelModel } from '../../shared/llm-configuration'
export type { LlmTerminalConsumer } from './config-document'
export { LLM_TERMINAL_CONSUMERS } from './config-document'
// Note: shared channels and independent Agent bindings — .agents/notes/terminal/terminal-provider-collections.md
export class LlmConfigStore {
  private configPath: string
  private config: LlmConfig | null = null
  private loading: Promise<LlmConfig> | null = null
  private writeQueue = new SerialQueue()
  constructor(userDataDir?: string) { this.configPath = join(userDataDir ?? app.getPath('userData'), 'janusx', 'llm-config.json') }
  async load(): Promise<LlmConfig> {
    let data: string
    try { data = await readFile(this.configPath, 'utf-8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.config = emptyLlmConfig()
      await this.persist()
      return this.config
    }
    let normalized: ReturnType<typeof normalizeLlmConfigDocument>
    try {
      normalized = normalizeLlmConfigDocument(JSON.parse(data))
      if (!normalized) throw new Error('Unrecognized LLM config shape')
    } catch {
      await rename(this.configPath, `${this.configPath}.corrupt-${Date.now()}`)
      this.config = emptyLlmConfig()
      await this.persist()
      return this.config
    }
    this.config = normalized.config
    if (normalized.migrated) {
      // Keep the complete legacy document, including fields not understood by v3.
      const backup = this.configPath + '.pre-v3'
      try { await readFile(backup) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await writeFileAtomic(backup, data)
      }
      await this.persist()
    }
    return this.config
  }
  async save(): Promise<void> { await this.writeQueue.run(() => this.persist()) }
  private async persist(): Promise<void> {
    if (this.config) await writeFileAtomic(this.configPath, JSON.stringify(this.config, null, 2))
  }
  async get(): Promise<LlmConfig> {
    if (this.config) return structuredClone(this.config)
    this.loading ??= this.load()
    try { return structuredClone(await this.loading) } finally { this.loading = null }
  }
  private assertConsumer(consumer: string): asserts consumer is LlmTerminalConsumer {
    if (!LLM_TERMINAL_CONSUMERS.includes(consumer as LlmTerminalConsumer)) throw new Error(`Unknown Agent "${consumer}"`)
  }
  private async update(mutator: (config: LlmConfig) => void): Promise<void> {
    await this.writeQueue.run(async () => {
      const next = await this.get()
      mutator(next)
      await writeFileAtomic(this.configPath, JSON.stringify(next, null, 2))
      this.config = next
    })
  }
  async saveProvider(settings: ProviderSettings): Promise<void> {
    if (!settings.id || ['__proto__', 'constructor', 'prototype'].includes(settings.id)) throw new Error('Invalid channel ID')
    await this.update(config => { config.providers[settings.id] = structuredClone(settings) })
  }
  async setBinding(consumer: LlmTerminalConsumer, binding: AgentModelBinding): Promise<void> {
    this.assertConsumer(consumer)
    await this.update(config => {
      if (binding.mode === 'provider' && (!binding.providerId || !config.providers[binding.providerId])) throw new Error('Channel not found')
      if (binding.mode === 'native' && consumer === 'janus') throw new Error('Janus requires an API channel')
      config.bindings[consumer] = structuredClone(binding)
    })
  }
  async getTerminalProviders(consumer: LlmTerminalConsumer): Promise<ProviderSettings[]> {
    this.assertConsumer(consumer)
    return Object.values((await this.get()).providers)
  }
  async getTerminalProvider(consumer: LlmTerminalConsumer, providerId: string): Promise<ProviderSettings | null> {
    this.assertConsumer(consumer)
    const config = await this.get()
    const provider = config.providers[providerId]
    const binding = config.bindings[consumer]
    return provider ? { ...provider, ...(binding.providerId === providerId && binding.modelId ? { modelId: binding.modelId, defaultModelId: binding.modelId } : {}) } : null
  }
  // Compatibility for existing internal callers. The new UI never auto-selects on save.
  async saveTerminalProvider(consumer: LlmTerminalConsumer, settings: ProviderSettings): Promise<void> {
    this.assertConsumer(consumer)
    await this.saveProvider(settings)
    if ((await this.get()).bindings[consumer].mode === 'unconfigured') await this.setTerminalDefault(consumer, settings.id)
  }
  async removeTerminalProvider(consumer: LlmTerminalConsumer, providerId: string): Promise<void> {
    this.assertConsumer(consumer)
    await this.update(config => {
      const usedBy = LLM_TERMINAL_CONSUMERS.filter(id => config.bindings[id].providerId === providerId)
      if (usedBy.length) throw new Error(`Channel is used by: ${usedBy.join(', ')}`)
      delete config.providers[providerId]
    })
  }
  async setTerminalDefault(consumer: LlmTerminalConsumer, providerId: string): Promise<void> {
    const provider = await this.getTerminalProvider(consumer, providerId)
    if (!provider) throw new Error('Channel not found')
    await this.setBinding(consumer, { mode: 'provider', providerId, modelId: channelModel(provider) })
  }
  async getTerminalDefaultSettings(consumer: LlmTerminalConsumer): Promise<ProviderSettings | null> {
    this.assertConsumer(consumer)
    const config = await this.get()
    const binding = config.bindings[consumer]
    const provider = binding.mode === 'provider' && binding.providerId ? config.providers[binding.providerId] : null
    return provider ? { ...provider, ...(binding.modelId ? { modelId: binding.modelId, defaultModelId: binding.modelId } : {}) } : null
  }
}
export const llmConfigStore = new LlmConfigStore()
