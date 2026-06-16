/**
 * @file ExtensionRegistry 单元测试
 * @description 测试 Provider 注册表的核心功能
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ExtensionRegistry } from '../src/core/ExtensionRegistry'
import { ProviderNotFoundError, ProviderAlreadyExistsError } from '../src/utils/errors'
import type { ProviderExtension, ProviderSettings, ValidationResult, ModelInfo } from '../src/core/types'
import { AuthType } from '../src/core/types'

/* ════════════════════════════════════════════════════════════
   Mock Provider 实现
   ════════════════════════════════════════════════════════════ */

class MockProvider implements ProviderExtension {
  constructor(
    public readonly id: string,
    public readonly name: string = 'Mock Provider'
  ) {}

  readonly authType = AuthType.API_KEY
  readonly capabilities = {
    chat: true,
    completion: true,
    embedding: false,
    imageGeneration: false,
    reranking: false,
    transcription: false,
    speech: false
  }

  async createLanguageModel(): Promise<any> {
    return {} as any
  }

  async listModels(): Promise<ModelInfo[]> {
    return []
  }

  async validateSettings(): Promise<ValidationResult> {
    return { valid: true }
  }

  getDefaultModel(): string {
    return 'mock-model'
  }
}

/* ════════════════════════════════════════════════════════════
   测试套件
   ════════════════════════════════════════════════════════════ */

describe('ExtensionRegistry', () => {
  let registry: ExtensionRegistry

  beforeEach(() => {
    // 每次测试前清空注册表
    registry = ExtensionRegistry.getInstance()
    registry.clear()
  })

  describe('register()', () => {
    it('应该成功注册 Provider', () => {
      const provider = new MockProvider('test-provider')
      registry.register(provider)

      expect(registry.has('test-provider')).toBe(true)
      expect(registry.size).toBe(1)
    })

    it('应该拒绝重复注册相同 ID', () => {
      const provider1 = new MockProvider('duplicate')
      const provider2 = new MockProvider('duplicate')

      registry.register(provider1)

      expect(() => registry.register(provider2)).toThrow(ProviderAlreadyExistsError)
    })
  })

  describe('unregister()', () => {
    it('应该成功注销已注册的 Provider', () => {
      const provider = new MockProvider('test-provider')
      registry.register(provider)

      const result = registry.unregister('test-provider')

      expect(result).toBe(true)
      expect(registry.has('test-provider')).toBe(false)
      expect(registry.size).toBe(0)
    })

    it('注销不存在的 Provider 应返回 false', () => {
      const result = registry.unregister('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('get()', () => {
    it('应该返回已注册的 Provider', () => {
      const provider = new MockProvider('test-provider')
      registry.register(provider)

      const retrieved = registry.get('test-provider')

      expect(retrieved).toBe(provider)
      expect(retrieved.id).toBe('test-provider')
    })

    it('获取不存在的 Provider 应抛出异常', () => {
      expect(() => registry.get('non-existent')).toThrow(ProviderNotFoundError)
    })
  })

  describe('tryGet()', () => {
    it('应该返回已注册的 Provider', () => {
      const provider = new MockProvider('test-provider')
      registry.register(provider)

      const retrieved = registry.tryGet('test-provider')
      expect(retrieved).toBe(provider)
    })

    it('获取不存在的 Provider 应返回 undefined', () => {
      const retrieved = registry.tryGet('non-existent')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('getAll()', () => {
    it('应该返回所有已注册的 Provider', () => {
      const provider1 = new MockProvider('provider-1')
      const provider2 = new MockProvider('provider-2')

      registry.register(provider1)
      registry.register(provider2)

      const all = registry.getAll()

      expect(all).toHaveLength(2)
      expect(all).toContain(provider1)
      expect(all).toContain(provider2)
    })

    it('空注册表应返回空数组', () => {
      const all = registry.getAll()
      expect(all).toEqual([])
    })
  })

  describe('filterByAuthType()', () => {
    it('应该按认证类型筛选 Provider', () => {
      class OAuth2Provider extends MockProvider {
        readonly authType = AuthType.OAUTH
      }

      const apiKeyProvider = new MockProvider('api-key-provider')
      const oauthProvider = new OAuth2Provider('oauth-provider')

      registry.register(apiKeyProvider)
      registry.register(oauthProvider)

      const filtered = registry.filterByAuthType(AuthType.OAUTH)

      expect(filtered).toHaveLength(1)
      expect(filtered[0]?.id).toBe('oauth-provider')
    })
  })

  describe('filterByCapability()', () => {
    it('应该按能力筛选 Provider', () => {
      class EmbeddingProvider extends MockProvider {
        readonly capabilities = {
          ...super.capabilities,
          embedding: true
        }
      }

      const chatProvider = new MockProvider('chat-only')
      const embeddingProvider = new EmbeddingProvider('embedding-provider')

      registry.register(chatProvider)
      registry.register(embeddingProvider)

      const filtered = registry.filterByCapability('embedding')

      expect(filtered).toHaveLength(1)
      expect(filtered[0]?.id).toBe('embedding-provider')
    })
  })

  describe('clear()', () => {
    it('应该清空所有注册', () => {
      registry.register(new MockProvider('provider-1'))
      registry.register(new MockProvider('provider-2'))

      registry.clear()

      expect(registry.size).toBe(0)
      expect(registry.getAll()).toEqual([])
    })
  })

  describe('singleton pattern', () => {
    it('应该返回同一个实例', () => {
      const instance1 = ExtensionRegistry.getInstance()
      const instance2 = ExtensionRegistry.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
