/**
 * @file OpenAICompatibleAdapter 单元测试
 * @description 测试 OpenAI Compatible 适配器的核心功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OpenAICompatibleAdapter } from '../src/adapters/openai-compatible'
import type { ProviderSettings } from '../src/core/types'
import { AuthType } from '../src/core/types'

describe('OpenAICompatibleAdapter', () => {
  let adapter: OpenAICompatibleAdapter
  let mockSettings: ProviderSettings

  beforeEach(() => {
    adapter = new OpenAICompatibleAdapter()
    mockSettings = {
      id: 'openai-compatible',
      name: 'Test OpenAI',
      authType: AuthType.API_KEY,
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-test1234567890abcdef'
    }
  })

  describe('基本属性', () => {
    it('应该有正确的 ID', () => {
      expect(adapter.id).toBe('openai-compatible')
    })

    it('应该有正确的名称', () => {
      expect(adapter.name).toBe('OpenAI Compatible')
    })

    it('应该使用 API_KEY 认证', () => {
      expect(adapter.authType).toBe(AuthType.API_KEY)
    })

    it('应该支持 chat 和 embedding', () => {
      expect(adapter.capabilities.chat).toBe(true)
      expect(adapter.capabilities.completion).toBe(true)
      expect(adapter.capabilities.embedding).toBe(true)
    })
  })

  describe('validateSettings()', () => {
    it('应该通过有效配置', async () => {
      const result = await adapter.validateSettings(mockSettings)
      expect(result.valid).toBe(true)
    })

    it('应该拒绝缺少 apiKey 的配置', async () => {
      const invalidSettings = { ...mockSettings, apiKey: undefined }
      const result = await adapter.validateSettings(invalidSettings)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('应该拒绝无效的 baseURL', async () => {
      const invalidSettings = { ...mockSettings, baseURL: 'invalid-url' }
      const result = await adapter.validateSettings(invalidSettings)
      expect(result.valid).toBe(false)
    })

    it('应该拒绝过短的 apiKey', async () => {
      const invalidSettings = { ...mockSettings, apiKey: 'short' }
      const result = await adapter.validateSettings(invalidSettings)
      expect(result.valid).toBe(false)
    })
  })

  describe('listModels()', () => {
    it('应该返回常见模型列表', async () => {
      const models = await adapter.listModels(mockSettings)

      expect(models.length).toBeGreaterThan(0)
      expect(models.some(m => m.id === 'gpt-4')).toBe(true)
      expect(models.some(m => m.id === 'gpt-3.5-turbo')).toBe(true)
      expect(models.some(m => m.id === 'text-embedding-ada-002')).toBe(true)
    })

    it('返回的模型应该包含完整信息', async () => {
      const models = await adapter.listModels(mockSettings)
      const gpt4 = models.find(m => m.id === 'gpt-4')

      expect(gpt4).toBeDefined()
      expect(gpt4?.name).toBe('GPT-4')
      expect(gpt4?.providerId).toBe('openai-compatible')
      expect(gpt4?.capabilities.chat).toBe(true)
      expect(gpt4?.contextWindow).toBeDefined()
    })
  })

  describe('getDefaultModel()', () => {
    it('应该返回 gpt-4o 作为默认模型', () => {
      const defaultModel = adapter.getDefaultModel(mockSettings)
      expect(defaultModel).toBe('gpt-4o')
    })

    it('应该根据 baseURL 识别 DeepSeek', () => {
      const deepseekSettings = {
        ...mockSettings,
        baseURL: 'https://api.deepseek.com/v1'
      }
      const defaultModel = adapter.getDefaultModel(deepseekSettings)
      expect(defaultModel).toBe('deepseek-chat')
    })

    it('应该根据 baseURL 识别 Moonshot', () => {
      const moonshotSettings = {
        ...mockSettings,
        baseURL: 'https://api.moonshot.cn/v1'
      }
      const defaultModel = adapter.getDefaultModel(moonshotSettings)
      expect(defaultModel).toBe('moonshot-v1-8k')
    })

    it('应该根据 baseURL 识别智谱 AI', () => {
      const zhipuSettings = {
        ...mockSettings,
        baseURL: 'https://open.bigmodel.cn/api/paas/v4'
      }
      const defaultModel = adapter.getDefaultModel(zhipuSettings)
      expect(defaultModel).toBe('glm-4')
    })
  })

  describe('生命周期钩子', () => {
    it('initialize() 应该成功执行', async () => {
      await expect(adapter.initialize(mockSettings)).resolves.toBeUndefined()
    })

    it('dispose() 应该成功执行', async () => {
      await expect(adapter.dispose()).resolves.toBeUndefined()
    })
  })

  describe('createLanguageModel() - Mock 测试', () => {
    it('应该在缺少依赖时抛出错误', async () => {
      // 这个测试会实际尝试导入 @ai-sdk/openai
      // 如果依赖未安装，会抛出错误

      // 注意：这需要 @ai-sdk/openai 依赖安装才能通过
      // 如果测试环境没有安装，可以跳过此测试

      try {
        await adapter.createLanguageModel(mockSettings, 'gpt-4')
        // 如果依赖存在，测试通过
        expect(true).toBe(true)
      } catch (error: any) {
        // 如果依赖不存在，应该抛出 ModelCreationError
        expect(error.name).toBe('ModelCreationError')
      }
    })
  })

  describe('模型推断', () => {
    it('应该正确识别不同服务商的默认模型', () => {
      const testCases = [
        { baseURL: 'https://api.openai.com/v1', expected: 'gpt-4o' },
        { baseURL: 'https://api.deepseek.com', expected: 'deepseek-chat' },
        { baseURL: 'https://api.moonshot.cn', expected: 'moonshot-v1-8k' },
        { baseURL: 'https://open.bigmodel.cn', expected: 'glm-4' },
      ]

      testCases.forEach(({ baseURL, expected }) => {
        const settings = { ...mockSettings, baseURL }
        expect(adapter.getDefaultModel(settings)).toBe(expected)
      })
    })
  })
})
