/**
 * @file LLM Core 统一导出
 * @description @janusx/llm-core 包的主入口文件
 * @module @janusx/llm-core
 */

/* ════════════════════════════════════════════════════════════
   核心类型导出
   ════════════════════════════════════════════════════════════ */

export type {
  // 类型定义
  ProviderSettings,
  ProviderCapabilities,
  ProviderExtension,
  ModelInfo,
  ValidationResult,
  VertexAIConfig,
  LanguageModelV1,
  EmbeddingModelV1
} from './core/types'

export { AuthType } from './core/types'

/* ════════════════════════════════════════════════════════════
   核心类导出
   ════════════════════════════════════════════════════════════ */

export { ExtensionRegistry } from './core/ExtensionRegistry'
export { ProviderFactory } from './core/ProviderFactory'

/* ════════════════════════════════════════════════════════════
   工具函数导出
   ════════════════════════════════════════════════════════════ */

export {
  // 错误类
  LlmCoreError,
  ProviderNotFoundError,
  ProviderAlreadyExistsError,
  ValidationError,
  ModelCreationError,
  ConfigLoadError,
  // 错误工具函数
  wrapError,
  isLlmCoreError
} from './utils/errors'

export {
  // 验证函数
  validateRequired,
  validateURL,
  validateStringLength,
  validateProviderSettings,
  validateApiKeySettings,
  validateVertexAISettings,
  validateSettings
} from './utils/validation'

/* ════════════════════════════════════════════════════════════
   配置加载器导出
   ════════════════════════════════════════════════════════════ */

export type { ProviderMetadata, ProvidersConfig } from './registry/loader'

export {
  ConfigLoader,
  getConfigLoader,
  getAllProviderMetadata,
  getProviderMetadata
} from './registry/loader'

/* ════════════════════════════════════════════════════════════
   便捷函数（Facade 模式）
   ════════════════════════════════════════════════════════════ */

import { ProviderFactory } from './core/ProviderFactory'
import type { ProviderSettings, LanguageModelV1, EmbeddingModelV1 } from './core/types'

/**
 * 快速创建语言模型（无需手动实例化 Factory）
 * @param settings Provider 配置
 * @param modelId 模型 ID
 * @returns LanguageModelV1 实例
 */
export async function createLanguageModel(
  settings: ProviderSettings,
  modelId: string
): Promise<LanguageModelV1> {
  const factory = ProviderFactory.getInstance()
  return factory.createLanguageModel(settings, modelId)
}

/**
 * 快速创建嵌入模型
 * @param settings Provider 配置
 * @param modelId 模型 ID
 * @returns EmbeddingModelV1 实例
 */
export async function createEmbeddingModel(
  settings: ProviderSettings,
  modelId: string
): Promise<EmbeddingModelV1> {
  const factory = ProviderFactory.getInstance()
  return factory.createEmbeddingModel(settings, modelId)
}

/**
 * 验证 Provider 配置
 * @param settings Provider 配置
 * @returns 是否有效
 */
export async function validateProviderConfig(settings: ProviderSettings): Promise<boolean> {
  const factory = ProviderFactory.getInstance()
  return factory.validateSettings(settings)
}
