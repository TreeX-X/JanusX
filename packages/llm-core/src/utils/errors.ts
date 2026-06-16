/**
 * @file 统一错误处理
 * @description 定义 LLM Core 层的标准错误类型
 * @module @janusx/llm-core/errors
 */

/* ════════════════════════════════════════════════════════════
   基础错误类
   ════════════════════════════════════════════════════════════ */

/**
 * LLM Core 基础错误
 */
export class LlmCoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'LlmCoreError'
    Error.captureStackTrace(this, this.constructor)
  }
}

/* ════════════════════════════════════════════════════════════
   具体错误类型
   ════════════════════════════════════════════════════════════ */

/**
 * Provider 未注册错误
 */
export class ProviderNotFoundError extends LlmCoreError {
  constructor(providerId: string) {
    super(
      `Provider "${providerId}" 未注册，请先调用 registry.register()`,
      'PROVIDER_NOT_FOUND',
      { providerId }
    )
    this.name = 'ProviderNotFoundError'
  }
}

/**
 * Provider 已存在错误
 */
export class ProviderAlreadyExistsError extends LlmCoreError {
  constructor(providerId: string) {
    super(
      `Provider "${providerId}" 已注册，不可重复注册`,
      'PROVIDER_ALREADY_EXISTS',
      { providerId }
    )
    this.name = 'ProviderAlreadyExistsError'
  }
}

/**
 * 配置验证错误
 */
export class ValidationError extends LlmCoreError {
  constructor(errors: string[], settings: Record<string, unknown>) {
    super(
      `配置验证失败：${errors.join(', ')}`,
      'VALIDATION_ERROR',
      { errors, settings }
    )
    this.name = 'ValidationError'
  }
}

/**
 * 模型创建错误
 */
export class ModelCreationError extends LlmCoreError {
  constructor(providerId: string, modelId: string, cause: Error) {
    super(
      `创建模型失败 [${providerId}/${modelId}]: ${cause.message}`,
      'MODEL_CREATION_ERROR',
      { providerId, modelId, cause }
    )
    this.name = 'ModelCreationError'
  }
}

/**
 * 配置加载错误
 */
export class ConfigLoadError extends LlmCoreError {
  constructor(path: string, cause: Error) {
    super(
      `加载配置文件失败 [${path}]: ${cause.message}`,
      'CONFIG_LOAD_ERROR',
      { path, cause }
    )
    this.name = 'ConfigLoadError'
  }
}

/* ════════════════════════════════════════════════════════════
   错误工厂函数
   ════════════════════════════════════════════════════════════ */

/**
 * 包装第三方错误为 LlmCoreError
 */
export function wrapError(error: unknown, code: string, context?: Record<string, unknown>): LlmCoreError {
  if (error instanceof LlmCoreError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  return new LlmCoreError(message, code, {
    ...context,
    originalError: error
  })
}

/**
 * 检查错误是否为特定类型
 */
export function isLlmCoreError(error: unknown, code?: string): error is LlmCoreError {
  if (!(error instanceof LlmCoreError)) {
    return false
  }
  return code ? error.code === code : true
}
