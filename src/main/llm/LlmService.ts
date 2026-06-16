/**
 * @file LLM 服务
 * @description 统一的 LLM 服务入口，管理 Provider 和模型创建
 */

import {
  ProviderFactory,
  ExtensionRegistry,
  OpenAICompatibleAdapter,
  validateSettings
} from '@janusx/llm-core'
import type { ProviderSettings, LanguageModelV1, ModelInfo } from '@janusx/llm-core'
import { llmConfigStore } from './ConfigStore'

/**
 * LLM 服务类
 */
class LlmService {
  private factory = ProviderFactory.getInstance()
  private registry = ExtensionRegistry.getInstance()
  private initialized = false

  /**
   * 初始化服务（注册适配器）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // 注册内置适配器
    this.registry.register(new OpenAICompatibleAdapter())

    // TODO: 未来注册更多适配器
    // this.registry.register(new VertexAIAdapter())

    this.initialized = true
    console.log('[LlmService] 已初始化，注册适配器数:', this.registry.size)
  }

  /**
   * 获取语言模型实例
   */
  async getLanguageModel(providerId: string, modelId: string): Promise<LanguageModelV1> {
    await this.initialize()

    const settings = await llmConfigStore.getProviderSettings(providerId)
    if (!settings) {
      throw new Error(`Provider "${providerId}" 未配置`)
    }

    return this.factory.createLanguageModel(settings, modelId)
  }

  /**
   * 获取默认模型
   */
  async getDefaultModel(): Promise<{ provider: ProviderSettings; modelId: string } | null> {
    await this.initialize()

    const provider = await llmConfigStore.getDefaultProvider()
    if (!provider) {
      return null
    }

    const adapter = this.registry.get(provider.id)
    const modelId = adapter.getDefaultModel(provider)

    return { provider, modelId }
  }

  /**
   * 保存 Provider 配置
   */
  async saveProvider(settings: ProviderSettings): Promise<{ success: boolean; error?: string }> {
    await this.initialize()

    // 验证配置
    const validation = validateSettings(settings)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors?.join(', ')
      }
    }

    // 保存到配置
    await llmConfigStore.saveProviderSettings(settings)

    // 清除缓存
    this.factory.clearCache(settings.id)

    return { success: true }
  }

  /**
   * 测试连接
   */
  async testConnection(
    settings: ProviderSettings
  ): Promise<{ success: boolean; latency?: number; error?: string }> {
    await this.initialize()

    try {
      const adapter = this.registry.get(settings.id)

      // 检查适配器是否有 testConnection 方法
      if ('testConnection' in adapter && typeof adapter.testConnection === 'function') {
        const result = await (adapter as any).testConnection(settings)
        return {
          success: result.valid,
          latency: result.latency,
          error: result.errors?.join(', ')
        }
      }

      // 降级：仅验证配置
      const validation = await adapter.validateSettings(settings)
      return {
        success: validation.valid,
        error: validation.errors?.join(', ')
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error)
      }
    }
  }

  /**
   * 获取所有 Provider 配置
   */
  async getAllProviders(): Promise<ProviderSettings[]> {
    return llmConfigStore.getAllProviders()
  }

  /**
   * 删除 Provider
   */
  async removeProvider(providerId: string): Promise<void> {
    await llmConfigStore.removeProvider(providerId)
    this.factory.clearCache(providerId)
  }

  /**
   * 设置默认 Provider
   */
  async setDefaultProvider(providerId: string): Promise<void> {
    await llmConfigStore.setDefaultProvider(providerId)
  }

  /**
   * 获取可用模型列表
   */
  async listModels(providerId: string): Promise<ModelInfo[]> {
    await this.initialize()

    const settings = await llmConfigStore.getProviderSettings(providerId)
    if (!settings) {
      throw new Error(`Provider "${providerId}" 未配置`)
    }

    const adapter = this.registry.get(settings.id)
    return adapter.listModels(settings)
  }

  /**
   * 获取所有可用的适配器类型
   */
  getAvailableAdapters(): Array<{ id: string; name: string; authType: string }> {
    return this.registry.getAll().map((adapter) => ({
      id: adapter.id,
      name: adapter.name,
      authType: adapter.authType
    }))
  }
}

export const llmService = new LlmService()
