import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeContextResult } from '../../../src/shared/knowledge'

const { search, capture, streamText, getSession, executeFunctionCall, scheduleImmediate, capturePersonTurn, capturePersonEpisode } = vi.hoisted(() => ({
  search: vi.fn(),
  capture: vi.fn(),
  streamText: vi.fn(),
  getSession: vi.fn(),
  executeFunctionCall: vi.fn(),
  scheduleImmediate: vi.fn(),
  capturePersonTurn: vi.fn(),
  capturePersonEpisode: vi.fn(),
}))

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/janusx-test' } }))
vi.mock('../../../src/main/knowledge/context-service', () => ({
  knowledgeContextService: { search },
}))
vi.mock('../../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: { capture },
}))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({
  knowledgeProcessingQueue: { scheduleImmediate },
}))
vi.mock('../../../src/main/knowledge/user-turn-capture', () => ({
  capturePersonChatTurn: capturePersonTurn,
  capturePersonEpisodeFromTurn: capturePersonEpisode,
}))
vi.mock('../../../src/main/llm/LlmService', () => ({
  llmService: {
    getProviderSettings: vi.fn(async () => ({ modelId: 'test-model' })),
    getLanguageModel: vi.fn(async () => ({})),
  },
}))
vi.mock('../../../src/main/llm/ai-runtime', () => ({
  generateText: vi.fn(),
  streamText,
}))
vi.mock('../../../src/main/agent/runtime/shell-runtime', () => ({
  workspaceAgentRuntime: {
    getSession,
    executeFunctionCall,
    registry: { list: () => [] },
  },
}))

import { answerChatQuestion, handleChatStream, prepareJanusChatRecall } from '../../../src/main/llm/chat-orchestrator'

const emptyResult: KnowledgeContextResult = {
  items: [],
  compactContext: '',
  truncated: false,
  eligibleCount: 0,
  maxItems: 5,
  maxChars: 3_000,
}

const userMessages = [{ role: 'user' as const, content: 'hello' }]

function immediateStream(text: string) {
  streamText.mockResolvedValue({
    textStream: (async function* () {
      yield text
    })(),
  })
}

describe('chat turn guard (S6-a)', () => {
  beforeEach(() => {
    search.mockReset().mockResolvedValue(emptyResult)
    capture.mockReset().mockResolvedValue(undefined)
    streamText.mockReset()
    getSession.mockReset()
    executeFunctionCall.mockReset()
    capturePersonTurn.mockReset().mockResolvedValue(undefined)
    capturePersonEpisode.mockReset().mockResolvedValue(undefined)
  })

  it('rejects a second concurrent turn on the same conversation', async () => {
    let releaseFirst!: (value: unknown) => void
    const gate = new Promise((resolve) => {
      releaseFirst = resolve
    })
    streamText.mockImplementationOnce(async () => {
      await gate
      return {
        textStream: (async function* () {
          yield 'first'
        })(),
      }
    })
    const replyFirst = vi.fn()
    const replySecond = vi.fn()

    const first = handleChatStream({ reply: replyFirst } as never, {
      requestId: 's6a-req-1',
      conversationId: 's6a-conv-busy',
      messages: userMessages,
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
    } as never)
    for (let attempt = 0; attempt < 200 && streamText.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(streamText.mock.calls.length).toBeGreaterThan(0)

    await handleChatStream({ reply: replySecond } as never, {
      requestId: 's6a-req-2',
      conversationId: 's6a-conv-busy',
      messages: userMessages,
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
    } as never)

    expect(streamText.mock.calls.length).toBe(1)
    expect(replySecond).toHaveBeenCalledWith(
      'llm:chat:error',
      expect.objectContaining({ requestId: 's6a-req-2', error: expect.stringContaining('BUSY') }),
    )

    releaseFirst(undefined)
    await first
    expect(replyFirst).toHaveBeenCalledWith('llm:chat:done', { requestId: 's6a-req-1' })
    expect(replyFirst.mock.calls.some(([channel]) => channel === 'llm:chat:error')).toBe(false)
  })

  it('lets different conversations run concurrently', async () => {
    immediateStream('ok')
    const replyA = vi.fn()
    const replyB = vi.fn()

    await Promise.all([
      handleChatStream({ reply: replyA } as never, {
        requestId: 's6a-req-a',
        conversationId: 's6a-conv-a',
        messages: userMessages,
        providerId: 'provider-a',
        sourceTag: 'janus-chat',
      } as never),
      handleChatStream({ reply: replyB } as never, {
        requestId: 's6a-req-b',
        conversationId: 's6a-conv-b',
        messages: userMessages,
        providerId: 'provider-a',
        sourceTag: 'janus-chat',
      } as never),
    ])

    expect(streamText.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(replyA).toHaveBeenCalledWith('llm:chat:done', { requestId: 's6a-req-a' })
    expect(replyB).toHaveBeenCalledWith('llm:chat:done', { requestId: 's6a-req-b' })
    for (const reply of [replyA, replyB]) {
      expect(reply.mock.calls.some(([channel, payload]) => channel === 'llm:chat:error'
        && String((payload as { error?: unknown }).error ?? '').includes('BUSY'))).toBe(false)
    }
  })

  it('rejects stale or unknown mid-turn answers without touching another request', () => {
    expect(
      answerChatQuestion({ requestId: 's6a-missing', callId: 'nope', answer: { status: 'cancelled' } }),
    ).toEqual({ accepted: false, error: 'No pending question for this request' })
    expect(
      answerChatQuestion({ requestId: 's6a-missing', callId: '', answer: { status: 'cancelled' } as never }),
    ).toEqual({ accepted: false, error: 'Invalid call id' })
  })

  it('keeps project turns out of personal memory even without a workspace', async () => {
    immediateStream('project answer')
    const reply = vi.fn()

    await handleChatStream({ reply } as never, {
      requestId: 's6b-project-1',
      conversationId: 's6b-conv-project',
      messages: userMessages,
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
      domain: 'project',
    } as never)

    expect(reply).toHaveBeenCalledWith('llm:chat:done', { requestId: 's6b-project-1' })
    expect(capturePersonTurn).not.toHaveBeenCalled()
    expect(capturePersonEpisode).not.toHaveBeenCalled()
  })

  it('skips personal recall injection for project domain when a user search exists', async () => {
    const projectSearch = vi.fn(async () => emptyResult)
    const userSearch = vi.fn(async () => ({ compactContext: '[user] private', items: [] }) as never)

    const personal = await prepareJanusChatRecall(
      's6b-recall-personal',
      [{ role: 'user' as const, content: 'hello' }],
      undefined,
      undefined,
      projectSearch,
      userSearch,
    )
    expect(userSearch).toHaveBeenCalledTimes(1)
    expect(personal.messages.some((message) => message.content.includes('[user] private'))).toBe(true)

    userSearch.mockClear()
    const project = await prepareJanusChatRecall(
      's6b-recall-project',
      [{ role: 'user' as const, content: 'hello' }],
      undefined,
      undefined,
      projectSearch,
      userSearch,
      'project',
    )
    expect(userSearch).not.toHaveBeenCalled()
    expect(project.messages.some((message) => message.content.includes('[user] private'))).toBe(false)
  })
})
