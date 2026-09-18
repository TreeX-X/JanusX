import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const userDataDir = await mkdtemp(join(tmpdir(), 'janusx-llm-bindings-'))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir) },
}))

const { llmConfigStore } = await import('../../../src/main/llm/ConfigStore')
const { AuthType } = await import('@janusx/llm-core')

beforeEach(async () => {
  // 清空 providers：逐个删除（ConfigStore 无 reset，保持跟随默认语义可测）。
  const existing = await llmConfigStore.getAllProviders()
  for (const provider of existing) {
    await llmConfigStore.removeProvider(provider.id)
  }
  for (const consumer of ['janus', 'claude', 'codex', 'opencode', 'pi'] as const) {
    await llmConfigStore.setTerminalBinding(consumer, { providerId: null })
  }
})

describe('LlmConfigStore terminal bindings', () => {
  it('starts with all terminals following the default', async () => {
    const bindings = await llmConfigStore.getTerminalBindings()
    expect(Object.values(bindings).every((b) => b.providerId === null)).toBe(true)
  })

  it('keeps a janus binding independent from the default', async () => {
    await llmConfigStore.saveProviderSettings({
      id: 'openai-1',
      name: 'Relay',
      authType: AuthType.API_KEY,
      baseURL: 'https://relay.example.com/v1',
      apiKey: 'sk-test-1234567890',
      modelId: 'gpt-4o',
      enabled: true,
    })
    await llmConfigStore.saveProviderSettings({
      id: 'anthropic-1',
      name: 'Anthropic',
      authType: AuthType.ANTHROPIC,
      baseURL: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test-1234567890',
      modelId: 'claude-sonnet-4-20250514',
      enabled: true,
    })

    // 第一个保存的成为默认；janus 独立指向第二个，claude 保持跟随。
    await llmConfigStore.setTerminalBinding('janus', { providerId: 'anthropic-1', modelId: 'claude-sonnet-4-20250514' })

    const janus = await llmConfigStore.resolveTerminalProvider('janus')
    expect(janus?.provider.id).toBe('anthropic-1')
    expect(janus?.modelId).toBe('claude-sonnet-4-20250514')

    const claude = await llmConfigStore.resolveTerminalProvider('claude')
    expect(claude?.provider.id).toBe('openai-1')
  })

  it('clears bindings that point at a deleted provider', async () => {
    await llmConfigStore.saveProviderSettings({
      id: 'openai-gone',
      name: 'Gone',
      authType: AuthType.API_KEY,
      baseURL: 'https://relay.example.com/v1',
      apiKey: 'sk-test-1234567890',
      modelId: 'gpt-4o',
      enabled: true,
    })
    await llmConfigStore.setTerminalBinding('codex', { providerId: 'openai-gone' })
    await llmConfigStore.removeProvider('openai-gone')

    const bindings = await llmConfigStore.getTerminalBindings()
    expect(bindings.codex.providerId).toBeNull()
  })

  it('rejects bindings to unknown providers', async () => {
    await expect(llmConfigStore.setTerminalBinding('pi', { providerId: 'missing' })).rejects.toThrow()
  })
})
