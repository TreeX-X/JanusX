import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeContextResult } from '../../../src/shared/knowledge'

const { handle, on, search, capture, streamText, getSession, executeFunctionCall } = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  search: vi.fn(),
  capture: vi.fn(),
  streamText: vi.fn(),
  getSession: vi.fn(),
  executeFunctionCall: vi.fn(),
}))

vi.mock('electron', () => ({ ipcMain: { handle, on } }))
vi.mock('../../../src/main/knowledge/context-service', () => ({
  knowledgeContextService: { search },
}))
vi.mock('../../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: { capture },
}))
vi.mock('../../../src/main/llm/ModelCatalogService', () => ({
  getModelCatalogService: () => ({ getCatalog: vi.fn(), refresh: vi.fn() }),
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
vi.mock('../../../src/main/agent/runtime/runtime', () => ({
  workspaceAgentRuntime: { getSession, executeFunctionCall },
}))

import { prepareJanusChatRecall, registerLlmHandlers } from '../../../src/main/ipc/llm-handlers'

const emptyResult: KnowledgeContextResult = {
  items: [],
  compactContext: '',
  truncated: false,
  eligibleCount: 0,
  maxItems: 5,
  maxChars: 3_000,
}

const messages = [
  { role: 'system' as const, content: 'Janus persona' },
  { role: 'system' as const, content: 'Workspace policy' },
  { role: 'user' as const, content: 'older question' },
  { role: 'assistant' as const, content: 'older answer' },
  { role: 'user' as const, content: 'latest workspace question' },
]

function registerAndFindHandler(channel: string) {
  registerLlmHandlers()
  return on.mock.calls.find(([c]) => c === channel)
}

function fakeStream(text: string) {
  streamText.mockResolvedValue({
    textStream: (async function* () {
      yield text
    })(),
  })
}

describe('Janus Chat knowledge recall', () => {
  beforeEach(() => {
    handle.mockReset()
    on.mockReset()
    search.mockReset()
    capture.mockReset().mockResolvedValue(undefined)
    streamText.mockReset()
    getSession.mockReset()
    executeFunctionCall.mockReset()
  })

  it('uses the latest user message, bounded workspace scope, and injects after the persona', async () => {
    const contextResult: KnowledgeContextResult = {
      items: [{
        id: 'fact-1',
        kind: 'fact',
        title: 'A'.repeat(200),
        content: 'accepted truth',
        score: 4.2,
        workspaceId: 'workspace-a',
        provenance: {
          observationIds: ['obs-1', 'obs-2', 'obs-3', 'obs-4'],
          factIds: ['fact-1'],
          fileRefs: ['src/a.ts'],
          createdAt: '2026-07-12T00:00:00.000Z',
        },
      }],
      compactContext: '[fact] accepted truth',
      truncated: true,
      eligibleCount: 2,
      maxItems: 5,
      maxChars: 3_000,
    }
    const recallSearch = vi.fn(async () => contextResult)

    const result = await prepareJanusChatRecall(
      'request-1',
      messages,
      'workspace-a',
      'C:/workspace-a',
      recallSearch,
    )

    expect(recallSearch).toHaveBeenCalledWith({
      query: 'latest workspace question',
      workspaceId: 'workspace-a',
      workspacePath: 'C:/workspace-a',
      maxItems: 5,
      maxChars: 3_000,
    })
    expect(result.messages.slice(0, 2)).toEqual(messages.slice(0, 2))
    expect(result.messages[2]).toEqual(expect.objectContaining({ role: 'system' }))
    expect(result.messages[2]?.content).toContain('trust="untrusted"')
    expect(result.messages[2]?.content).toContain('reference-only')
    expect(result.messages.filter((message) => message.content.includes('janus-knowledge-context'))).toHaveLength(1)
    expect(result.messages.slice(3)).toEqual(messages.slice(2))
    expect(messages).toEqual([
      { role: 'system', content: 'Janus persona' },
      { role: 'system', content: 'Workspace policy' },
      { role: 'user', content: 'older question' },
      { role: 'assistant', content: 'older answer' },
      { role: 'user', content: 'latest workspace question' },
    ])
    expect(result.trace).toEqual(expect.objectContaining({
      requestId: 'request-1',
      status: 'recalled',
      query: 'latest workspace question',
      recalledCount: 1,
      eligibleCount: 2,
      truncated: true,
    }))
    expect(result.trace.topHit?.title).toHaveLength(160)
    expect(result.trace.topHit?.provenance.observationIds).toEqual(['obs-1', 'obs-2', 'obs-3'])
  })

  it('fails open for empty, degraded, and thrown recall', async () => {
    const empty = await prepareJanusChatRecall('empty', messages, 'workspace-a', undefined, async () => emptyResult)
    expect(empty.messages).toBe(messages)
    expect(empty.trace.status).toBe('empty')

    const degraded = await prepareJanusChatRecall('degraded', messages, undefined, undefined, async () => ({
      ...emptyResult,
      degraded: { reason: 'missing-workspace' },
    }))
    expect(degraded.messages).toBe(messages)
    expect(degraded.trace).toEqual(expect.objectContaining({ status: 'degraded', reason: 'missing-workspace' }))

    const failed = await prepareJanusChatRecall('failed', messages, 'workspace-a', undefined, async () => {
      throw new Error('recall unavailable')
    })
    expect(failed.messages).toBe(messages)
    expect(failed.trace).toEqual(expect.objectContaining({ status: 'error', reason: 'recall unavailable' }))
  })

  it('emits exactly one correlated trace before stream completion and preserves observations', async () => {
    search.mockResolvedValue(emptyResult)
    fakeStream('answer')
    const registration = registerAndFindHandler('llm:chat-stream')
    const reply = vi.fn()

    await registration?.[1]({ reply }, {
      requestId: 'stream-1',
      messages,
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
      workspaceId: 'workspace-a',
      workspacePath: 'C:/workspace-a',
    })

    const channels = reply.mock.calls.map(([channel]) => channel)
    expect(channels.filter((channel) => channel === 'llm:chat:recall-trace')).toHaveLength(1)
    expect(channels.indexOf('llm:chat:recall-trace')).toBeLessThan(channels.indexOf('llm:chat:done'))
    expect(reply).toHaveBeenCalledWith('llm:chat:recall-trace', expect.objectContaining({
      requestId: 'stream-1',
      status: 'empty',
    }))
    expect(capture).toHaveBeenCalledTimes(2)
  })

  it('keeps an unbound Janus conversation global and skips workspace observations', async () => {
    search.mockResolvedValue(emptyResult)
    fakeStream('global answer')
    const registration = registerAndFindHandler('llm:chat-stream')
    const reply = vi.fn()

    await registration?.[1]({ reply }, {
      requestId: 'stream-global',
      messages,
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
    })

    expect(search).toHaveBeenCalledWith({
      query: 'latest workspace question',
      workspaceId: undefined,
      workspacePath: undefined,
      maxItems: 5,
      maxChars: 3_000,
    })
    expect(capture).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith('llm:chat:done', { requestId: 'stream-global' })
  })

  it('adds trusted Runtime tools for every validated attached workspace session', async () => {
    search.mockResolvedValue(emptyResult)
    getSession.mockImplementation((sessionId: string) => ({
      id: sessionId,
      status: 'running',
      workspace: sessionId === 'session-1'
        ? { workspaceId: 'workspace-a', workspaceRoot: 'C:/workspace-a' }
        : { workspaceId: 'workspace-b', workspaceRoot: 'C:/workspace-b' },
    }))
    fakeStream('workspace answer')
    const registration = registerAndFindHandler('llm:chat-stream')

    await registration?.[1]({ reply: vi.fn(), sender: { id: 9 } }, {
      requestId: 'stream-tools',
      messages,
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
      workspaceResources: [
        { workspaceId: 'workspace-a', workspacePath: 'C:/workspace-a', workspaceName: 'Workspace A', agentSessionId: 'session-1' },
        { workspaceId: 'workspace-b', workspacePath: 'C:/workspace-b', workspaceName: 'Workspace B', agentSessionId: 'session-2' },
      ],
    })

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      maxSteps: 12,
      tools: expect.objectContaining({
        workspace_list: expect.any(Object),
        workspace_read: expect.any(Object),
        project_detect: expect.any(Object),
        project_generate_config: expect.any(Object),
      }),
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: expect.stringContaining('workspaceId=workspace-a') }),
        expect.objectContaining({ role: 'system', content: expect.stringContaining('workspaceId=workspace-b') }),
      ]),
    }))
    expect(capture).toHaveBeenCalledTimes(4)
  })

  it('keeps streaming when recall throws and reports degradation only through the trace', async () => {
    search.mockRejectedValue(new Error('knowledge offline'))
    fakeStream('ordinary answer')
    const registration = registerAndFindHandler('llm:chat-stream')
    const reply = vi.fn()

    await registration?.[1]({ reply }, {
      requestId: 'stream-fail-open',
      messages,
      providerId: 'provider-a',
      sourceTag: 'janus-chat',
      workspaceId: 'workspace-a',
      workspacePath: 'C:/workspace-a',
    })

    expect(reply).toHaveBeenCalledWith('llm:chat:recall-trace', expect.objectContaining({
      requestId: 'stream-fail-open',
      status: 'error',
      reason: 'knowledge offline',
    }))
    expect(reply).toHaveBeenCalledWith('llm:chat:delta', expect.objectContaining({
      requestId: 'stream-fail-open',
      delta: 'ordinary answer',
    }))
    expect(reply.mock.calls.some(([channel]) => channel === 'llm:chat:error')).toBe(false)
    expect(reply).toHaveBeenCalledWith('llm:chat:done', { requestId: 'stream-fail-open' })
  })
})
