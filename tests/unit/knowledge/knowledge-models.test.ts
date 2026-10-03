import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultKnowledgeAutomation, normalizeKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
import { knowledgeModelJson, reviewKnowledge, stopKnowledgeLocalModel, type KnowledgeModelRequest } from '../../../src/main/knowledge/knowledge-models'
import { getJevKey, setJevKey } from '../../../src/main/knowledge/knowledge-credentials'
const mocks = vi.hoisted(() => ({ root: '', encrypted: true, provider: vi.fn(), model: vi.fn(), generate: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => mocks.root }, safeStorage: { isEncryptionAvailable: () => mocks.encrypted,
  encryptString: (text: string) => Buffer.from(text.split('').reverse().join('')), decryptString: (data: Buffer) => data.toString().split('').reverse().join('') } }))
vi.mock('../../../src/main/llm/LlmService', () => ({ llmService: { getProviderSettings: mocks.provider, getLanguageModel: mocks.model } }))
vi.mock('../../../src/main/llm/ai-runtime', () => ({ generateText: mocks.generate }))
let server: Server | undefined
beforeEach(async () => { mocks.root = await mkdtemp(join(tmpdir(), 'knowledge-model-')); mocks.encrypted = true; vi.clearAllMocks() })
afterEach(async () => { stopKnowledgeLocalModel(); if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined }; vi.unstubAllGlobals(); await rm(mocks.root, { recursive: true, force: true }) })
const request = (): KnowledgeModelRequest => ({ stage: 'entryReview', settings: defaultKnowledgeAutomation(), system: 'Review supplied evidence.', input: { candidate: 'Nightly backup', evidence: 'Nightly backup' }, signal: new AbortController().signal })
const verdict = { verdict: 'supported', reason: 'Supported', complete: true, conflict: false, coveredIds: ['a'] }
describe('knowledge providers', () => {
  it('sends a real local HTTP request with separate thinking mode and rejects incomplete output', async () => {
    let body: any; let finish = 'stop'
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
      body = JSON.parse(Buffer.concat(chunks).toString()); res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(verdict) } }] }))
    })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const input = request(); input.settings.local.endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    await expect(reviewKnowledge(input, [{ id: 'a', content: 'Nightly backup' }])).resolves.toEqual(verdict)
    expect(body.chat_template_kwargs.enable_thinking).toBe(false)
    input.stage = 'wikiGeneration'; await knowledgeModelJson(input)
    expect(body.chat_template_kwargs.enable_thinking).toBe(true)
    expect(body.max_tokens).toBe(3072)
    finish = 'length'; await expect(knowledgeModelJson(input)).rejects.toThrow('model-invalid-or-unavailable')
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
