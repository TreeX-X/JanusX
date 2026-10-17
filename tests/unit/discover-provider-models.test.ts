import { describe, expect, it, vi } from 'vitest'
import type { ProviderSettings } from '@janusx/llm-core'
import { discoverProviderModels } from '../../src/main/llm/discover-provider-models'

const provider: ProviderSettings = {
  id: 'test', name: 'Test', authType: 'api-key', baseURL: 'https://api.example.com/v1', apiKey: 'private-key', models: [],
}

describe('discoverProviderModels', () => {
  it('requests the provider catalog and keeps distinct model IDs', async () => {
    const request = vi.fn(async () => Response.json({ data: [{ id: 'alpha' }, { id: 'beta' }, { id: 'alpha' }, { name: 'ignored' }] }))
    expect(await discoverProviderModels(provider, request as typeof fetch)).toEqual(['alpha', 'beta'])
    expect(request).toHaveBeenCalledWith(new URL('https://api.example.com/v1/models'), expect.objectContaining({
      headers: { Authorization: 'Bearer private-key' }, redirect: 'error',
    }))
  })

  it('uses Anthropic model listing headers', async () => {
    const request = vi.fn(async () => Response.json({ data: [{ id: 'claude-test' }] }))
    await discoverProviderModels({ ...provider, baseURL: 'https://api.anthropic.com', authType: 'anthropic' }, request as typeof fetch)
    expect(request).toHaveBeenCalledWith(new URL('https://api.anthropic.com/v1/models'), expect.objectContaining({
      headers: { 'x-api-key': 'private-key', 'anthropic-version': '2023-06-01' },
    }))
  })

  it('reports missing credentials and unsupported catalog responses', async () => {
    await expect(discoverProviderModels({ ...provider, apiKey: '' })).rejects.toThrow('API key')
    await expect(discoverProviderModels(provider, vi.fn(async () => Response.json({ models: [] })) as typeof fetch)).rejects.toThrow('model list')
  })
})
