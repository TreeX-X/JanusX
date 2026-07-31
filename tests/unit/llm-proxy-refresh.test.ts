import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  detectedProxy: null as string | null,
  activeProxy: null as string | null,
  clearCache: vi.fn(),
  createLanguageModel: vi.fn(async () => ({ model: true })),
  register: vi.fn(),
  setAppProxy: vi.fn(async () => undefined),
  setDefaultSessionProxy: vi.fn(async () => undefined),
  setWebviewSessionProxy: vi.fn(async () => undefined),
}))

vi.mock('@janusx/llm-core', () => ({
  AuthType: { API_KEY: 'api-key', VERTEX_AI: 'vertex-ai', NONE: 'none' },
  ExtensionRegistry: {
    getInstance: () => ({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      has: vi.fn(() => true),
      register: mocks.register,
    }),
  },
  OpenAICompatibleAdapter: class {},
  ProviderFactory: {
    getInstance: () => ({
      clearCache: mocks.clearCache,
      createLanguageModel: mocks.createLanguageModel,
    }),
  },
  VertexAIAdapter: class {},
  getProxyManager: () => ({
    autoDetect: () => { mocks.activeProxy = mocks.detectedProxy },
    getProxyUrl: () => mocks.activeProxy,
  }),
  validateSettings: () => ({ valid: true }),
}))

vi.mock('electron', () => ({
  app: { setProxy: mocks.setAppProxy },
  session: {
    defaultSession: { setProxy: mocks.setDefaultSessionProxy },
    fromPartition: () => ({ setProxy: mocks.setWebviewSessionProxy }),
  },
}))

vi.mock('../../src/main/llm/ConfigStore', () => ({
  llmConfigStore: {
    getProviderSettings: vi.fn(async () => ({
      id: 'vertex', name: 'Vertex', authType: 'vertex-ai', vertexAI: {},
    })),
  },
}))

describe('LLM proxy refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.detectedProxy = null
    mocks.activeProxy = null
  })

  it('rebuilds cached models when a proxy appears after initialization', async () => {
    vi.resetModules()
    const { llmService } = await import('../../src/main/llm/LlmService')

    await llmService.getLanguageModel('vertex', 'gemini-test')
    expect(mocks.clearCache).not.toHaveBeenCalled()

    mocks.detectedProxy = 'http://127.0.0.1:7897'
    await llmService.getLanguageModel('vertex', 'gemini-test')

    const fixedProxy = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:7897' }
    expect(mocks.setAppProxy).toHaveBeenCalledWith(fixedProxy)
    expect(mocks.setDefaultSessionProxy).toHaveBeenCalledWith(fixedProxy)
    expect(mocks.clearCache).toHaveBeenCalledOnce()

    await llmService.getLanguageModel('vertex', 'gemini-test')
    expect(mocks.clearCache).toHaveBeenCalledOnce()
  })

  it('clears the active proxy when system proxying is disabled', async () => {
    mocks.detectedProxy = 'http://127.0.0.1:7897'
    vi.resetModules()
    const { llmService } = await import('../../src/main/llm/LlmService')
    await llmService.getLanguageModel('vertex', 'gemini-test')
    mocks.clearCache.mockClear()

    mocks.detectedProxy = null
    await llmService.getLanguageModel('vertex', 'gemini-test')

    expect(mocks.setAppProxy).toHaveBeenLastCalledWith({ mode: 'direct' })
    expect(mocks.clearCache).toHaveBeenCalledOnce()
  })
})
