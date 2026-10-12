import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BLUEPRINT_REVIEW_SETTINGS } from '../../src/shared/blueprint-review-settings'

const mocks = vi.hoisted(() => ({ provider: vi.fn(), model: vi.fn(), generate: vi.fn() }))
vi.mock('../../src/main/llm/LlmService', () => ({ llmService: { getProviderSettings: mocks.provider, getLanguageModel: mocks.model } }))
vi.mock('../../src/main/llm/ai-runtime', () => ({ generateText: mocks.generate }))
vi.mock('../../src/main/llm/jev-credentials', () => ({ getJevKey: async () => null }))
import { checkReviewConfiguration, parseReviewAgentResult, reviewModelFailure } from '../../src/main/blueprint/review/models'

const settings = () => ({ ...structuredClone(DEFAULT_BLUEPRINT_REVIEW_SETTINGS), generation: { providerId: 'vertex', modelId: 'reasoning-model' } })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.provider.mockResolvedValue({ enabled: true })
  mocks.model.mockResolvedValue({})
  // Match a reasoning model that consumes its budget before writing visible text.
  mocks.generate.mockImplementation(async ({ maxTokens }) => maxTokens < 80 ? { finishReason: 'length', text: '' } : { finishReason: 'stop', text: 'OK' })
})

describe('review model connection checks', () => {
  it('accepts a completed JSON report after the agent corrects a failed source lookup', () => {
    expect(parseReviewAgentResult({ text: '{"findings":[],"coverage":"complete"}', cancelled: false,
      toolTraces: [{ status: 'failed' }, { status: 'completed' }] })).toMatchObject({ findings: [], coverage: 'complete' })
    expect(() => parseReviewAgentResult({ text: '{"findings":', cancelled: false, toolTraces: [] })).toThrowError(
      expect.objectContaining({ code: 'TRANSIENT' }),
    )
  })

  it('allows a reasoning model to complete the fixed probe', async () => {
    expect((await checkReviewConfiguration(settings())).generation.status).toBe('ready')
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ maxTokens: 1024, prompt: 'Connection test. Reply with OK.', maxRetries: 0 })
  })

  it('identifies a truncated response without claiming invalid credentials', async () => {
    mocks.generate.mockResolvedValue({ finishReason: 'length', text: '' })
    expect((await checkReviewConfiguration(settings())).generation).toMatchObject({ status: 'failed', reason: 'truncated' })
  })

  it('distinguishes empty and blocked responses', async () => {
    mocks.generate.mockResolvedValueOnce({ finishReason: 'stop', text: ' ' })
    expect((await checkReviewConfiguration(settings())).generation.reason).toBe('empty-response')
    mocks.generate.mockResolvedValueOnce({ finishReason: 'content-filter', text: '' })
    expect((await checkReviewConfiguration(settings())).generation.reason).toBe('blocked')
  })

  it('reports missing selection and a disabled provider without sending a request', async () => {
    expect((await checkReviewConfiguration(DEFAULT_BLUEPRINT_REVIEW_SETTINGS)).generation).toMatchObject({ status: 'missing', reason: 'not-configured' })
    mocks.provider.mockResolvedValue({ enabled: false })
    expect((await checkReviewConfiguration(settings())).generation).toMatchObject({ status: 'failed', reason: 'provider-unavailable' })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it.each([[401, 'authentication'], [403, 'forbidden'], [404, 'model-not-found'], [429, 'rate-limit'], [503, 'provider-error'], [400, 'invalid-request']])('classifies HTTP %s without exposing provider payloads', async (statusCode, reason) => {
    mocks.generate.mockRejectedValue(Object.assign(new Error('SECRET credential and request body'), { statusCode, responseBody: 'SECRET' }))
    const result = (await checkReviewConfiguration(settings())).generation
    expect(result).toMatchObject({ status: 'failed', reason, httpStatus: statusCode })
    expect(JSON.stringify(result)).not.toContain('SECRET')
  })

  it('finds safe network and timeout reasons through wrapped causes', () => {
    expect(reviewModelFailure(new TypeError('fetch failed', { cause: Object.assign(new Error('SECRET'), { code: 'ENOTFOUND' }) }))).toMatchObject({ reason: 'network', code: 'TRANSIENT' })
    expect(reviewModelFailure(new DOMException('SECRET', 'TimeoutError'))).toMatchObject({ reason: 'timeout', code: 'TRANSIENT' })
    expect(reviewModelFailure({ code: 'MODEL_CREATION_ERROR', details: { cause: { statusCode: 403, message: 'SECRET' } } })).toMatchObject({ reason: 'forbidden', httpStatus: 403 })
  })
})
