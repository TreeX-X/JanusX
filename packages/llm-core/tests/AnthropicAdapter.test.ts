/**
 * @file AnthropicAdapter 单元测试
 * @description 测试 Anthropic 原生适配器的核心行为（不触网）
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AnthropicAdapter } from '../src/adapters/anthropic'
import type { ProviderSettings } from '../src/core/types'
import { AuthType } from '../src/core/types'
import { validateAnthropicSettings, validateSettings } from '../src/utils/validation'

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter
  let mockSettings: ProviderSettings

  beforeEach(() => {
    adapter = new AnthropicAdapter()
    mockSettings = {
      id: 'anthropic-1',
      name: 'Test Anthropic',
      authType: AuthType.ANTHROPIC,
      baseURL: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test1234567890',
      modelId: 'claude-sonnet-4-20250514',
    }
  })

  it('exposes the anthropic identity', () => {
    expect(adapter.id).toBe('anthropic')
    expect(adapter.authType).toBe(AuthType.ANTHROPIC)
    expect(adapter.capabilities.chat).toBe(true)
  })

  it('validates a well-formed config', async () => {
    await expect(adapter.validateSettings(mockSettings)).resolves.toMatchObject({ valid: true })
    expect(validateAnthropicSettings(mockSettings).valid).toBe(true)
    expect(validateSettings(mockSettings).valid).toBe(true)
  })

  it('rejects a missing api key', async () => {
    const result = await adapter.validateSettings({ ...mockSettings, apiKey: undefined })
    expect(result.valid).toBe(false)
  })

  it('prefers the configured model as default', () => {
    expect(adapter.getDefaultModel(mockSettings)).toBe('claude-sonnet-4-20250514')
    expect(adapter.getDefaultModel({ ...mockSettings, modelId: undefined, defaultModelId: undefined, models: [] })).toBe(
      'claude-sonnet-4-20250514',
    )
  })

  it('lists configured models when present', async () => {
    const models = await adapter.listModels({ ...mockSettings, models: ['custom-claude'] })
    expect(models.map((m) => m.id)).toContain('custom-claude')
  })
})
