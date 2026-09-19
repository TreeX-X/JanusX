/**
 * @file LLM 配置存储服务
 * @description 按终端分集合持久化 LLM Provider 配置；各终端拥有独立列表与默认
 */

import { app } from 'electron'
import { join } from 'path'
import { readFile, rename } from 'fs/promises'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import type { ProviderSettings } from '@janusx/llm-core'
import {
  emptyLlmConfig,
  LLM_TERMINAL_CONSUMERS,
  normalizeLlmConfigDocument,
  type LlmConfig,
  type LlmTerminalConsumer,
} from './config-document'

export type { LlmTerminalConsumer } from './config-document'
export { LLM_TERMINAL_CONSUMERS } from './config-document'

// Note: 各终端独立 Provider 集合（同一池拆分为五份，读旧池一次性迁移）——见 .agents/notes/implemented/feature/2026-09-18-terminal-provider-collections.md

/**
 * LLM 配置存储服务
 */
export class LlmConfigStore {
  private configPath: string
  private config: LlmConfig | null = null
  private writeQueue = new SerialQueue()

  constructor(userDataDir?: string) {
    this.configPath = join(userDataDir ?? app.getPath('userData'), 'janusx', 'llm-config.json')
  }

  /**
   * 加载配置
   */
  async load(): Promise<LlmConfig> {
    try {
      const data = await readFile(this.configPath, 'utf-8')
      const normalized = normalizeLlmConfigDocument(JSON.parse(data))
      if (!normalized) throw new Error('Unrecognized LLM config shape.')
      this.config = normalized.config
      if (normalized.migrated) await this.persist()
    } catch (error) {
      // 解析失败（文件存在但损坏）时先备份，避免默认配置覆盖后 Provider 配置无法恢复
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        try {
          await rename(this.configPath, `${this.configPath}.corrupt-${Date.now()}`)
        } catch {
          /* 备份失败不阻塞启动 */
        }
      }
      this.config = emptyLlmConfig()
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

  private static assertConsumer(consumer: string): asserts consumer is LlmTerminalConsumer {
    if (!LLM_TERMINAL_CONSUMERS.includes(consumer as LlmTerminalConsumer)) {
      throw new Error(`Unknown terminal consumer "${consumer}"`)
    }
  }

  /**
   * 获取单终端的 Provider 列表（自有集合，不含其他终端条目）。
   */
  async getTerminalProviders(consumer: LlmTerminalConsumer): Promise<ProviderSettings[]> {
    LlmConfigStore.assertConsumer(consumer)
    const config = await this.get()
    return Object.values(config.terminals[consumer].providers)
  }

  /**
   * 获取单终端的指定 Provider。
   */
  async getTerminalProvider(consumer: LlmTerminalConsumer, providerId: string): Promise<ProviderSettings | null> {
    LlmConfigStore.assertConsumer(consumer)
    const config = await this.get()
    return config.terminals[consumer].providers[providerId] || null
  }

  /**
   * 保存单终端的 Provider 配置
   */
  async saveTerminalProvider(consumer: LlmTerminalConsumer, settings: ProviderSettings): Promise<void> {
    LlmConfigStore.assertConsumer(consumer)
    await this.writeQueue.run(async () => {
      const config = await this.get()
      const collection = config.terminals[consumer]
      collection.providers[settings.id] = settings

      // 如果是该终端第一个 Provider，设为该终端默认
      if (!collection.defaultId) {
        collection.defaultId = settings.id
      }

      await this.persist()
    })
  }

  /**
   * 删除单终端的 Provider 配置
   */
  async removeTerminalProvider(consumer: LlmTerminalConsumer, providerId: string): Promise<void> {
    LlmConfigStore.assertConsumer(consumer)
    await this.writeQueue.run(async () => {
      const config = await this.get()
      const collection = config.terminals[consumer]
      delete collection.providers[providerId]

      // 如果删除的是该终端默认，顺延到剩余首个
      if (collection.defaultId === providerId) {
        const remaining = Object.keys(collection.providers)
        collection.defaultId = remaining.length > 0 ? remaining[0]! : null
      }

      await this.persist()
    })
  }

  /**
   * 设置单终端的默认 Provider
   */
  async setTerminalDefault(consumer: LlmTerminalConsumer, providerId: string): Promise<void> {
    LlmConfigStore.assertConsumer(consumer)
    await this.writeQueue.run(async () => {
      const config = await this.get()
      const collection = config.terminals[consumer]
      if (collection.providers[providerId]) {
        collection.defaultId = providerId
        await this.persist()
      }
    })
  }

  /**
   * 获取单终端的默认 Provider
   */
  async getTerminalDefaultSettings(consumer: LlmTerminalConsumer): Promise<ProviderSettings | null> {
    LlmConfigStore.assertConsumer(consumer)
    const config = await this.get()
    const collection = config.terminals[consumer]
    if (collection.defaultId && collection.providers[collection.defaultId]) {
      return collection.providers[collection.defaultId]!
    }
    return null
  }
}

export const llmConfigStore = new LlmConfigStore()
