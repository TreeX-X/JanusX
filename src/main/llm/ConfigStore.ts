/**
 * @file LLM 配置存储服务
 * @description 管理 LLM Provider 配置的持久化
 */

import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import type { ProviderSettings } from '@janusx/llm-core'

interface LlmConfig {
  version: string
  providers: Record<string, ProviderSettings>
  defaultProvider: string | null
}

const DEFAULT_CONFIG: LlmConfig = {
  version: '1.0.0',
  providers: {},
  defaultProvider: null
}

/**
 * LLM 配置存储服务
 */
class LlmConfigStore {
  private configPath: string
  private config: LlmConfig | null = null

  constructor() {
    this.configPath = join(app.getPath('userData'), 'janusx', 'llm-config.json')
  }

  private async ensureDir(): Promise<void> {
    await mkdir(join(app.getPath('userData'), 'janusx'), { recursive: true })
  }

  /**
   * 加载配置
   */
  async load(): Promise<LlmConfig> {
    try {
      const data = await readFile(this.configPath, 'utf-8')
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) }
    } catch {
      this.config = { ...DEFAULT_CONFIG }
      await this.save()
    }
    return this.config!
  }

  /**
   * 保存配置
   */
  async save(): Promise<void> {
    if (!this.config) return
    await this.ensureDir()
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2))
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
    const config = await this.get()
    config.providers[settings.id] = settings

    // 如果是第一个 Provider，设为默认
    if (!config.defaultProvider) {
      config.defaultProvider = settings.id
    }

    await this.save()
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
    const config = await this.get()
    delete config.providers[providerId]

    // 如果删除的是默认 Provider，重置默认
    if (config.defaultProvider === providerId) {
      const remaining = Object.keys(config.providers)
      config.defaultProvider = remaining.length > 0 ? remaining[0]! : null
    }

    await this.save()
  }

  /**
   * 设置默认 Provider
   */
  async setDefaultProvider(providerId: string): Promise<void> {
    const config = await this.get()
    if (config.providers[providerId]) {
      config.defaultProvider = providerId
      await this.save()
    }
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
}

export const llmConfigStore = new LlmConfigStore()
