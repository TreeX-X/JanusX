/**
 * @file OpenAI Compatible Adapter
 * @description 标准 OpenAI API 兼容适配器，支持所有兼容 OpenAI API 的服务
 * @module @janusx/llm-core/adapters/openai-compatible
 */

import type {
  ProviderExtension,
  ProviderSettings,
  ProviderCapabilities,
  ModelInfo,
  ValidationResult,
  LanguageModelV1,
  EmbeddingModelV1
} from '../../core/types'
import { AuthType } from '../../core/types'
import { validateApiKeySettings } from '../../utils/validation'
import { ModelCreationError, wrapError } from '../../utils/errors'

/* ════════════════════════════════════════════════════════════
   OpenAI Compatible Adapter 实现
   ════════════════════════════════════════════════════════════ */

/**
 * OpenAI Compatible Adapter
 *
 * @description
 * 支持所有兼容 OpenAI API 标准的服务：
 * - OpenAI 官方 API
 * - Azure OpenAI
 * - DeepSeek
 * - Moonshot
 * - 智谱 AI
 * - 自定义部署的 OpenAI 兼容服务
 *
 * 依赖：
 * - @ai-sdk/openai (Vercel AI SDK)
 */
export class OpenAICompatibleAdapter implements ProviderExtension {
  readonly id = 'openai-compatible'
  readonly name = 'OpenAI Compatible'
  readonly authType = AuthType.API_KEY

  readonly capabilities: ProviderCapabilities = {
    chat: true,
    completion: true,
    embedding: true,
    imageGeneration: false, // 需要单独实现
    reranking: false,
    transcription: false,
    speech: false
  }

  /**
   * 创建语言模型实例
   *
   * @param settings Provider 配置
   * @param modelId 模型 ID（如 gpt-4, gpt-3.5-turbo）
   * @returns LanguageModelV1 实例
   */
  async createLanguageModel(
    settings: ProviderSettings,
    modelId: string
  ): Promise<LanguageModelV1> {
    try {
      // 动态导入 @ai-sdk/openai（避免打包体积）
      const { createOpenAI } = await import('@ai-sdk/openai')

      // 创建 OpenAI Provider
      const openai = createOpenAI({
        baseURL: settings.baseURL,
        apiKey: settings.apiKey!,
        organization: settings.organization,
      })

      // 创建语言模型
      const model = openai(modelId) as any

      return model
    } catch (error) {
      throw new ModelCreationError(
        this.id,
        modelId,
        wrapError(error, 'OPENAI_MODEL_CREATION_FAILED', {
          baseURL: settings.baseURL,
          modelId
        })
      )
    }
  }

  /**
   * 创建嵌入模型实例
   *
   * @param settings Provider 配置
   * @param modelId 嵌入模型 ID（如 text-embedding-ada-002）
   * @returns EmbeddingModelV1 实例
   */
  async createEmbeddingModel(
    settings: ProviderSettings,
    modelId: string
  ): Promise<EmbeddingModelV1> {
    try {
      const { createOpenAI } = await import('@ai-sdk/openai')

      const openai = createOpenAI({
        baseURL: settings.baseURL,
        apiKey: settings.apiKey!,
        organization: settings.organization,
      })

      // 创建嵌入模型
      const model = openai.embedding(modelId) as any

      return model
    } catch (error) {
      throw new ModelCreationError(
        this.id,
        modelId,
        wrapError(error, 'OPENAI_EMBEDDING_MODEL_CREATION_FAILED', {
          baseURL: settings.baseURL,
          modelId
        })
      )
    }
  }

  /**
   * 获取可用模型列表
   *
   * @returns 模型信息数组
   *
   * @remarks
   * OpenAI Compatible 适配器返回常见模型列表
   * 实际可用模型取决于服务提供商
   */
  async listModels(): Promise<ModelInfo[]> {
    // 常见的 OpenAI 兼容模型
    const commonModels: ModelInfo[] = [
      // GPT-4 系列
      {
        id: 'gpt-4',
        name: 'GPT-4',
        providerId: this.id,
        capabilities: {
          chat: true,
          completion: true
        },
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsFunctionCalling: true,
        supportsVision: false,
        description: 'Most capable GPT-4 model'
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        providerId: this.id,
        capabilities: {
          chat: true,
          completion: true
        },
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Latest GPT-4 Turbo with vision'
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        providerId: this.id,
        capabilities: {
          chat: true,
          completion: true
        },
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'GPT-4 Optimized for speed and cost'
      },

      // GPT-3.5 系列
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        providerId: this.id,
        capabilities: {
          chat: true,
          completion: true
        },
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsFunctionCalling: true,
        supportsVision: false,
        description: 'Fast and cost-effective model'
      },

      // Embedding 模型
      {
        id: 'text-embedding-ada-002',
        name: 'Text Embedding Ada 002',
        providerId: this.id,
        capabilities: {
          embedding: true
        },
        contextWindow: 8191,
        description: 'OpenAI embedding model'
      },
      {
        id: 'text-embedding-3-small',
        name: 'Text Embedding 3 Small',
        providerId: this.id,
        capabilities: {
          embedding: true
        },
        contextWindow: 8191,
        description: 'Smaller, faster embedding model'
      },
      {
        id: 'text-embedding-3-large',
        name: 'Text Embedding 3 Large',
        providerId: this.id,
        capabilities: {
          embedding: true
        },
        contextWindow: 8191,
        description: 'More capable embedding model'
      }
    ]

    // TODO: 未来可以调用 OpenAI API 的 /models 端点动态获取
    // 但需要处理不同服务商返回格式不一致的问题

    return commonModels
  }

  /**
   * 验证配置有效性
   *
   * @param settings Provider 配置
   * @returns 验证结果
   */
  async validateSettings(settings: ProviderSettings): Promise<ValidationResult> {
    // 1. 基础验证（字段完整性）
    const baseValidation = validateApiKeySettings(settings)
    if (!baseValidation.valid) {
      return baseValidation
    }

    // 2. 连接测试（可选，尝试创建一个简单模型）
    try {
      // 尝试导入依赖
      await import('@ai-sdk/openai')

      // 可以进一步测试连接（发送一个 test request）
      // 但为了避免消耗 API 配额，这里仅验证依赖可用
      return {
        valid: true,
        warnings: ['配置格式正确，但未测试实际连接']
      }
    } catch (error) {
      return {
        valid: false,
        errors: [
          '@ai-sdk/openai 依赖不可用，请运行: npm install @ai-sdk/openai'
        ]
      }
    }
  }

  /**
   * 测试连接（深度验证）
   *
   * @param settings Provider 配置
   * @param testModel 可选的测试模型 ID，如果不提供则使用默认模型
   * @returns 验证结果，包含延迟信息
   *
   * @remarks
   * 直接向 /chat/completions 发送最小请求，验证完整链路可用
   */
  async testConnection(
    settings: ProviderSettings,
    testModel?: string
  ): Promise<ValidationResult & { latency?: number }> {
    const startTime = Date.now()

    try {
      const modelToTest = testModel || this.getDefaultModel(settings)
      const baseURL = settings.baseURL?.replace(/\/+$/, '') || 'https://api.openai.com/v1'
      const url = `${baseURL}/chat/completions`

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (settings.apiKey) {
        headers['Authorization'] = `Bearer ${settings.apiKey}`
      }

      const payload = {
        model: modelToTest,
        messages: [{ role: 'user', content: 'hi' }],
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      })

      const latency = Date.now() - startTime

      if (resp.ok) {
        return { valid: true, latency }
      }

      const text = await resp.text().catch(() => '')
      let detail = text
      try {
        const json = JSON.parse(text)
        detail = json?.error?.message || text
      } catch {}

      if (resp.status === 401) {
        return { valid: false, errors: ['API Key 无效'] }
      }
      if (resp.status === 404) {
        return { valid: false, errors: [`模型 '${modelToTest}' 未找到，请检查 model 配置`] }
      }

      return {
        valid: false,
        errors: [`API 返回错误 (${resp.status}): ${detail.substring(0, 200)}`]
      }

    } catch (error: any) {
      let errorMessage = error.message || String(error)

      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return { valid: false, errors: ['连接超时，请检查网络或 base_url'] }
      }

      return {
        valid: false,
        errors: [`连接测试失败: ${errorMessage}`]
      }
    }
  }

  /**
   * 获取默认模型
   *
   * @param settings Provider 配置
   * @returns 默认模型 ID
   */
  getDefaultModel(settings: ProviderSettings): string {
    // 根据 baseURL 推断默认模型
    const baseURL = settings.baseURL?.toLowerCase() || ''

    // DeepSeek
    if (baseURL.includes('deepseek')) {
      return 'deepseek-chat'
    }

    // Moonshot
    if (baseURL.includes('moonshot')) {
      return 'moonshot-v1-8k'
    }

    // 智谱 AI
    if (baseURL.includes('zhipuai') || baseURL.includes('bigmodel')) {
      return 'glm-4'
    }

    // 默认 OpenAI
    return 'gpt-4o'
  }

  /**
   * 生命周期钩子：初始化
   */
  async initialize(settings: ProviderSettings): Promise<void> {
    // OpenAI Compatible 无需特殊初始化
    console.log(`[OpenAICompatibleAdapter] 初始化: ${settings.name}`)
  }

  /**
   * 生命周期钩子：销毁
   */
  async dispose(): Promise<void> {
    // 清理资源（如果有的话）
    console.log(`[OpenAICompatibleAdapter] 销毁`)
  }
}
