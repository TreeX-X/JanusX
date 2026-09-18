/**
 * @file LLM 配置存储服务
 * @description 管理 LLM Provider 配置的持久化
 */

import { app } from 'electron'
import { join } from 'path'
import { readFile, rename } from 'fs/promises'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import type { ProviderSettings } from '@janusx/llm-core'

// Note: 按终端独立维护的 LLM 绑定（external-cli 单源+各端异构的 JSON 落法）——见 .agents/notes/implemented/feature/2026-09-18-settings-terminal-llm.md
/** 与 external-cli 外部 CLI 对齐的终端消费者；shell 无 LLM，不参与绑定。 */
export type LlmTerminalConsumer = 'janus' | 'claude' | 'codex' | 'opencode' | 'pi'

export const LLM_TERMINAL_CONSUMERS: readonly LlmTerminalConsumer[] = ['janus', 'claude', 'codex', 'opencode', 'pi']

/** 单终端绑定：null 表示跟随全局默认；modelId 为空时沿用 Provider 默认模型。 */
export interface LlmTerminalBinding {
  providerId: string | null
  modelId?: string
}

interface LlmConfig {
  version: string
  providers: Record<string, ProviderSettings>
  defaultProvider: string | null
  terminalBindings: Record<LlmTerminalConsumer, LlmTerminalBinding>
}

function emptyBindings(): Record<LlmTerminalConsumer, LlmTerminalBinding> {
  return { janus: { providerId: null }, claude: { providerId: null }, codex: { providerId: null }, opencode: { providerId: null }, pi: { providerId: null } }
}

function normalizeBindings(value: unknown): Record<LlmTerminalConsumer, LlmTerminalBinding> {
  const base = emptyBindings()
  if (typeof value !== 'object' || value === null) return base
  const record = value as Record<string, unknown>
  for (const consumer of LLM_TERMINAL_CONSUMERS) {
    const entry = record[consumer] as Partial<LlmTerminalBinding> | undefined
    if (entry && typeof entry === 'object' && ('providerId' in entry)) {
      base[consumer] = {
        providerId: typeof entry.providerId === 'string' ? entry.providerId : null,
        ...(typeof entry.modelId === 'string' && entry.modelId.trim() ? { modelId: entry.modelId.trim() } : {}),
      }
    }
  }
  return base
}

const DEFAULT_CONFIG: LlmConfig = {
  version: '1.0.0',
  providers: {},
  defaultProvider: null,
  terminalBindings: emptyBindings(),
}

/**
 * LLM 配置存储服务
 */
class LlmConfigStore {
  private configPath: string
  private config: LlmConfig | null = null
  private writeQueue = new SerialQueue()

  constructor() {
    this.configPath = join(app.getPath('userData'), 'janusx', 'llm-config.json')
  }

  /**
   * 加载配置
   */
  async load(): Promise<LlmConfig> {
    try {
      const data = await readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(data) as Partial<LlmConfig>
      this.config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        providers: (parsed.providers && typeof parsed.providers === 'object' ? parsed.providers : {}) as Record<string, ProviderSettings>,
        terminalBindings: normalizeBindings((parsed as { terminalBindings?: unknown }).terminalBindings),
      }
    } catch (error) {
      // 解析失败（文件存在但损坏）时先备份，避免默认配置覆盖后 Provider 配置无法恢复
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        try {
          await rename(this.configPath, `${this.configPath}.corrupt-${Date.now()}`)
        } catch {
          /* 备份失败不阻塞启动 */
        }
      }
      this.config = { ...DEFAULT_CONFIG }
      await this.persist()
    }
    return this.config!
  }

  /**
   * 保存配置
   */
  async save(): Promise<void> {
    await this.writeQueue.run(() => this.persist())
  }

  private async persist(): Promise<void> {
    if (!this.config) return
    await writeFileAtomic(this.configPath, JSON.stringify(this.config, null, 2))
  }

  /**
   * 获取当前配置
   */
  async get(): Promise<LlmConfig> {
    if (!this.config) {
      this.config = await this.load()
    }
    return this.config
  }

  /**
   * 保存 Provider 配置
   */
  async saveProviderSettings(settings: ProviderSettings): Promise<void> {
    await this.writeQueue.run(async () => {
      const config = await this.get()
      config.providers[settings.id] = settings

      // 如果是第一个 Provider，设为默认
      if (!config.defaultProvider) {
        config.defaultProvider = settings.id
      }

      await this.persist()
    })
  }

  /**
   * 获取指定 Provider 配置
   */
  async getProviderSettings(providerId: string): Promise<ProviderSettings | null> {
    const config = await this.get()
    return config.providers[providerId] || null
  }

  /**
   * 获取所有 Provider 配置
   */
  async getAllProviders(): Promise<ProviderSettings[]> {
    const config = await this.get()
    return Object.values(config.providers)
  }

  /**
   * 删除 Provider 配置
   */
  async removeProvider(providerId: string): Promise<void> {
    await this.writeQueue.run(async () => {
      const config = await this.get()
      delete config.providers[providerId]

      // 如果删除的是默认 Provider，重置默认
      if (config.defaultProvider === providerId) {
        const remaining = Object.keys(config.providers)
        config.defaultProvider = remaining.length > 0 ? remaining[0]! : null
      }

      // 跟随清理各终端绑定：指向已删 Provider 的绑定退回跟随默认，不悬空。
      for (const consumer of LLM_TERMINAL_CONSUMERS) {
        if (config.terminalBindings[consumer]?.providerId === providerId) {
          config.terminalBindings[consumer] = { providerId: null }
        }
      }

      await this.persist()
    })
  }

  /**
   * 设置默认 Provider
   */
  async setDefaultProvider(providerId: string): Promise<void> {
    await this.writeQueue.run(async () => {
      const config = await this.get()
      if (config.providers[providerId]) {
        config.defaultProvider = providerId
        await this.persist()
      }
    })
  }

  /**
   * 获取默认 Provider
   */
  async getDefaultProvider(): Promise<ProviderSettings | null> {
    const config = await this.get()
    if (config.defaultProvider && config.providers[config.defaultProvider]) {
      return config.providers[config.defaultProvider]!
    }
    return null
  }

  /**
   * 获取全部终端绑定（缺键按跟随默认补齐，调用方只读）。
   */
  async getTerminalBindings(): Promise<Record<LlmTerminalConsumer, LlmTerminalBinding>> {
    const config = await this.get()
    return { ...config.terminalBindings }
  }

  /**
   * 设置单终端绑定：providerId 为 null 表示跟随全局默认。
   */
  async setTerminalBinding(consumer: LlmTerminalConsumer, binding: LlmTerminalBinding): Promise<void> {
    if (!LLM_TERMINAL_CONSUMERS.includes(consumer)) throw new Error(`Unknown terminal consumer "${consumer}"`)
    await this.writeQueue.run(async () => {
      const config = await this.get()
      if (binding.providerId !== null && !config.providers[binding.providerId]) {
        throw new Error(`Provider "${binding.providerId}" 未配置`)
      }
      config.terminalBindings[consumer] = {
        providerId: binding.providerId,
        ...(binding.modelId?.trim() ? { modelId: binding.modelId.trim() } : {}),
      }
      await this.persist()
    })
  }

  /**
   * 解析单终端实际生效的 Provider：绑定优先，缺省回退全局默认。
   */
  async resolveTerminalProvider(consumer: LlmTerminalConsumer): Promise<{ provider: ProviderSettings; modelId: string } | null> {
    const config = await this.get()
    const binding = config.terminalBindings[consumer]
    const bound = binding?.providerId ? config.providers[binding.providerId] : undefined
    const provider = bound ?? (config.defaultProvider ? config.providers[config.defaultProvider] : undefined) ?? null
    if (!provider) return null
    const modelId = binding?.modelId?.trim() || provider.defaultModelId || provider.modelId || provider.models?.find(Boolean) || ''
    if (!modelId) return { provider, modelId: '' }
    return { provider, modelId }
  }
}

export const llmConfigStore = new LlmConfigStore()
