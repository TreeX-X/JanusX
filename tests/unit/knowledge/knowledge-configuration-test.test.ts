import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultKnowledgeAutomation, type KnowledgeConfigurationTestRequest } from '../../../src/shared/knowledge-automation'
import { testKnowledgeConfiguration } from '../../../src/main/knowledge/knowledge-configuration-test'

const mocks = vi.hoisted(() => ({ settings: vi.fn(), features: vi.fn(), key: vi.fn(), provider: vi.fn(), model: vi.fn(), generate: vi.fn(), local: vi.fn() }))
vi.mock('../../../src/main/config/service', () => ({ configService: { getKnowledgeSettings: mocks.settings, getExperimentalFeatures: mocks.features } }))
vi.mock('../../../src/main/knowledge/knowledge-credentials', () => ({ getJevKey: mocks.key }))
vi.mock('../../../src/main/llm/LlmService', () => ({ llmService: { getProviderSettings: mocks.provider, getLanguageModel: mocks.model } }))
vi.mock('../../../src/main/llm/ai-runtime', () => ({ generateText: mocks.generate }))
vi.mock('../../../src/main/knowledge/knowledge-local-runtime', () => ({ withKnowledgeLocalModel: mocks.local, stopKnowledgeLocalModel: vi.fn() }))

const request = (provider: KnowledgeConfigurationTestRequest['model']['provider'] = 'jev'): KnowledgeConfigurationTestRequest => ({
  stage: 'entryReview', model: { provider, providerId: provider === 'external' ? 'chosen' : '', model: 'review-model', thinking: false },
  jevEndpoint: 'https://example.com/review',
})
const review = { verdict: 'supported', reason: 'Supported', complete: true, conflict: false, coveredIds: ['sample'] }
const external = { id: 'chosen', name: 'Chosen', authType: 'api-key', enabled: true, apiKey: 'test-external-key', baseURL: 'https://example.com/v1' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.features.mockResolvedValue({ knowledge: true })
  mocks.settings.mockResolvedValue({ automation: defaultKnowledgeAutomation() })
  mocks.key.mockResolvedValue('stored-test-key')
  mocks.provider.mockResolvedValue(external)
  mocks.model.mockResolvedValue('selected-language-model')
  mocks.generate.mockResolvedValue({ finishReason: 'stop', text: JSON.stringify(review) })
  mocks.local.mockImplementation(async (_settings, _model, signal, run) => run(32768, signal))
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body)
    return new Response(JSON.stringify({ model: body.model, answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, { type: 'noul', noul: 0.99 }])) }))
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('skips rules and manual processing without fetching credentials or calling providers', async () => {
  const input = request('off')
  expect(await testKnowledgeConfiguration(input)).toEqual({ status: 'skipped', reason: 'manual' })
  input.stage = 'extraction'
  expect(await testKnowledgeConfiguration(input)).toEqual({ status: 'skipped', reason: 'rules-only' })
  expect(mocks.key).not.toHaveBeenCalled()
  expect(mocks.provider).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('reports missing Jev fields and unsupported generation without making requests', async () => {
  const input = request()
  expect(await testKnowledgeConfiguration({ ...input, model: { ...input.model, model: '  ' } })).toMatchObject({ status: 'incomplete', reason: 'model-missing' })
  expect(await testKnowledgeConfiguration({ ...input, jevEndpoint: '' })).toMatchObject({ status: 'incomplete', reason: 'endpoint-missing' })
  expect(await testKnowledgeConfiguration({ ...input, jevEndpoint: 'http://example.com/review' })).toMatchObject({ status: 'incomplete', reason: 'endpoint-invalid' })
  expect(await testKnowledgeConfiguration({ ...input, jevKey: ' ' })).toMatchObject({ status: 'incomplete', reason: 'key-missing' })
  expect(mocks.key).not.toHaveBeenCalled()
  mocks.key.mockResolvedValue(null)
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'incomplete', reason: 'key-missing' })
  expect(await testKnowledgeConfiguration({ ...input, stage: 'wikiGeneration' })).toMatchObject({ status: 'incomplete', reason: 'provider-unsupported' })
  expect(fetch).not.toHaveBeenCalled()
})

it('uses the unsaved Jev endpoint, model and key with synthetic evidence, without reading the saved credential', async () => {
  const input = { ...request(), jevEndpoint: 'https://draft.example.com/review', jevKey: ' unsaved-test-key ' }
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'passed', durationMs: expect.any(Number) })
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(String(url)).toBe(input.jevEndpoint)
  expect(options!.headers).toMatchObject({ Authorization: 'Bearer unsaved-test-key' })
  const body = JSON.parse(String(options!.body))
  expect(body.model).toBe('review-model')
  expect(Object.keys(body.questions)).toEqual(['support', 'consistent', 'coverage_0'])
  expect(JSON.parse(body.state)).toEqual({ candidate: 'The sample project runs a backup every night.',
    sources: [{ id: 'sample', content: 'The sample project runs a backup every night.' }], currentKnowledge: [] })
  expect(mocks.key).not.toHaveBeenCalled()
  expect(mocks.settings).not.toHaveBeenCalled()
  expect(mocks.generate).not.toHaveBeenCalled()
})

it('reads a saved Jev credential only in the host and does not return it', async () => {
  const result = await testKnowledgeConfiguration(request())
  expect(result.status).toBe('passed')
  expect(mocks.key).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(result)).not.toContain('stored-test-key')
})

it.each([[401, 'auth-failed'], [403, 'auth-failed'], [404, 'model-or-endpoint-not-found'], [429, 'rate-limited'], [500, 'unavailable']])(
  'reports HTTP %s without exposing the response body', async (status, reason) => {
    vi.mocked(fetch).mockResolvedValue(new Response('private-provider-detail stored-test-key', { status: Number(status) }))
    expect(await testKnowledgeConfiguration(request())).toMatchObject({ status: 'failed', reason })
  })

it('rejects malformed Jev responses and incomplete answer coverage', async () => {
  for (const body of ['not-json', JSON.stringify({ model: 'review-model', answers: {} }), JSON.stringify({ model: 'wrong-model', answers: { support: { type: 'text', text: 'yes' } } })]) {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body))
    expect(await testKnowledgeConfiguration(request())).toMatchObject({ status: 'failed', reason: 'invalid-response' })
  }
})

it('checks external provider selection, required credentials and non-key authentication configuration', async () => {
  const input = request('external')
  expect(await testKnowledgeConfiguration({ ...input, model: { ...input.model, providerId: '' } })).toMatchObject({ status: 'incomplete', reason: 'provider-missing' })
  for (const provider of [null, { ...external, enabled: false }]) {
    mocks.provider.mockResolvedValueOnce(provider)
    expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'incomplete', reason: 'provider-unavailable' })
  }
  for (const [provider, reason] of [[{ ...external, apiKey: '' }, 'key-missing'], [{ ...external, baseURL: 'invalid-url' }, 'provider-incomplete'],
    [{ ...external, authType: 'vertex-ai', vertexAI: undefined }, 'provider-incomplete']]) {
    mocks.provider.mockResolvedValueOnce(provider)
    expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'incomplete', reason })
  }
  expect(mocks.generate).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('calls only the selected external model and validates both review and generation responses', async () => {
  const input = request('external')
  mocks.provider.mockResolvedValue({ ...external, baseURL: undefined })
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'passed' })
  expect(mocks.model).toHaveBeenCalledWith('janus', 'chosen', 'review-model')
  expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'selected-language-model', maxRetries: 0, maxTokens: 512 }))
  input.stage = 'wikiGeneration'
  mocks.generate.mockResolvedValueOnce({ finishReason: 'stop', text: '{"ok":true}' })
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'passed' })
  mocks.generate.mockResolvedValueOnce({ finishReason: 'stop', text: '{"wrong":true}' })
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'failed', reason: 'invalid-response' })
  mocks.generate.mockRejectedValueOnce(Object.assign(new Error('private-provider-detail'), { statusCode: 401 }))
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'failed', reason: 'auth-failed' })
  expect(mocks.local).not.toHaveBeenCalled()
  expect(mocks.key).not.toHaveBeenCalled()
})

it('requires host-enabled local settings, rejects injected paths, and performs an actual sample request', async () => {
  const input = request('local')
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'incomplete', reason: 'local-disabled' })
  expect(await testKnowledgeConfiguration({ ...input, local: { enabled: true, serverPath: 'injected.exe' } })).toMatchObject({ status: 'incomplete' })
  expect(mocks.local).not.toHaveBeenCalled()
  const automation = defaultKnowledgeAutomation()
  automation.local = { ...automation.local, enabled: true, serverPath: 'host-enabled.exe', modelPath: 'host-enabled.gguf' }
  mocks.settings.mockResolvedValue({ automation })
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(review) } }] })))
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'passed' })
  expect(mocks.local.mock.calls[0]![0].local).toEqual(automation.local)
  expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe('http://127.0.0.1:18791/v1/chat/completions')
  mocks.local.mockRejectedValueOnce(new Error('local-model-busy'))
  expect(await testKnowledgeConfiguration(input)).toMatchObject({ status: 'failed', reason: 'busy' })
})

it('bounds cloud tests to thirty seconds and reports timeout', async () => {
  vi.useFakeTimers()
  // AbortSignal.timeout uses native timers; capture the configured budget and drive its signal.
  const controller = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }))
  try {
    const pending = testKnowledgeConfiguration(request())
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(timeout).toHaveBeenCalledWith(30000)
    controller.abort()
    expect(await pending).toMatchObject({ status: 'failed', reason: 'timeout' })
  } finally { timeout.mockRestore() }
})

it('does not call providers when the knowledge feature is disabled and sanitizes credential failures', async () => {
  mocks.features.mockResolvedValueOnce({ knowledge: false })
  expect(await testKnowledgeConfiguration(request())).toMatchObject({ status: 'incomplete', reason: 'knowledge-disabled' })
  expect(mocks.key).not.toHaveBeenCalled()
  mocks.key.mockRejectedValueOnce(new Error('credential-unavailable'))
  expect(await testKnowledgeConfiguration(request())).toMatchObject({ status: 'failed', reason: 'credential-unavailable' })
  expect(fetch).not.toHaveBeenCalled()
})
