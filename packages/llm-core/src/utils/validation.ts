/**
 * @file 配置校验工具
 * @description 提供通用的配置验证逻辑
 * @module @janusx/llm-core/validation
 */

import type { ProviderSettings, ValidationResult, VertexAIConfig } from '../core/types'
import { AuthType } from '../core/types'

/* ════════════════════════════════════════════════════════════
   通用验证器
   ════════════════════════════════════════════════════════════ */

/**
 * 验证必填字段
 */
export function validateRequired(
  value: unknown,
  fieldName: string
): { valid: boolean; error?: string } {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: `${fieldName} 为必填项` }
  }
  return { valid: true }
}

/**
 * 验证 URL 格式
 */
export function validateURL(
  url: string,
  fieldName: string = 'URL'
): { valid: boolean; error?: string } {
  try {
    new URL(url)
    return { valid: true }
  } catch {
    return { valid: false, error: `${fieldName} 格式不正确` }
  }
}

/**
 * 验证字符串长度
 */
export function validateStringLength(
  value: string,
  min: number,
  max: number,
  fieldName: string
): { valid: boolean; error?: string } {
  if (value.length < min || value.length > max) {
    return {
      valid: false,
      error: `${fieldName} 长度必须在 ${min}-${max} 之间`
    }
  }
  return { valid: true }
}

/* ════════════════════════════════════════════════════════════
   Provider Settings 验证
   ════════════════════════════════════════════════════════════ */

/**
 * 验证基本 Provider 配置
 */
export function validateProviderSettings(settings: ProviderSettings): ValidationResult {
  const errors: string[] = []

  // 验证 ID
  const idCheck = validateRequired(settings.id, 'Provider ID')
  if (!idCheck.valid) {
    errors.push(idCheck.error!)
  }

  // 验证名称
  const nameCheck = validateRequired(settings.name, 'Provider Name')
  if (!nameCheck.valid) {
    errors.push(nameCheck.error!)
  }

  // 验证认证类型
  if (!Object.values(AuthType).includes(settings.authType)) {
    errors.push(`认证类型 "${settings.authType}" 不合法`)
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  }
}

/**
 * 验证 API Key 认证配置
 */
export function validateApiKeySettings(settings: ProviderSettings): ValidationResult {
  const errors: string[] = []

  // 验证 baseURL
  if (settings.baseURL) {
    const urlCheck = validateURL(settings.baseURL, 'Base URL')
    if (!urlCheck.valid) {
      errors.push(urlCheck.error!)
    }
  }

  // 验证 apiKey
  const keyCheck = validateRequired(settings.apiKey, 'API Key')
  if (!keyCheck.valid) {
    errors.push(keyCheck.error!)
  } else if (settings.apiKey && settings.apiKey.length < 10) {
    errors.push('API Key 长度不足，请检查是否完整')
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  }
}

/**
 * 验证 PEM 私钥格式
 */
export function validatePrivateKey(key: string): { valid: boolean; error?: string } {
  if (!key) {
    return { valid: false, error: '私钥为空' }
  }

  // 将字面的 \n 转换为实际换行符以便验证
  const normalized = key.replace(/\\n/g, '\n').trim()

  // 检查 PEM 头部
  if (!normalized.includes('-----BEGIN')) {
    return { valid: false, error: '缺少 PEM 头部标记（-----BEGIN ...-----）' }
  }

  // 检查 PEM 尾部
  if (!normalized.includes('-----END')) {
    return { valid: false, error: '缺少 PEM 尾部标记（-----END ...-----）' }
  }

  // 检查基本结构
  const hasBegin = normalized.includes('-----BEGIN PRIVATE KEY-----') || 
                   normalized.includes('-----BEGIN RSA PRIVATE KEY-----')
  const hasEnd = normalized.includes('-----END PRIVATE KEY-----') || 
                 normalized.includes('-----END RSA PRIVATE KEY-----')

  if (!hasBegin || !hasEnd) {
    return { valid: false, error: 'PEM 标记格式不正确' }
  }

  return { valid: true }
}

/**
 * 验证 Vertex AI 配置
 */
export function validateVertexAISettings(config: VertexAIConfig): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 验证 Project ID
  const projectIdCheck = validateRequired(config.projectId, 'GCP Project ID')
  if (!projectIdCheck.valid) {
    errors.push(projectIdCheck.error!)
  }

  // 验证 Region
  const regionCheck = validateRequired(config.region, 'Region')
  if (!regionCheck.valid) {
    errors.push(regionCheck.error!)
  }

  // 验证认证方式
  const hasADC = config.useADC === true
  const hasIndividual = !!(config.clientEmail && config.privateKey)
  const hasJSON = !!(config.serviceAccountJSON || config.serviceAccountPath)

  if (!hasADC && !hasIndividual && !hasJSON) {
    errors.push('必须选择至少一种认证方式：Client Email + Private Key、ADC 或 Service Account JSON')
  }

  // Service Account JSON 格式验证
  if (config.serviceAccountJSON) {
    try {
      const parsed = JSON.parse(config.serviceAccountJSON)
      if (!parsed.client_email || !parsed.private_key) {
        errors.push('Service Account JSON 缺少必要字段（client_email, private_key）')
      } else {
        // 验证 JSON 中的私钥格式
        const keyCheck = validatePrivateKey(parsed.private_key)
        if (!keyCheck.valid) {
          errors.push(`Service Account JSON 中的私钥格式错误: ${keyCheck.error}`)
        }
      }
    } catch {
      errors.push('Service Account JSON 格式不正确')
    }
  }

  // 单独提供的私钥格式验证
  if (config.privateKey) {
    const keyCheck = validatePrivateKey(config.privateKey)
    if (!keyCheck.valid) {
      errors.push(`私钥格式错误: ${keyCheck.error}`)
    }
  }

  // ADC 提示
  if (hasADC && !hasJSON) {
    warnings.push('使用 ADC 认证，请确保已执行 gcloud auth application-default login')
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

/* ════════════════════════════════════════════════════════════
   综合验证入口
   ════════════════════════════════════════════════════════════ */

/**
 * 验证完整的 Provider Settings
 * @param settings Provider 配置
 * @returns 验证结果
 */
export function validateSettings(settings: ProviderSettings): ValidationResult {
  // 基础验证
  const baseResult = validateProviderSettings(settings)
  if (!baseResult.valid) {
    return baseResult
  }

  // 根据认证类型分发验证
  switch (settings.authType) {
    case AuthType.API_KEY:
      return validateApiKeySettings(settings)

    case AuthType.VERTEX_AI:
      if (!settings.vertexAI) {
        return {
          valid: false,
          errors: ['认证类型为 vertex-ai 但缺少 vertexAI 配置']
        }
      }
      return validateVertexAISettings(settings.vertexAI)

    case AuthType.NONE:
      return { valid: true }

    default:
      return {
        valid: false,
        errors: [`暂不支持的认证类型: ${settings.authType}`]
      }
  }
}
