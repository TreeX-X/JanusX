import { describe, expect, it, vi } from 'vitest'
const config = vi.hoisted(() => ({
  provider: { id: 'relay', name: 'Relay', authType: 'api-key', baseURL: 'https://api.example/v1', modelId: 'agent-choice', defaultModelId: 'agent-choice', enabled: true },
}))
vi.mock('electron', () => ({
  app: { setProxy: vi.fn() }, session: { defaultSession: { setProxy: vi.fn() }, fromPartition: () => ({ setProxy: vi.fn() }) },
}))
vi.mock('@janusx/llm-core', () => ({
  AuthType: { API_KEY: 'api-key', ANTHROPIC: 'anthropic', VERTEX_AI: 'vertex-ai', NONE: 'none' },
  ProviderFactory: { getInstance: () => ({ clearCache: vi.fn() }) },
  ExtensionRegistry: { getInstance: () => ({ has: () => true, get: () => ({ getDefaultModel: () => 'adapter-default' }) }) },
  OpenAICompatibleAdapter: class {}, AnthropicAdapter: class {}, VertexAIAdapter: class {},
  validateSettings: () => ({ valid: true }), getProxyManager: () => ({ autoDetect: () => {}, getProxyUrl: () => null }),
}))
vi.mock('../../../src/main/llm/ConfigStore', () => ({
  llmConfigStore: { getTerminalDefaultSettings: async () => config.provider },
}))
const { llmService } = await import('../../../src/main/llm/LlmService')
describe('effective Janus model', () => {
  it('uses the selected model for chat and background features instead of an adapter default', async () => {
    expect(await llmService.getDefaultModel()).toMatchObject({ modelId: 'agent-choice' })
  })
  it('does not report a disabled channel as the active runtime default', async () => {
    config.provider.enabled = false
    expect(await llmService.getDefaultModel()).toBeNull()
  })
})
