/**
 * @file 核心类型定义
 * @description 统一 Provider、Model、Configuration 的类型抽象
 * @module @janusx/llm-core/types
 */

import type { LanguageModelV1, EmbeddingModel } from 'ai'

/* ════════════════════════════════════════════════════════════
   认证类型枚举
   ════════════════════════════════════════════════════════════ */

/**
 * Provider 支持的认证方式
 */
export enum AuthType {
  /** API Key 认证（标准 OpenAI 兼容） */
  API_KEY = 'api-key',
  /** Google Cloud Vertex AI 认证 */
  VERTEX_AI = 'vertex-ai',
  /** OAuth 2.0 认证 */
  OAUTH = 'oauth',
  /** 无需认证（本地模型） */
  NONE = 'none'
}

/* ════════════════════════════════════════════════════════════
   Provider 能力标识
   ════════════════════════════════════════════════════════════ */

/**
 * Provider 提供的能力集合
 */
export interface ProviderCapabilities {
  /** 聊天补全（Chat Completion） */
  chat: boolean
  /** 文本补全（Text Completion） */
  completion: boolean
  /** 文本嵌入（Embedding） */
  embedding: boolean
  /** 图像生成 */
  imageGeneration: boolean
  /** 重排序（Reranking） */
  reranking: boolean
  /** 语音转文字（Transcription） */
  transcription: boolean
  /** 文字转语音（Speech） */
  speech: boolean
}

/* ════════════════════════════════════════════════════════════
   Vertex AI 专用配置
   ════════════════════════════════════════════════════════════ */

/**
 * Vertex AI 认证配置
 */
export interface VertexAIConfig {
  /** GCP 项目 ID */
  projectId: string
  /** 部署区域（如 us-central1） */
  region: string
  /** Service Account JSON 内容（字符串） */
  serviceAccountJSON?: string
  /** Service Account JSON 文件路径 */
  serviceAccountPath?: string
  /** 使用 Application Default Credentials */
  useADC?: boolean
}

/* ════════════════════════════════════════════════════════════
   Provider 配置
   ════════════════════════════════════════════════════════════ */

/**
 * Provider 配置（用户级）
 */
export interface ProviderSettings {
  /** Provider 唯一标识（如 openai-compatible, vertex-ai） */
  id: string
  /** 显示名称 */
  name: string
  /** 认证类型 */
  authType: AuthType
  /** 是否启用 */
  enabled?: boolean

  /* ────── 标准 API 配置（API_KEY 认证） ────── */
  /** API 基础 URL */
  baseURL?: string
  /** API Key */
  apiKey?: string
  /** 组织 ID（OpenAI） */
  organization?: string

  /* ────── 模型配置 ────── */
  /** 默认模型 ID（实际使用） */
  modelId?: string
  /** 测试模型 ID（连接测试） */
  testModelId?: string

  /* ────── Vertex AI 专用配置 ────── */
  vertexAI?: VertexAIConfig

  /* ────── 扩展字段 ────── */
  /** 自定义扩展配置 */
  extra?: Record<string, unknown>
}

/* ════════════════════════════════════════════════════════════
   模型信息
   ════════════════════════════════════════════════════════════ */

/**
 * 模型元数据
 */
export interface ModelInfo {
  /** 模型 ID（如 gpt-4, gemini-1.5-pro） */
  id: string
  /** 显示名称 */
  name: string
  /** 所属 Provider ID */
  providerId: string
  /** 能力标签 */
  capabilities: Partial<ProviderCapabilities>
  /** 上下文窗口大小（token） */
  contextWindow?: number
  /** 最大输出 token */
  maxOutputTokens?: number
  /** 输入定价（USD per 1M tokens） */
  inputPricing?: number
  /** 输出定价（USD per 1M tokens） */
  outputPricing?: number
  /** 是否支持函数调用 */
  supportsFunctionCalling?: boolean
  /** 是否支持视觉输入 */
  supportsVision?: boolean
  /** 模型描述 */
  description?: string
}

/* ════════════════════════════════════════════════════════════
   验证结果
   ════════════════════════════════════════════════════════════ */

/**
 * 配置验证结果
 */
export interface ValidationResult {
  /** 是否通过验证 */
  valid: boolean
  /** 错误信息列表 */
  errors?: string[]
  /** 警告信息列表 */
  warnings?: string[]
}

/* ════════════════════════════════════════════════════════════
   Provider 抽象接口
   ════════════════════════════════════════════════════════════ */

/**
 * Provider 扩展接口（核心抽象）
 *
 * @description
 * 所有 Provider 适配器必须实现此接口，确保：
 * 1. 统一的生命周期管理
 * 2. 配置验证与热更新
 * 3. 模型列表动态获取
 * 4. 错误处理标准化
 */
export interface ProviderExtension {
  /** Provider 唯一标识 */
  readonly id: string

  /** 显示名称 */
  readonly name: string

  /** 认证类型 */
  readonly authType: AuthType

  /** 能力集合 */
  readonly capabilities: ProviderCapabilities

  /**
   * 创建语言模型实例
   * @param settings Provider 配置
   * @param modelId 模型 ID
   * @returns AI SDK LanguageModelV1 实例
   */
  createLanguageModel(settings: ProviderSettings, modelId: string): Promise<LanguageModelV1>

  /**
   * 创建嵌入模型实例
   * @param settings Provider 配置
   * @param modelId 模型 ID
   * @returns AI SDK EmbeddingModel 实例
   */
  createEmbeddingModel?(settings: ProviderSettings, modelId: string): Promise<EmbeddingModel<string>>

  /**
   * 获取可用模型列表
   * @param settings Provider 配置
   * @returns 模型信息数组
   */
  listModels(settings: ProviderSettings): Promise<ModelInfo[]>

  /**
   * 验证配置有效性
   * @param settings Provider 配置
   * @returns 验证结果
   */
  validateSettings(settings: ProviderSettings): Promise<ValidationResult>

  /**
   * 获取默认模型 ID
   * @param settings Provider 配置
   * @returns 默认模型 ID
   */
  getDefaultModel(settings: ProviderSettings): string

  /**
   * 生命周期钩子：初始化
   * @param settings Provider 配置
   */
  initialize?(settings: ProviderSettings): Promise<void>

  /**
   * 生命周期钩子：销毁
   */
  dispose?(): Promise<void>
}

/* ════════════════════════════════════════════════════════════
   统一导出
   ════════════════════════════════════════════════════════════ */

export type { LanguageModelV1, EmbeddingModel } from 'ai'
export type EmbeddingModelV1 = EmbeddingModel<string>
