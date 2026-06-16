/**
 * @file Validation 工具函数测试
 * @description 测试配置验证逻辑
 */

import { describe, it, expect } from 'vitest'
import {
  validateRequired,
  validateURL,
  validateStringLength,
  validateApiKeySettings,
  validateVertexAISettings,
  validateSettings
} from '../src/utils/validation'
import type { ProviderSettings, VertexAIConfig } from '../src/core/types'
import { AuthType } from '../src/core/types'

describe('Validation Utils', () => {
  describe('validateRequired()', () => {
    it('应该通过有效值', () => {
      const result = validateRequired('valid-value', 'testField')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('应该拒绝 undefined', () => {
      const result = validateRequired(undefined, 'testField')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('必填项')
    })

    it('应该拒绝空字符串', () => {
      const result = validateRequired('', 'testField')
      expect(result.valid).toBe(false)
    })

    it('应该拒绝 null', () => {
      const result = validateRequired(null, 'testField')
      expect(result.valid).toBe(false)
    })
  })

  describe('validateURL()', () => {
    it('应该通过有效 URL', () => {
      const validURLs = [
        'https://api.openai.com/v1',
        'http://localhost:8080',
        'https://example.com:443/path'
      ]

      validURLs.forEach(url => {
        const result = validateURL(url)
        expect(result.valid).toBe(true)
      })
    })

    it('应该拒绝无效 URL', () => {
      const invalidURLs = ['not-a-url', 'just-text', '', '://invalid']

      invalidURLs.forEach(url => {
        const result = validateURL(url)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      })
    })
  })

  describe('validateStringLength()', () => {
    it('应该通过符合长度要求的字符串', () => {
      const result = validateStringLength('hello', 3, 10, 'testField')
      expect(result.valid).toBe(true)
    })

    it('应该拒绝过短的字符串', () => {
      const result = validateStringLength('ab', 5, 10, 'testField')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('长度必须在')
    })

    it('应该拒绝过长的字符串', () => {
      const result = validateStringLength('too-long-string', 3, 5, 'testField')
      expect(result.valid).toBe(false)
    })
  })

  describe('validateApiKeySettings()', () => {
    it('应该通过有效的 API Key 配置', () => {
      const settings: ProviderSettings = {
        id: 'openai',
        name: 'OpenAI',
        authType: AuthType.API_KEY,
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-1234567890abcdef'
      }

      const result = validateApiKeySettings(settings)
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('应该拒绝缺少 apiKey 的配置', () => {
      const settings: ProviderSettings = {
        id: 'openai',
        name: 'OpenAI',
        authType: AuthType.API_KEY,
        baseURL: 'https://api.openai.com/v1'
      }

      const result = validateApiKeySettings(settings)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('API Key 为必填项')
    })

    it('应该拒绝无效的 baseURL', () => {
      const settings: ProviderSettings = {
        id: 'openai',
        name: 'OpenAI',
        authType: AuthType.API_KEY,
        baseURL: 'invalid-url',
        apiKey: 'sk-1234567890abcdef'
      }

      const result = validateApiKeySettings(settings)
      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('格式不正确')
    })

    it('应该拒绝过短的 apiKey', () => {
      const settings: ProviderSettings = {
        id: 'openai',
        name: 'OpenAI',
        authType: AuthType.API_KEY,
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'short'
      }

      const result = validateApiKeySettings(settings)
      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('长度不足')
    })
  })

  describe('validateVertexAISettings()', () => {
    it('应该通过有效的 ADC 配置', () => {
      const config: VertexAIConfig = {
        projectId: 'my-gcp-project',
        region: 'us-central1',
        useADC: true
      }

      const result = validateVertexAISettings(config)
      expect(result.valid).toBe(true)
      expect(result.warnings).toBeDefined() // 应该有 ADC 使用提示
    })

    it('应该通过有效的 JSON Key 配置', () => {
      const config: VertexAIConfig = {
        projectId: 'my-gcp-project',
        region: 'us-central1',
        serviceAccountJSON: JSON.stringify({
          type: 'service_account',
          client_email: 'test@project.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n'
        })
      }

      const result = validateVertexAISettings(config)
      expect(result.valid).toBe(true)
    })

    it('应该拒绝缺少 projectId 的配置', () => {
      const config: VertexAIConfig = {
        projectId: '',
        region: 'us-central1',
        useADC: true
      }

      const result = validateVertexAISettings(config)
      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('Project ID')
    })

    it('应该拒绝缺少认证方式的配置', () => {
      const config: VertexAIConfig = {
        projectId: 'my-project',
        region: 'us-central1'
      }

      const result = validateVertexAISettings(config)
      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('认证方式')
    })

    it('应该拒绝无效的 Service Account JSON', () => {
      const config: VertexAIConfig = {
        projectId: 'my-project',
        region: 'us-central1',
        serviceAccountJSON: '{"invalid": "json"}'
      }

      const result = validateVertexAISettings(config)
      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('缺少必要字段')
    })

    it('应该拒绝格式错误的 JSON', () => {
      const config: VertexAIConfig = {
        projectId: 'my-project',
        region: 'us-central1',
        serviceAccountJSON: 'not-a-json'
      }

      const result = validateVertexAISettings(config)
      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('格式不正确')
    })
  })

  describe('validateSettings()', () => {
    it('应该路由到正确的验证函数（API Key）', () => {
      const settings: ProviderSettings = {
        id: 'openai',
        name: 'OpenAI',
        authType: AuthType.API_KEY,
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-1234567890abcdef'
      }

      const result = validateSettings(settings)
      expect(result.valid).toBe(true)
    })

    it('应该路由到正确的验证函数（Vertex AI）', () => {
      const settings: ProviderSettings = {
        id: 'vertex-ai',
        name: 'Vertex AI',
        authType: AuthType.VERTEX_AI,
        vertexAI: {
          projectId: 'my-project',
          region: 'us-central1',
          useADC: true
        }
      }

      const result = validateSettings(settings)
      expect(result.valid).toBe(true)
    })

    it('应该拒绝 Vertex AI 类型但缺少 vertexAI 配置', () => {
      const settings: ProviderSettings = {
        id: 'vertex-ai',
        name: 'Vertex AI',
        authType: AuthType.VERTEX_AI
      }

      const result = validateSettings(settings)
      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('缺少 vertexAI 配置')
    })

    it('应该通过 NONE 认证类型', () => {
      const settings: ProviderSettings = {
        id: 'local',
        name: 'Local Model',
        authType: AuthType.NONE
      }

      const result = validateSettings(settings)
      expect(result.valid).toBe(true)
    })
  })
})
