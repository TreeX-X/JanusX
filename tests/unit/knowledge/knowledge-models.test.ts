import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultKnowledgeAutomation, normalizeKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
import { knowledgeModelJson, reviewKnowledge, stopKnowledgeLocalModel, type KnowledgeModelRequest } from '../../../src/main/knowledge/knowledge-models'
import { getJevKey, setJevKey } from '../../../src/main/knowledge/knowledge-credentials'
import { detectLocalEnvironment, recommendLocalContext, readLocalModelMetadata, selectLocalGpu } from '../../../src/main/knowledge/knowledge-local-environment'
import * as localRuntime from '../../../src/main/knowledge/knowledge-local-runtime'
const mocks = vi.hoisted(() => ({ root: '', encrypted: true, provider: vi.fn(), model: vi.fn(), generate: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => mocks.root }, safeStorage: { isEncryptionAvailable: () => mocks.encrypted,
  encryptString: (text: string) => Buffer.from(text.split('').reverse().join('')), decryptString: (data: Buffer) => data.toString().split('').reverse().join('') } }))
vi.mock('../../../src/main/llm/LlmService', () => ({ llmService: { getProviderSettings: mocks.provider, getLanguageModel: mocks.model } }))
vi.mock('../../../src/main/llm/ai-runtime', () => ({ generateText: mocks.generate }))
let server: Server | undefined
beforeEach(async () => { mocks.root = await mkdtemp(join(tmpdir(), 'knowledge-model-')); mocks.encrypted = true; vi.clearAllMocks() })
afterEach(async () => { await stopKnowledgeLocalModel(); if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined }; vi.unstubAllGlobals(); await rm(mocks.root, { recursive: true, force: true }) })
const request = (): KnowledgeModelRequest => ({ stage: 'entryReview', settings: defaultKnowledgeAutomation(), system: 'Review supplied evidence.', input: { candidate: 'Nightly backup', evidence: 'Nightly backup' }, signal: new AbortController().signal })
const verdict = { verdict: 'supported', reason: 'Supported', complete: true, conflict: false, coveredIds: ['a'] }
describe('knowledge providers', () => {
  it('keeps defaults and legacy local selections off, rejects direct local execution while disabled', async () => {
    const input = request()
    expect(input.settings.local.enabled).toBe(false)
    expect(Object.values(input.settings.stages).every(stage => stage.provider === 'off')).toBe(true)
    const legacy = normalizeKnowledgeAutomation({ stages: { entryReview: { provider: 'local' } }, local: { endpoint: 'http://127.0.0.1/v1' } })
    expect(legacy.stages.entryReview.provider).toBe('off')
    input.settings.stages.entryReview.provider = 'local'
    await expect(knowledgeModelJson(input)).rejects.toThrow('local-model-disabled')
  })
  it('budgets model, hybrid KV and headroom, bounding context by both resources and model limits', () => {
    const budget = { memoryMiB: 16000, modelBytes: 3143656608, kvBytesPerToken: 32768, modelContext: 262144 }
    expect(recommendLocalContext({ ...budget, vramMiB: 6000 })).toEqual([32768])
    expect(recommendLocalContext({ ...budget, vramMiB: 8000 })).toEqual([32768, 65536])
    expect(recommendLocalContext({ ...budget, vramMiB: 16000 })).toEqual([32768, 65536, 131072, 262144])
    expect(recommendLocalContext({ ...budget, memoryMiB: 3000 })).toEqual([])
    expect(recommendLocalContext({ ...budget, vramMiB: 16000, modelContext: 65536 })).toEqual([32768, 65536])
    expect(recommendLocalContext(budget)).toEqual([])
  })
  it('fails environment checks on invalid paths, endpoints, context choices and malformed weights', async () => {
    const local = defaultKnowledgeAutomation().local, signal = new AbortController().signal
    expect(await detectLocalEnvironment({ ...local, endpoint: 'https://example.com/v1' }, signal)).toMatchObject({ ok: false, reason: 'invalid-model-endpoint' })
    expect(await detectLocalEnvironment({ ...local, contextTokens: 12345 }, signal)).toMatchObject({ ok: false, reason: 'local-context-unsupported' })
    expect(await detectLocalEnvironment({ ...local, serverPath: 'relative.exe' }, signal)).toMatchObject({ ok: false, reason: 'invalid-local-model-path' })
    await setJevKey('test-private-credential')
    await expect(readLocalModelMetadata(join(mocks.root, 'janusx/knowledge-jev.credential'))).rejects.toThrow()
    const controller = new AbortController(); controller.abort()
    await expect(detectLocalEnvironment(local, controller.signal)).rejects.toThrow()
  })
  it('requires measured GPU capacity, selects the largest free budget and never substitutes RAM', () => {
    const model = { bytes: 3143656608, kvBytesPerToken: 32768, context: 262144 }
    const report = () => ({ ok: false, mode: 'unavailable' as const, availableMemoryMiB: 64000,
      modelContextTokens: 262144, recommendedContextTokens: 0, selectedContextTokens: 0, supportedContextTokens: [] })
    expect(() => selectLocalGpu('CPU: CPU (64000 MiB, 64000 MiB free)', '', report(), model)).toThrow('local-gpu-unavailable')
    const devices = 'Vulkan0: NVIDIA RTX 4060 (8192 MiB, 7500 MiB free)'
    expect(() => selectLocalGpu(devices, '', report(), model)).toThrow('local-vram-unknown')
    expect(() => selectLocalGpu(devices, 'NVIDIA RTX 4060, 4500', report(), model)).toThrow('local-vram-insufficient')
    const actual = report()
    selectLocalGpu(devices + '\nVulkan1: AMD Radeon (16384 MiB, 10000 MiB free)', 'NVIDIA RTX 4060, 6500', actual, model)
    expect(actual).toMatchObject({ mode: 'gpu', device: 'Vulkan1', availableVramMiB: 10000, supportedContextTokens: [32768, 65536, 131072] })
    expect(() => selectLocalGpu(devices, 'NVIDIA RTX 4060, 6500', { ...report(), availableMemoryMiB: 3000 }, model)).toThrow('local-memory-insufficient')
  })
  it('distinguishes an unavailable existing service from unknown service context and preserves cancellation', async () => {
    const local = defaultKnowledgeAutomation().local
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    expect(await detectLocalEnvironment(local, signal)).toMatchObject({ ok: false, mode: 'service', reason: 'local-service-unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    expect(await detectLocalEnvironment(local, signal)).toMatchObject({ reason: 'local-service-unavailable' })
    fetchMock.mockResolvedValueOnce(new Response('{}'))
    expect(await detectLocalEnvironment(local, signal)).toMatchObject({ reason: 'local-service-context-unknown' })
    fetchMock.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('not-json'))
    expect(await detectLocalEnvironment(local, signal)).toMatchObject({ reason: 'local-service-context-unknown' })
    const controller = new AbortController()
    fetchMock.mockImplementationOnce(async () => { controller.abort(); throw new Error('cancelled') })
    await expect(detectLocalEnvironment(local, controller.signal)).rejects.toThrow()
  })
  it('sends a real local HTTP request with separate thinking mode and rejects incomplete output', async () => {
    let body: any; let finish = 'stop'
    server = createServer(async (req, res) => {
      if (req.url === '/health') { res.end('{}'); return }
      if (req.url === '/props') { res.end(JSON.stringify({ default_generation_settings: { n_ctx: 65536 } })); return }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
      body = JSON.parse(Buffer.concat(chunks).toString()); res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(verdict) } }] }))
    })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const input = request(); input.settings.local.endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    input.settings.local.enabled = true; input.settings.stages.entryReview.provider = 'local'; input.settings.stages.wikiGeneration.provider = 'local'
    await expect(reviewKnowledge(input, [{ id: 'a', content: 'Nightly backup' }])).resolves.toEqual(verdict)
    expect(body.chat_template_kwargs.enable_thinking).toBe(false)
    input.stage = 'wikiGeneration'; await knowledgeModelJson(input)
    expect(body.chat_template_kwargs.enable_thinking).toBe(true)
    expect(body.max_tokens).toBe(3072)
    expect(body.reasoning_budget_tokens).toBe(1024)
    finish = 'length'; await expect(knowledgeModelJson(input)).rejects.toThrow('incomplete-model-output')
    expect(mocks.provider).not.toHaveBeenCalled()
  })
  it('uses only the selected external provider, no local paths or default fallback', async () => {
    const input = request(); input.settings.stages.entryReview = { provider: 'external', providerId: 'chosen', model: 'reviewer', thinking: false }
    input.settings.local.serverPath = 'invalid-unused-path'
    mocks.provider.mockResolvedValue({ enabled: true }); mocks.model.mockResolvedValue('chosen-language-model'); mocks.generate.mockResolvedValue({ finishReason: 'stop', text: JSON.stringify(verdict) })
    expect(await reviewKnowledge(input, [{ id: 'a', content: 'Nightly backup' }])).toEqual(verdict)
    expect(mocks.model).toHaveBeenCalledWith('janus', 'chosen', 'reviewer')
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'chosen-language-model', maxRetries: 0 }))
    mocks.provider.mockResolvedValue(undefined)
    await expect(knowledgeModelJson(input)).rejects.toThrow('model-not-configured')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
  it('cancels an active local request while leaving an externally managed service running', async () => {
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    server = createServer(async (req, res) => {
      if (req.url === '/health') { res.end('{}'); return }
      if (req.url === '/props') { res.end(JSON.stringify({ default_generation_settings: { n_ctx: 65536 } })); return }
      for await (const _chunk of req) { /* consume request without replying */ }
      entered()
    })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const input = request()
    input.settings.local.enabled = true; input.settings.stages.entryReview.provider = 'local'
    input.settings.local.endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    const pending = knowledgeModelJson(input)
    const cancelled = expect(pending).rejects.toThrow()
    await started
    await stopKnowledgeLocalModel()
    await cancelled
    const response = await fetch(new URL('/health', input.settings.local.endpoint)); await response.body?.cancel()
    expect(response.ok).toBe(true)
  })
  it('uses actual managed token counts for long Chinese input and refuses a true overflow', async () => {
    const runtime = vi.spyOn(localRuntime, 'withKnowledgeLocalModel').mockImplementation(async (_settings, _model, signal, run) => run(32768, signal))
    let count = 15000, chats = 0
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).endsWith('/apply-template')) return new Response(JSON.stringify({ prompt: 'rendered prompt' }))
      if (String(url).endsWith('/tokenize')) return new Response(JSON.stringify({ tokens: Array(count).fill(42) }))
      chats++
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }))
    }))
    try {
      const input = request()
      input.settings.local.enabled = true; input.settings.local.serverPath = '/managed/llama-server'
      input.settings.stages.entryReview.provider = 'local'; input.input = '知识内容'.repeat(4000)
      expect(Buffer.byteLength(JSON.stringify(input.input))).toBeGreaterThan(32768)
      expect(await knowledgeModelJson(input)).toEqual({ ok: true })
      count = 33000
      await expect(knowledgeModelJson(input)).rejects.toThrow('model-input-exceeds-context')
      expect(chats).toBe(1)
    } finally { runtime.mockRestore() }
  })
  it('requires complete Jev support, consistency and coverage answers and never generates through Jev', async () => {
    await setJevKey('test-private-credential')
    const fetch = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body)
      expect(body.questions).toHaveProperty('coverage_0')
      return new Response(JSON.stringify({ model: body.model, answers: Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: 'noul', noul: 0.99 }])) }))
    }); vi.stubGlobal('fetch', fetch)
    const input = request(); input.settings.stages.entryReview.provider = 'jev'; input.settings.stages.entryReview.model = 'jev-1.13.0'
    expect((await reviewKnowledge(input, [{ id: 'a', content: 'Backup' }])).verdict).toBe('supported')
    await expect(knowledgeModelJson(input)).rejects.toThrow('provider-cannot-generate')
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ model: 'jev-1.13.0', answers: {} })))
    await expect(reviewKnowledge(input, [{ id: 'a', content: 'Backup' }])).rejects.toThrow('invalid-jev-response')
    expect(mocks.generate).not.toHaveBeenCalled()
    const normalized = normalizeKnowledgeAutomation({ stages: { wikiGeneration: { provider: 'jev' } } })
    expect(normalized.stages.wikiGeneration.provider).toBe('off')
  })
  it('encrypts credentials and refuses a plaintext fallback', async () => {
    await setJevKey('test-private-credential')
    expect(await getJevKey()).toBe('test-private-credential')
    expect(await readFile(join(mocks.root, 'janusx/knowledge-jev.credential'), 'utf8')).not.toContain('test-private-credential')
    mocks.encrypted = false; await expect(setJevKey('replacement')).rejects.toThrow('credential-encryption-unavailable')
    await setJevKey(''); expect(await getJevKey()).toBeNull()
  })
})
