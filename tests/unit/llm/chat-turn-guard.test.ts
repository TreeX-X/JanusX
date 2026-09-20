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
const { proposeForConversation } = vi.hoisted(() => ({ proposeForConversation: vi.fn() }))
vi.mock('../../../src/main/janus/maintenance/service', () => ({ blueprintMaintenanceService: { proposeForConversation } }))

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

import { abortChatStream, answerChatQuestion, handleChatStream, prepareJanusChatRecall, steerChatStream } from '../../../src/main/llm/chat-orchestrator'

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
  it('shares proposal turn ownership, consumes steering once and streams the result through chat events', async () => {
    let release!: () => void
    proposeForConversation.mockReset().mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return 'first proposal'
    }).mockResolvedValue('revised proposal')
    const reply = vi.fn()
    const request = { requestId: 'proposal-1', conversationId: 'project-proposal', providerId: 'p', domain: 'project' as const, messages: userMessages, maintenanceTaskId: 'task' }
    const turn = handleChatStream({ reply } as never, request)
    await vi.waitFor(() => expect(proposeForConversation).toHaveBeenCalledTimes(1))
    const competing = vi.fn()
    await handleChatStream({ reply: competing } as never, { ...request, requestId: 'proposal-2' })
    expect(competing).toHaveBeenCalledWith('llm:chat:error', expect.objectContaining({ error: expect.stringContaining('BUSY') }))
    for (let index = 0; index < 9; index++) {
      expect(steerChatStream({ conversationId: request.conversationId, entryId: `queued-${index}`, text: `Constraint ${index}` }).accepted).toBe(true)
    }
    expect(steerChatStream({ conversationId: request.conversationId, entryId: 'followup', text: 'Use the revised scope' }).accepted).toBe(true)
    expect(steerChatStream({ conversationId: request.conversationId, entryId: 'followup', text: 'Use the revised scope' }).accepted).toBe(true)
    expect(steerChatStream({ conversationId: request.conversationId, entryId: 'followup', text: 'Different content' }).accepted).toBe(false)
    expect(steerChatStream({ conversationId: request.conversationId, entryId: 'overflow', text: 'Extra entry' }).error).toContain('full')
    release()
    await turn
    expect(proposeForConversation).toHaveBeenCalledTimes(2)
    expect(proposeForConversation.mock.calls[1][0].messages.at(-1).content).toBe('Use the revised scope')
    expect(reply).toHaveBeenCalledWith('llm:chat:agent-event', expect.objectContaining({ type: 'text_delta', delta: 'revised proposal' }))
  })

  it('cancels a proposal through the ordinary chat stop route and releases its turn', async () => {
    proposeForConversation.mockReset().mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      return 'cancelled'
    })
    const reply = vi.fn()
    const turn = handleChatStream({ reply } as never, { requestId: 'proposal-cancel', conversationId: 'project-cancel', providerId: 'p', domain: 'project', messages: userMessages, maintenanceTaskId: 'task' })
    await vi.waitFor(() => expect(proposeForConversation).toHaveBeenCalledTimes(1))
    abortChatStream('proposal-cancel')
    await turn
    expect(reply).toHaveBeenCalledWith('llm:chat:agent-event', expect.objectContaining({ type: 'stream_end', cancelled: true }))
    expect(steerChatStream({ conversationId: 'project-cancel', entryId: 'late', text: 'late' }).accepted).toBe(false)
  })
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
