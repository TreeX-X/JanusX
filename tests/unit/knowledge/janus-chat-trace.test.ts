import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatStream } from '../../../src/renderer/src/services/llm'
import type { KnowledgeRecallTrace } from '../../../src/shared/knowledge'
import type { ChatAgentEvent } from '../../../src/shared/ipc/llm'

describe('Janus Chat recall trace adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('delivers only the active request trace and unsubscribes on completion', async () => {
    const listeners = new Map<string, (payload: unknown) => void>()
    const unsubscribers = new Map<string, ReturnType<typeof vi.fn>>()
    const send = vi.fn()
    const subscribe = (channel: string, callback: (payload: never) => void) => {
      listeners.set(channel, callback)
      const unsubscribe = vi.fn(() => listeners.delete(channel))
      unsubscribers.set(channel, unsubscribe)
      return unsubscribe
    }
    vi.stubGlobal('window', { electron: { llm: {
      onDelta: (callback: (payload: never) => void) => subscribe('llm:chat:delta', callback),
      onDone: (callback: (payload: never) => void) => subscribe('llm:chat:done', callback),
      onError: (callback: (payload: never) => void) => subscribe('llm:chat:error', callback),
      onRecallTrace: (callback: (payload: never) => void) => subscribe('llm:chat:recall-trace', callback),
      onToolTrace: (callback: (payload: never) => void) => subscribe('llm:chat:tool-trace', callback),
      startChatStream: send,
      abortChat: vi.fn(),
    } } })
    const onRecallTrace = vi.fn()

    chatStream([], vi.fn(), vi.fn(), vi.fn(), {
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
      onRecallTrace,
    })
    await Promise.resolve()
    const requestId = send.mock.calls[0]?.[0].requestId as string
    const trace: KnowledgeRecallTrace = {
      requestId,
      status: 'empty',
      query: 'question',
      recalledCount: 0,
      eligibleCount: 0,
      truncated: false,
      maxItems: 5,
      maxChars: 3_000,
    }

    listeners.get('llm:chat:recall-trace')?.({ ...trace, requestId: 'other-request' })
    listeners.get('llm:chat:recall-trace')?.(trace)
    expect(onRecallTrace).toHaveBeenCalledOnce()
    expect(onRecallTrace).toHaveBeenCalledWith(trace)

    listeners.get('llm:chat:done')?.({ requestId })
    expect(unsubscribers.get('llm:chat:recall-trace')).toHaveBeenCalledOnce()
  })

  it('uses request-scoped Agent events when the structured IPC channel is available', async () => {
    const listeners = new Map<string, (payload: unknown) => void>()
    const send = vi.fn()
    const subscribe = (channel: string, callback: (payload: never) => void) => {
      listeners.set(channel, callback)
      return vi.fn(() => listeners.delete(channel))
    }
    vi.stubGlobal('window', { electron: { llm: {
      onDelta: (callback: (payload: never) => void) => subscribe('llm:chat:delta', callback),
      onDone: (callback: (payload: never) => void) => subscribe('llm:chat:done', callback),
      onError: (callback: (payload: never) => void) => subscribe('llm:chat:error', callback),
      onAgentEvent: (callback: (payload: never) => void) => subscribe('llm:chat:agent-event', callback),
      onRecallTrace: (callback: (payload: never) => void) => subscribe('llm:chat:recall-trace', callback),
      onToolTrace: (callback: (payload: never) => void) => subscribe('llm:chat:tool-trace', callback),
      startChatStream: send,
      abortChat: vi.fn(),
    } } })
    const onDelta = vi.fn()
    const onDone = vi.fn()
    const onAgentEvent = vi.fn()

    chatStream([], onDelta, onDone, vi.fn(), { providerId: 'provider-a', onAgentEvent })
    await Promise.resolve()
    const requestId = send.mock.calls[0]?.[0].requestId as string
    const emit = (event: ChatAgentEvent) => listeners.get('llm:chat:agent-event')?.(event)

    emit({ type: 'text_delta', requestId: 'other-request', delta: 'ignored' })
    emit({ type: 'text_delta', requestId, delta: 'visible' })
    emit({ type: 'stream_end', requestId, cancelled: false })

    expect(onDelta).toHaveBeenCalledExactlyOnceWith('visible')
    expect(onAgentEvent).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledOnce()
  })
})
