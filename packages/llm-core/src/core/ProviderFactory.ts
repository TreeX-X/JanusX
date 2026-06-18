/**
 * @file Provider 工厂
 * @description 统一创建和管理 Provider 实例
 * @module @janusx/llm-core/factory
 */

import type { ProviderSettings, ProviderExtension, LanguageModelV1, EmbeddingModelV1 } from './types'
import { AuthType } from './types'
import { ExtensionRegistry } from './ExtensionRegistry'
import { ModelCreationError, ValidationError, wrapError } from '../utils/errors'
import { validateSettings } from '../utils/validation'

const AUTH_TYPE_TO_ADAPTER: Record<string, string> = {
  [AuthType.API_KEY]: 'openai-compatible',
  [AuthType.VERTEX_AI]: 'vertex-ai',
  [AuthType.NONE]: 'openai-compatible',
}

/* ════════════════════════════════════════════════════════════
   工厂类实现
   ════════════════════════════════════════════════════════════ */

/**
 * Provider 工厂
 *
 * @description
 * 职责：
 * 1. 统一模型创建入口
 * 2. 配置验证
 * 3. 缓存管理
 * 4. 错误处理
 */
export class ProviderFactory {
  private readonly registry: ExtensionRegistry
  private readonly modelCache = new Map<string, LanguageModelV1>()
  private static instance: ProviderFactory | null = null

  /**
   * 获取全局单例实例
   */
  static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory()
    }
    return ProviderFactory.instance
  }

  /**
   * 私有构造函数（单例模式）
   */
  private constructor() {
    this.registry = ExtensionRegistry.getInstance()
  }

  private resolveAdapter(settings: ProviderSettings): ProviderExtension {
    const adapterId = AUTH_TYPE_TO_ADAPTER[settings.authType] || settings.id
    return this.registry.get(adapterId)
  }

  /**
   * 注册 Provider（委托给 Registry）
   * @param provider Provider 扩展实例
   */
  register(provider: ProviderExtension): void {
    this.registry.register(provider)
  }

  /**
   * 创建语言模型实例
   *
   * @param settings Provider 配置
   * @param modelId 模型 ID
   * @param options 创建选项
   * @returns LanguageModelV1 实例
   * @throws {ValidationError} 配置验证失败
   * @throws {ModelCreationError} 模型创建失败
   */
  async createLanguageModel(
    settings: ProviderSettings,
    modelId: string,
    options?: {
      /** 是否使用缓存 */
      useCache?: boolean
      /** 是否跳过验证 */
      skipValidation?: boolean
    }
  ): Promise<LanguageModelV1> {
    const { useCache = true, skipValidation = false } = options ?? {}

    // 缓存键
    const cacheKey = `${settings.id}:${modelId}`

    // 检查缓存
    if (useCache && this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!
    }

    // 配置验证
    if (!skipValidation) {
      const validation = validateSettings(settings)
      if (!validation.valid) {
        throw new ValidationError(validation.errors!, settings as unknown as Record<string, unknown>)
      }
    }

    // 获取 Provider 扩展
    const provider = this.resolveAdapter(settings)

    // 创建模型
    try {
      const model = await provider.createLanguageModel(settings, modelId)

      // 缓存模型
      if (useCache) {
        this.modelCache.set(cacheKey, model)
      }

      return model
    } catch (error) {
      throw new ModelCreationError(settings.id, modelId, wrapError(error, 'MODEL_CREATION_FAILED'))
    }
  }

  /**
   * 创建嵌入模型实例
   *
   * @param settings Provider 配置
   * @param modelId 模型 ID
   * @returns EmbeddingModelV1 实例
   * @throws {ValidationError} 配置验证失败
   * @throws {ModelCreationError} 模型创建失败
   */
  async createEmbeddingModel(
    settings: ProviderSettings,
    modelId: string
  ): Promise<EmbeddingModelV1> {
    // 配置验证
    const validation = validateSettings(settings)
    if (!validation.valid) {
      throw new ValidationError(validation.errors!, settings as unknown as Record<string, unknown>)
    }

    // 获取 Provider 扩展
    const provider = this.resolveAdapter(settings)

    // 检查能力
    if (!provider.capabilities.embedding) {
      throw new ModelCreationError(
        settings.id,
        modelId,
        new Error(`Provider "${settings.id}" 不支持 embedding 功能`)
      )
    }

    // 检查方法存在
    if (!provider.createEmbeddingModel) {
      throw new ModelCreationError(
        settings.id,
        modelId,
        new Error(`Provider "${settings.id}" 未实现 createEmbeddingModel 方法`)
      )
    }

    // 创建模型
    try {
      return await provider.createEmbeddingModel(settings, modelId)
    } catch (error) {
      throw new ModelCreationError(settings.id, modelId, wrapError(error, 'EMBEDDING_MODEL_CREATION_FAILED'))
    }
  }

  /**
   * 验证 Provider 配置
   *
   * @param settings Provider 配置
   * @returns 验证结果
   */
  async validateSettings(settings: ProviderSettings): Promise<boolean> {
    // 基础验证
    const validation = validateSettings(settings)
    if (!validation.valid) {
      return false
    }

    // 获取 Provider 并调用其验证方法
    try {
      const provider = this.resolveAdapter(settings)
      const result = await provider.validateSettings(settings)
      return result.valid
    } catch {
      return false
    }
  }

  /**
   * 获取 Provider 的默认模型
   *
   * @param providerId Provider ID
   * @param settings Provider 配置
   * @returns 默认模型 ID
   */
  getDefaultModel(providerId: string, settings: ProviderSettings): string {
    const provider = this.registry.get(providerId)
    return provider.getDefaultModel(settings)
  }

  /**
   * 清除模型缓存
   *
   * @param providerId 可选：仅清除指定 Provider 的缓存
   */
  clearCache(providerId?: string): void {
    if (providerId) {
      const keysToDelete = Array.from(this.modelCache.keys()).filter(key =>
        key.startsWith(`${providerId}:`)
      )
      keysToDelete.forEach(key => this.modelCache.delete(key))
    } else {
      this.modelCache.clear()
    }
  }

  /**
   * 获取所有已注册 Provider
   */
  getAllProviders(): ProviderExtension[] {
    return this.registry.getAll()
  }

  /**
   * 获取指定 Provider
   */
  getProvider(providerId: string): ProviderExtension {
    return this.registry.get(providerId)
  }

  /**
   * 检查 Provider 是否已注册
   */
  hasProvider(providerId: string): boolean {
    return this.registry.has(providerId)
  }
}
