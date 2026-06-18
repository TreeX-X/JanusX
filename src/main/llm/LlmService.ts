/**
 * @file LLM 服务
 * @description 统一的 LLM 服务入口，管理 Provider 和模型创建
 */

import {
  ProviderFactory,
  ExtensionRegistry,
  OpenAICompatibleAdapter,
  VertexAIAdapter,
  validateSettings,
  getProxyManager
} from '@janusx/llm-core'
import type { ProviderSettings, LanguageModelV1, ModelInfo } from '@janusx/llm-core'
import { llmConfigStore } from './ConfigStore'
import { AuthType } from '@janusx/llm-core'
import { app, session } from 'electron'

const AUTH_TYPE_TO_ADAPTER: Record<string, string> = {
  [AuthType.API_KEY]: 'openai-compatible',
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

  private getAdapterForProvider(settings: ProviderSettings) {
    const adapterId = AUTH_TYPE_TO_ADAPTER[settings.authType] || settings.id
    return this.registry.get(adapterId)
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

  /**
   * 初始化服务（注册适配器，初始化代理）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // 初始化全局代理管理器（自动检测系统代理）
    const proxyManager = getProxyManager({
      info: console.log,
      warn: console.warn,
      error: console.error,
    })
    proxyManager.autoDetect()

    // 设置 Electron session 代理
    const proxyUrl = proxyManager.getProxyUrl()
    if (proxyUrl) {
      await this.setElectronProxy(proxyUrl)
    }

    this.registry.register(new OpenAICompatibleAdapter())
    this.registry.register(new VertexAIAdapter())

    this.initialized = true
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

    const adapter = this.getAdapterForProvider(provider)
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
   * 获取指定 Provider 配置
   */
  async getProviderSettings(providerId: string): Promise<ProviderSettings | null> {
    return llmConfigStore.getProviderSettings(providerId)
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

  /**
   * 获取 AI SDK 模块
   */
  async getAiModule() {
    // 动态导入 ai 包
    const aiPath = require.resolve('ai', { paths: [require.resolve('@janusx/llm-core')] })
    return require(aiPath)
  }

  /**
   * 直接调用 Vertex AI API
   */
  async callVertexAI(
    settings: ProviderSettings,
    messages: Array<{ role: string; content: string }>,
    modelId: string
  ): Promise<string> {
    const { GoogleAuth } = require('google-auth-library')
    const vertexConfig = settings.vertexAI!

    // 创建认证
    const auth = new GoogleAuth({
      credentials: {
        client_email: vertexConfig.clientEmail,
        private_key: vertexConfig.privateKey?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })

    // 获取 token
    const client = await auth.getClient()
    const token = await client.getAccessToken()

    // 构建请求体
    const contents = []
    let systemInstruction = undefined

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] }
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })
      }
    }

    const body: any = {
      contents,
      generationConfig: {
        temperature: 0.7,
      },
    }

    if (systemInstruction) {
      body.systemInstruction = systemInstruction
    }

    // 发送请求
    const url = `https://aiplatform.googleapis.com/v1beta1/projects/${vertexConfig.projectId}/locations/${vertexConfig.region}/publishers/google/models/${modelId}:generateContent`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error.message)
    }

    // 提取文本
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return text
  }
}

export const llmService = new LlmService()
