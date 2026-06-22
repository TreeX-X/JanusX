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
import { validateVertexAISettings } from '../../utils/validation'
import { ModelCreationError, wrapError } from '../../utils/errors'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { getProxyManager } from '../../utils/proxy'

/**
 * 规范化 PEM 私钥格式
 * 将字面的 \n 转换为实际换行符，并确保格式正确
 */
function normalizePrivateKey(key: string): string {
  if (!key) return key
  
  // 移除首尾空白
  let normalized = key.trim()
  
  // 移除可能的外层引号
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || 
      (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1)
  }
  
  // 将字面的 \n 转换为实际换行符（支持多次转义）
  normalized = normalized.replace(/\\n/g, '\n')
  
  // 移除可能的多余空白行
  normalized = normalized.replace(/\n\s*\n/g, '\n')
  
  // 确保私钥以正确的 PEM 头开始
  if (!normalized.includes('-----BEGIN')) {
    throw new Error('私钥格式错误：缺少 PEM 头部标记（-----BEGIN ...-----）')
  }
  
  // 确保私钥以正确的 PEM 尾结束
  if (!normalized.includes('-----END')) {
    throw new Error('私钥格式错误：缺少 PEM 尾部标记（-----END ...-----）')
  }
  
  return normalized
}

export class VertexAIAdapter implements ProviderExtension {
  readonly id = 'vertex-ai'
  readonly name = 'Vertex AI'
  readonly authType = AuthType.VERTEX_AI

  readonly capabilities: ProviderCapabilities = {
    chat: true,
    completion: false,
    embedding: true,
    imageGeneration: true,
    reranking: false,
    transcription: false,
    speech: false
  }

  async createLanguageModel(
    settings: ProviderSettings,
    modelId: string
  ): Promise<LanguageModelV1> {
    try {
      const { createVertex } = await import('@ai-sdk/google-vertex')
      const vertexConfig = settings.vertexAI!

      // 获取代理 Agent（优先使用配置的代理，其次使用全局代理管理器）
      const proxyAgent = this.getProxyAgent(vertexConfig.proxy)

      const vertexOptions: any = {
        project: vertexConfig.projectId,
        location: vertexConfig.region,
      }

      // 构建代理配置
      const proxyAgentOptions = proxyAgent ? {
        clientOptions: {
          transporterOptions: {
            agent: proxyAgent,
          }
        }
      } : {}

      if (vertexConfig.useADC) {
        vertexOptions.googleAuthOptions = proxyAgentOptions
      } else if (vertexConfig.clientEmail && vertexConfig.privateKey) {
        vertexOptions.googleAuthOptions = {
          ...proxyAgentOptions,
          credentials: {
            client_email: vertexConfig.clientEmail,
            private_key: normalizePrivateKey(vertexConfig.privateKey),
          }
        }
      } else if (vertexConfig.serviceAccountJSON) {
        const keyData = JSON.parse(vertexConfig.serviceAccountJSON)
        vertexOptions.googleAuthOptions = {
          ...proxyAgentOptions,
          credentials: {
            client_email: keyData.client_email,
            private_key: normalizePrivateKey(keyData.private_key),
          }
        }
      } else if (vertexConfig.serviceAccountPath) {
        vertexOptions.googleAuthOptions = {
          ...proxyAgentOptions,
          keyFilename: vertexConfig.serviceAccountPath,
        }
      }

      const vertex = createVertex(vertexOptions)
      return vertex(modelId) as any
    } catch (error) {
      throw new ModelCreationError(
        this.id,
        modelId,
        wrapError(error, 'VERTEX_MODEL_CREATION_FAILED', {
          projectId: settings.vertexAI?.projectId,
          region: settings.vertexAI?.region,
          modelId
        })
      )
    }
  }

  async createEmbeddingModel(
    _settings: ProviderSettings,
    modelId: string
  ): Promise<EmbeddingModelV1> {
    try {
      const { createVertex } = await import('@ai-sdk/google-vertex')
      const vertexConfig = _settings.vertexAI!

      // 获取代理 Agent（优先使用配置的代理，其次使用全局代理管理器）
      const proxyAgent = this.getProxyAgent(vertexConfig.proxy)

      const vertexOptions: any = {
        project: vertexConfig.projectId,
        location: vertexConfig.region,
      }

      // 构建代理配置
      const proxyAgentOptions = proxyAgent ? {
        clientOptions: {
          transporterOptions: {
            agent: proxyAgent,
          }
        }
      } : {}

      if (vertexConfig.clientEmail && vertexConfig.privateKey) {
        vertexOptions.googleAuthOptions = {
          ...proxyAgentOptions,
          credentials: {
            client_email: vertexConfig.clientEmail,
            private_key: normalizePrivateKey(vertexConfig.privateKey),
          }
        }
      } else if (vertexConfig.serviceAccountJSON) {
        const keyData = JSON.parse(vertexConfig.serviceAccountJSON)
        vertexOptions.googleAuthOptions = {
          ...proxyAgentOptions,
          credentials: {
            client_email: keyData.client_email,
            private_key: normalizePrivateKey(keyData.private_key),
          }
        }
      }

      const vertex = createVertex(vertexOptions)
      return vertex.embeddingModel(modelId) as any
    } catch (error) {
      throw new ModelCreationError(
        this.id,
        modelId,
        wrapError(error, 'VERTEX_EMBEDDING_CREATION_FAILED')
      )
    }
  }

  async listModels(_settings: ProviderSettings): Promise<ModelInfo[]> {
    return [
      {
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Latest fast model'
      },
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro Preview',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Latest pro model with thinking'
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Pro with thinking'
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Fast with thinking'
      },
      {
        id: 'gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Fast multimodal'
      },
      {
        id: 'text-embedding-005',
        name: 'Text Embedding 005',
        providerId: this.id,
        capabilities: { embedding: true },
        contextWindow: 2048,
        description: 'Latest text embedding model'
      },
      {
        id: 'gemini-embedding-2-preview',
        name: 'Gemini Embedding 2',
        providerId: this.id,
        capabilities: { embedding: true },
        contextWindow: 2048,
        description: 'Next-gen embedding model'
      }
    ]
  }

  async validateSettings(settings: ProviderSettings): Promise<ValidationResult> {
    if (!settings.vertexAI) {
      return { valid: false, errors: ['缺少 Vertex AI 配置'] }
    }
    return validateVertexAISettings(settings.vertexAI)
  }

  async testConnection(
    settings: ProviderSettings,
    testModel?: string
  ): Promise<ValidationResult & { latency?: number }> {
    const startTime = Date.now()
    try {
      const model = await this.createLanguageModel(settings, testModel || this.getDefaultModel(settings))
      const { generateText } = await import('ai')
      await generateText({
        model: model as any,
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 1,
      })
      return { valid: true, latency: Date.now() - startTime }
    } catch (error: any) {
      return {
        valid: false,
        latency: Date.now() - startTime,
        errors: [error.message || String(error)]
      }
    }
  }

  getDefaultModel(settings: ProviderSettings): string {
    return settings.modelId || 'gemini-2.5-flash'
  }

  async initialize(settings: ProviderSettings): Promise<void> {
    console.log(`[VertexAIAdapter] 初始化: ${settings.vertexAI?.projectId}`)
  }

  async dispose(): Promise<void> {
    console.log(`[VertexAIAdapter] 销毁`)
  }

  /**
   * 获取代理 Agent
   * 优先使用配置的代理，其次使用全局代理管理器
   */
  private getProxyAgent(configProxy?: string): HttpsProxyAgent<string> | undefined {
    // 如果配置了代理，直接使用
    if (configProxy) {
      return new HttpsProxyAgent(configProxy)
    }

    // 否则尝试从全局代理管理器获取
    try {
      const proxyManager = getProxyManager()
      return proxyManager.getAgent()
    } catch {
      return undefined
    }
  }
}
