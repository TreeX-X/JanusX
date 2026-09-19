/**
 * @file LLM 服务
 * @description 统一的 LLM 服务入口，管理 Provider 和模型创建
 */

import {
  ProviderFactory,
  ExtensionRegistry,
  OpenAICompatibleAdapter,
  AnthropicAdapter,
  VertexAIAdapter,
  validateSettings,
  getProxyManager
} from '@janusx/llm-core'
import type { ProviderSettings, LanguageModelV1, ModelInfo } from '@janusx/llm-core'
import { llmConfigStore } from './ConfigStore'
import type { LlmTerminalConsumer } from './ConfigStore'
import { AuthType } from '@janusx/llm-core'
import { app, session } from 'electron'

const AUTH_TYPE_TO_ADAPTER: Record<string, string> = {
  [AuthType.API_KEY]: 'openai-compatible',
  [AuthType.ANTHROPIC]: 'anthropic',
  [AuthType.VERTEX_AI]: 'vertex-ai',
  [AuthType.NONE]: 'openai-compatible',
}

/**
 * LLM 服务类
 */
class LlmService {
  private factory = ProviderFactory.getInstance()
  private registry = ExtensionRegistry.getInstance()
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private proxyRefreshPromise: Promise<void> | null = null

  private getAdapterForProvider(settings: ProviderSettings) {
    const adapterId = AUTH_TYPE_TO_ADAPTER[settings.authType] || settings.id
    return this.registry.get(adapterId)
  }

  private registerBuiltInAdapters(): void {
    if (!this.registry.has('openai-compatible')) {
      this.registry.register(new OpenAICompatibleAdapter())
    }

    if (!this.registry.has('anthropic')) {
      this.registry.register(new AnthropicAdapter())
    }

    if (!this.registry.has('vertex-ai')) {
      this.registry.register(new VertexAIAdapter())
    }
  }

  /**
   * 设置 Electron session 代理
   */
  private async setElectronProxy(proxyUrl: string | null): Promise<void> {
    try {
      const config = proxyUrl
        ? { mode: 'fixed_servers' as const, proxyRules: proxyUrl }
        : { mode: 'direct' as const }

      // 设置所有 session 的代理
      const sessions = [session.defaultSession, session.fromPartition('persist:webview')]
      await Promise.all(
        sessions
          .filter((s): s is NonNullable<typeof s> => s !== null)
          .map((s) => s.setProxy(config))
      )

      // 设置 app 代理
      await app.setProxy(config)
    } catch (error) {
      console.error('[LlmService] Failed to set Electron proxy:', error)
    }
  }

  private async refreshProxyConfiguration(): Promise<void> {
    if (this.proxyRefreshPromise) return this.proxyRefreshPromise

    this.proxyRefreshPromise = (async () => {
      const proxyManager = getProxyManager()
      const previousProxyUrl = proxyManager.getProxyUrl()
      proxyManager.autoDetect()
      const proxyUrl = proxyManager.getProxyUrl()

      if (proxyUrl === previousProxyUrl) return

      await this.setElectronProxy(proxyUrl)
      this.factory.clearCache()
    })()

    try {
      await this.proxyRefreshPromise
    } finally {
      this.proxyRefreshPromise = null
    }
  }

  /**
   * 初始化服务（注册适配器，初始化代理）
   */
  async initialize(): Promise<void> {
    await this.refreshProxyConfiguration()
    if (this.initialized) return
    if (this.initializePromise) return this.initializePromise

    this.initializePromise = (async () => {
      this.registerBuiltInAdapters()
      this.initialized = true
    })()

    try {
      await this.initializePromise
    } finally {
      this.initializePromise = null
    }
  }

  /**
   * 获取语言模型实例（在指定终端的自有集合内解析）。
   */
  async getLanguageModel(terminal: LlmTerminalConsumer, providerId: string, modelId: string): Promise<LanguageModelV1> {
    await this.initialize()

    const settings = await llmConfigStore.getTerminalProvider(terminal, providerId)
    if (!settings) {
      throw new Error(`Provider "${providerId}" 未配置`)
    }

    return this.factory.createLanguageModel(settings, modelId)
  }

  /**
   * 获取单终端的默认模型
   */
  async getTerminalDefaultModel(terminal: LlmTerminalConsumer): Promise<{ provider: ProviderSettings; modelId: string } | null> {
    await this.initialize()

    const provider = await llmConfigStore.getTerminalDefaultSettings(terminal)
    if (!provider) {
      return null
    }

    const adapter = this.getAdapterForProvider(provider)
    const modelId = adapter.getDefaultModel(provider)

    return { provider, modelId }
  }

  /**
   * 获取默认模型：JanusX 内部（janus 终端）默认，后台特性统一走此口径。
   */
  async getDefaultModel(): Promise<{ provider: ProviderSettings; modelId: string } | null> {
    return this.getTerminalDefaultModel('janus')
  }

  /**
   * 保存单终端的 Provider 配置
   */
  async saveTerminalProvider(terminal: LlmTerminalConsumer, settings: ProviderSettings): Promise<{ success: boolean; error?: string }> {
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
    await llmConfigStore.saveTerminalProvider(terminal, settings)

    // 清除缓存
    this.factory.clearCache(settings.id)

    return { success: true }
  }

  /**
   * 测试连接
   */
  async testConnection(
    settings: ProviderSettings,
    testModel?: string
  ): Promise<{ success: boolean; latency?: number; error?: string }> {
    await this.initialize()

    try {
      const adapter = this.getAdapterForProvider(settings)

      // 检查适配器是否有 testConnection 方法
      if ('testConnection' in adapter && typeof adapter.testConnection === 'function') {
        const result = await (adapter as any).testConnection(settings, testModel)
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
   * 获取单终端的指定 Provider 配置
   */
  async getProviderSettings(terminal: LlmTerminalConsumer, providerId: string): Promise<ProviderSettings | null> {
    return llmConfigStore.getTerminalProvider(terminal, providerId)
  }

  /**
   * 获取单终端的 Provider 列表
   */
  async getTerminalProviders(terminal: LlmTerminalConsumer): Promise<ProviderSettings[]> {
    return llmConfigStore.getTerminalProviders(terminal)
  }

  /**
   * 删除单终端的 Provider
   */
  async removeTerminalProvider(terminal: LlmTerminalConsumer, providerId: string): Promise<void> {
    await llmConfigStore.removeTerminalProvider(terminal, providerId)
    this.factory.clearCache(providerId)
  }

  /**
   * 设置单终端的默认 Provider
   */
  async setTerminalDefault(terminal: LlmTerminalConsumer, providerId: string): Promise<void> {
    await llmConfigStore.setTerminalDefault(terminal, providerId)
  }

  /**
   * 获取可用模型列表（在指定终端的自有集合内解析）。
   */
  async listModels(terminal: LlmTerminalConsumer, providerId: string): Promise<ModelInfo[]> {
    await this.initialize()

    const settings = await llmConfigStore.getTerminalProvider(terminal, providerId)
    if (!settings) {
      throw new Error(`Provider "${providerId}" 未配置`)
    }

    const adapter = this.getAdapterForProvider(settings)
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
