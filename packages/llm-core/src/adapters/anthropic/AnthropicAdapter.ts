/**
 * @file Anthropic 原生适配器
 * @description Anthropic Messages API 适配器（x-api-key + anthropic-version），与 OpenAI 兼容接口并列
 * @module @janusx/llm-core/adapters/anthropic
 */

import type {
  ProviderExtension,
  ProviderSettings,
  ProviderCapabilities,
  ModelInfo,
  ValidationResult,
  LanguageModelV1,
} from '../../core/types'
import { AuthType } from '../../core/types'
import { validateAnthropicSettings } from '../../utils/validation'
import { ModelCreationError, wrapError } from '../../utils/errors'
import { withAiSdkV1StreamCompatibility } from '../../utils/stream-compat'
import { applyModelMetadata } from '../../registry/model-registry'

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com'
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-20250514'
export const ANTHROPIC_VERSION_HEADER = '2023-06-01'

function resolveMessagesUrl(baseURL?: string): string {
  const root = (baseURL?.trim() || ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, '')
  if (root.endsWith('/v1')) return `${root}/messages`
  return `${root}/v1/messages`
}

/**
 * Anthropic 原生适配器
 *
 * @description
 * 使用 Anthropic Messages API（非 OpenAI /chat/completions）：
 * - 官方端点与兼容中转均走同一形态（x-api-key + anthropic-version）
 * - 对话经 @ai-sdk/anthropic 接入 AI SDK，与 OpenAI/Vertex 并列
 */
export class AnthropicAdapter implements ProviderExtension {
  readonly id = 'anthropic'
  readonly name = 'Anthropic'
  readonly authType = AuthType.ANTHROPIC

  readonly capabilities: ProviderCapabilities = {
    chat: true,
    completion: false,
    embedding: false,
    imageGeneration: false,
    reranking: false,
    transcription: false,
    speech: false,
  }

  async createLanguageModel(settings: ProviderSettings, modelId: string): Promise<LanguageModelV1> {
    try {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      const anthropic = createAnthropic({
        baseURL: settings.baseURL?.trim() || ANTHROPIC_DEFAULT_BASE_URL,
        apiKey: settings.apiKey!,
      })
      const model = anthropic(modelId) as any
      return withAiSdkV1StreamCompatibility(model)
    } catch (error) {
      throw new ModelCreationError(
        this.id,
        modelId,
        wrapError(error, 'ANTHROPIC_MODEL_CREATION_FAILED', {
          baseURL: settings.baseURL,
          modelId,
        }),
      )
    }
  }

  async listModels(settings?: ProviderSettings): Promise<ModelInfo[]> {
    const configured = [...new Set((settings?.models ?? [settings?.modelId ?? '']).map((id) => id.trim()).filter(Boolean))]
    const base: ModelInfo[] = [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 200000,
        maxOutputTokens: 64000,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Balanced Claude model for code and chat',
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 200000,
        maxOutputTokens: 32000,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Most capable Claude model',
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude Sonnet 3.7',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 200000,
        maxOutputTokens: 64000,
        supportsFunctionCalling: true,
        supportsVision: true,
        description: 'Previous-generation Sonnet',
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude Haiku 3.5',
        providerId: this.id,
        capabilities: { chat: true },
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsFunctionCalling: true,
        supportsVision: false,
        description: 'Fast Claude model for light tasks',
      },
    ]
    const merged = configured.length > 0
      ? configured.map((id) => ({
          id,
          name: id,
          providerId: this.id,
          capabilities: { chat: true },
          supportsFunctionCalling: true,
          supportsVision: true,
          description: 'Configured Anthropic model',
        }) as ModelInfo)
      : base
    return merged.map((model) => applyModelMetadata(model))
  }

  async validateSettings(settings: ProviderSettings): Promise<ValidationResult> {
    const baseValidation = validateAnthropicSettings(settings)
    if (!baseValidation.valid) return baseValidation
    try {
      await import('@ai-sdk/anthropic')
      return { valid: true, warnings: ['配置格式正确，但未测试实际连接'] }
    } catch {
      return { valid: false, errors: ['@ai-sdk/anthropic 依赖不可用，请运行: npm install @ai-sdk/anthropic@1'] }
    }
  }

  async testConnection(
    settings: ProviderSettings,
    testModel?: string,
  ): Promise<ValidationResult & { latency?: number }> {
    const startTime = Date.now()
    try {
      const modelToTest = testModel || this.getDefaultModel(settings)
      const url = resolveMessagesUrl(settings.baseURL)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION_HEADER,
      }
      if (settings.apiKey) headers['x-api-key'] = settings.apiKey
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelToTest,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      const latency = Date.now() - startTime
      if (resp.ok) return { valid: true, latency }
      const text = await resp.text().catch(() => '')
      let detail = text
      try {
        const json = JSON.parse(text) as { error?: { message?: string } }
        detail = json?.error?.message || text
      } catch {}
      if (resp.status === 401) return { valid: false, errors: ['API Key 无效'] }
      if (resp.status === 404) return { valid: false, errors: [`模型 '${modelToTest}' 未找到，请检查 model 配置`] }
      return { valid: false, errors: [`API 返回错误 (${resp.status}): ${detail.substring(0, 200)}`] }
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        return { valid: false, errors: ['连接超时，请检查网络或 base_url'] }
      }
      return { valid: false, errors: [`连接测试失败: ${error?.message || String(error)}`] }
    }
  }

  getDefaultModel(settings: ProviderSettings): string {
    return settings.defaultModelId || settings.modelId || settings.models?.[0] || ANTHROPIC_DEFAULT_MODEL
  }

  async initialize(_settings: ProviderSettings): Promise<void> {}

  async dispose(): Promise<void> {}
}
