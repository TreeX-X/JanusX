import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeContextResult } from '../../../src/shared/knowledge'

const { search, searchWithUser, recordAccess, recordProjectAccess, capture, streamText, getSession, executeFunctionCall, scheduleImmediate, capturePersonTurn, capturePersonEpisode } = vi.hoisted(() => ({
  search: vi.fn(),
  searchWithUser: vi.fn(),
  recordAccess: vi.fn(),
  recordProjectAccess: vi.fn(),
  capture: vi.fn(),
  streamText: vi.fn(),
  getSession: vi.fn(),
  executeFunctionCall: vi.fn(),
  scheduleImmediate: vi.fn(),
  capturePersonTurn: vi.fn(),
  capturePersonEpisode: vi.fn(),
}))
const { proposeForConversation, invalidateConversationProposal } = vi.hoisted(() => ({ proposeForConversation: vi.fn(), invalidateConversationProposal: vi.fn() }))
vi.mock('../../../src/main/janus/maintenance/service', () => ({ blueprintMaintenanceService: { proposeForConversation, invalidateConversationProposal } }))

const repairs = vi.hoisted(() => ({ claim: vi.fn(), prompt: vi.fn(() => 'Fix selected Note only.'), continuation: vi.fn(), recordExecution: vi.fn(), finish: vi.fn(), fail: vi.fn((id, error, cancelled) => ({ id, phase: cancelled ? 'cancelled' : 'failed', error: String(error) })) }))
vi.mock('../../../src/main/blueprint/review/runtime', () => ({ blueprintReviewRuntime: () => ({ repairs }) }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/janusx-test' } }))
vi.mock('../../../src/main/knowledge/context-service', () => ({
  knowledgeContextService: { search, searchWithUser },
}))
vi.mock('../../../src/main/knowledge/memory-access', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/main/knowledge/memory-access')>(),
  recordUserMemoryAccessBestEffort: recordAccess,
  recordProjectMemoryAccessBestEffort: recordProjectAccess,
}))
vi.mock('../../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: { capture },
}))
// Engineering capture now passes through captureEngineeringUserMemory, which gates on
// memoryDomainPolicy().inferEngineeringHabits (default false). Opt in so the gate is not
// what the assertions are actually about.
vi.mock('../../../src/main/knowledge/memory-domain-policy', () => ({
  memoryDomainPolicy: async () => ({
    project: false, personal: true, capturePersonal: true,
    inferEngineeringHabits: true, recallPersonal: true, episodeTtlDays: 30,
  }),
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
    listModels: vi.fn(async () => []),
    resolveModelMetadata: vi.fn(async () => ({ effectiveContextWindow: 16384, maxOutputTokens: 4096 })),
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

import { abortChatStream, answerChatQuestion, gateFromToolAllowlist, handleChatStream, prepareJanusChatRecall, steerChatStream } from '../../../src/main/llm/chat-orchestrator'
import { llmService } from '../../../src/main/llm/LlmService'

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
  it('switches WorkflowX mode without resolving a provider or starting a model stream', async () => {
    vi.mocked(llmService.getLanguageModel).mockClear()
    streamText.mockClear()
    const reply = vi.fn()
    await handleChatStream({ reply } as never, { requestId: 'mode-switch', providerId: '', sourceTag: 'janus-chat', messages: [{ role: 'user', content: '/xflow' }] })
    expect(llmService.getLanguageModel).not.toHaveBeenCalled()
    expect(streamText).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith('llm:chat:delta', expect.objectContaining({ delta: 'WorkflowX: xflow' }))
    expect(reply).toHaveBeenCalledWith('llm:chat:done', { requestId: 'mode-switch' })
  })
  it('shares proposal turn ownership, consumes steering once and streams the result through chat events', async () => {
    let release!: () => void
    proposeForConversation.mockReset().mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return { id: 'task', phase: 'first proposal' }
    }).mockResolvedValue({ id: 'task', phase: 'revised proposal' })
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
    expect(reply).toHaveBeenCalledWith('llm:chat:agent-event', expect.objectContaining({ type: 'maintenance_result', task: { id: 'task', phase: 'revised proposal' } }))
    const types = reply.mock.calls.filter(call => call[0] === 'llm:chat:agent-event').map(call => call[1].type)
    expect(types.indexOf('maintenance_result')).toBeLessThan(types.indexOf('stream_end'))
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
    vi.mocked(llmService.getProviderSettings).mockReset().mockResolvedValue({ modelId: 'test-model' } as never)
    vi.mocked(llmService.resolveModelMetadata).mockReset().mockResolvedValue({ effectiveContextWindow: 16384, maxOutputTokens: 4096 } as never)
    search.mockReset().mockResolvedValue(emptyResult)
    searchWithUser.mockReset().mockImplementation(input => search(input))
    recordAccess.mockReset().mockResolvedValue(undefined)
    recordProjectAccess.mockReset().mockResolvedValue(undefined)
    capture.mockReset().mockResolvedValue(undefined)
    streamText.mockReset()
    getSession.mockReset()
    executeFunctionCall.mockReset()
    capturePersonTurn.mockReset().mockResolvedValue(undefined)
    capturePersonEpisode.mockReset().mockResolvedValue(undefined)
  })

  it('passes detected maximum output to inference despite an old context-only setting', async () => {
    vi.mocked(llmService.getProviderSettings).mockResolvedValue({ modelId: 'test-model', extra: { chatModelLimits: { 'test-model': { contextWindow: 1000000 } } } } as never)
    vi.mocked(llmService.resolveModelMetadata).mockResolvedValue({ effectiveContextWindow: 1048576, maxOutputTokens: 65536 } as never)
    immediateStream('Acknowledged.')
    const reply = vi.fn()
    await handleChatStream({ reply } as never, { requestId: 'automatic-output', providerId: 'p', messages: userMessages })
    expect(streamText).toHaveBeenCalledOnce()
    expect(streamText.mock.calls[0][0]).toMatchObject({ maxTokens: 65536 })
    expect(reply).toHaveBeenCalledWith('llm:chat:done', { requestId: 'automatic-output' })
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

  it('binds engineering and personal captures to host speaker, event, and conversation', async () => {
    immediateStream('personal answer')
    await handleChatStream({ reply: vi.fn() } as never, {
      requestId: 'evidence-turn', conversationId: 'evidence-conversation',
      workspaceId: 'evidence-project', workspacePath: 'C:/evidence-project',
      messages: userMessages, providerId: 'provider-a', sourceTag: 'janus-chat', domain: 'personal',
    } as never)
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'user', sessionId: 'evidence-conversation' }),
      { speaker: 'user', sourceEventId: 'evidence-turn' },
    )
    // Engineering activity contributes only opted-in personal habits, never assistant
    // turns and never project facts — see knowledge/engineering-user-memory.ts.
    expect(capture).not.toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'assistant' }),
      expect.objectContaining({ speaker: 'assistant' }),
    )
    await handleChatStream({ reply: vi.fn() } as never, {
      requestId: 'personal-evidence-turn', conversationId: 'personal-evidence-conversation',
      messages: userMessages, providerId: 'provider-a', sourceTag: 'janus-chat', domain: 'personal',
    } as never)
    expect(capturePersonTurn).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'personal-evidence-conversation', correlationId: 'personal-evidence-turn',
    }))
  })

  it.each(['personal', 'project', 'failure'] as const)('records delivered context at the production stream boundary: %s', async mode => {
    const section = '[janus-user-memory]\nPrefer pnpm\n[/janus-user-memory]'
    const delivery = { capturedAt: Date.now(), section, facts: [{ id: 'personal', hash: 'snapshot' }] }
    // Project memory delivery was retired with the memory reorientation, so only the
    // personal receipt is left to record at the stream boundary.
    search.mockResolvedValue({ ...emptyResult, compactContext: 'Engineering memory' })
    searchWithUser.mockResolvedValue({ ...emptyResult, compactContext: 'Engineering memory\n\n' + section, userMemoryDelivery: delivery })
    streamText.mockImplementation(async () => {
      expect(recordAccess).not.toHaveBeenCalled()
      return { textStream: (async function* () {
        expect(recordAccess).not.toHaveBeenCalled()
        if (mode === 'failure') throw new Error('provider unavailable')
        yield 'answer'
      })() }
    })
    await handleChatStream({ reply: vi.fn() } as never, {
      requestId: `delivery-${mode}`, conversationId: `delivery-${mode}`,
      workspaceId: 'workspace',
      messages: userMessages, providerId: 'provider-a', sourceTag: 'janus-chat', domain: mode === 'project' ? 'project' : 'personal',
    } as never)
    if (mode === 'personal') {
      expect(recordAccess).toHaveBeenCalledExactlyOnceWith(delivery, `delivery-${mode}`, expect.any(AbortSignal))
    } else expect(recordAccess).not.toHaveBeenCalled()
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

  it('manual compaction emits a checkpoint without adding a reply or running tools', async () => {
    const messages = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `Decision ${index}` }))
    const original = JSON.stringify(messages)
    immediateStream('## Goal\nPreserve decisions.\n## Progress\nReviewed.\n## Next Steps\nContinue.')
    const reply = vi.fn()
    await handleChatStream({ reply } as never, {
      requestId: 'manual-compact', conversationId: 'manual-compact', providerId: 'provider-a',
      messages, compact: { keepRecentUnits: 4 }, domain: 'personal',
    })
    const state = reply.mock.calls.find(([, payload]) => payload.type === 'context_state' && payload.state.phase === 'compacted')?.[1].state
    expect(state?.checkpoint.coveredMessages).toBe(10)
    expect(streamText).toHaveBeenCalledTimes(1)
    expect(streamText.mock.calls[0][0].tools).toBeUndefined()
    expect(executeFunctionCall).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith('llm:chat:done', { requestId: 'manual-compact' })
    expect(JSON.stringify(messages)).toBe(original)
  })
})

describe('dual-gate tool surface (launch assistant)', () => {
  it('blocks calls outside the allowlist and feeds the reason back to the model', async () => {
    const gate = gateFromToolAllowlist(['workspace.list', 'workspace.read', 'launch-config.apply'])
    const blocked = await gate!({ name: 'command.run', arguments: {} })
    expect(blocked).toEqual({ block: true, reason: expect.stringContaining('command.run') })
    const future = await gate!({ name: 'mcp_status', arguments: {} })
    expect(future).toEqual({ block: true, reason: expect.stringContaining('mcp_status') })
  })

  it('matches allowlist names loosely like the offered-tool normalizer', async () => {
    const gate = gateFromToolAllowlist(['workspace.list'])
    expect(await gate!({ name: 'workspace_list', arguments: {} })).toBeUndefined()
    expect(await gate!({ name: 'Workspace.List', arguments: {} })).toBeUndefined()
  })

  it('delegates listed calls to the host policy gate and keeps its refusal', async () => {
    const policy = vi.fn(async () => ({ block: true as const, reason: 'lease changed' }))
    const gate = gateFromToolAllowlist(['workspace.read'], policy)
    expect(await gate!({ name: 'workspace.read', arguments: { path: 'a' } })).toEqual({ block: true, reason: 'lease changed' })
    expect(policy).toHaveBeenCalledWith({ name: 'workspace.read', arguments: { path: 'a' } })
    expect(await gate!({ name: 'git.push', arguments: {} })).toEqual({ block: true, reason: expect.stringContaining('git.push') })
    expect(policy).toHaveBeenCalledTimes(1)
  })

  it('without an allowlist the policy gate stands alone and legacy turns stay unchanged', async () => {
    expect(gateFromToolAllowlist(undefined)).toBeUndefined()
    const policy = vi.fn(async () => undefined)
    expect(gateFromToolAllowlist(undefined, policy)).toBe(policy)
  })
})

// Twin: a repair stays subscribed beyond facade stream_end until host review completes.
it('runs the dedicated continuation before closing the repair stream', async () => {
  const id = 'repair-continuation', root = '/tmp/repair'
  repairs.claim.mockResolvedValue({ id, context: { workspacePath: root, repoId: 'repo', branch: 'main' }, intent: 'repair', kind: 'suggestions', noteId: 'note', uri: 'note://repo/note', path: '.agents/notes/topic.md', title: 'Target', summaries: ['Issue'] })
  repairs.continuation.mockReset().mockResolvedValueOnce('Continue the authorized correction using note.repair_write.').mockResolvedValue(undefined)
  repairs.recordExecution.mockClear(); streamText.mockClear()
  getSession.mockReturnValue({ sessionId: 'repair-session', workspace: { workspaceId: 'repair-ws', workspaceRoot: root }, status: 'running' })
  immediateStream('Analysis only.')
  repairs.finish.mockResolvedValue({ id, phase: 'unchanged', changed: false, error: 'No write submitted' })
  const reply = vi.fn()
  await handleChatStream({ reply } as never, { requestId: id, conversationId: id, providerId: 'p', domain: 'project', sourceTag: 'janus-chat', noteRepairId: id, messages: userMessages, workspaceResources: [{ agentSessionId: 'repair-session', workspaceId: 'repair-ws', workspacePath: root, workspaceName: 'Fixture' }] })
  expect(streamText).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(streamText.mock.calls[1])).toContain('using note.repair_write')
  expect(repairs.recordExecution).toHaveBeenLastCalledWith(id, 2, expect.stringContaining('Analysis only.'), [])
  const events = reply.mock.calls.filter(([channel]) => channel === 'llm:chat:agent-event').map(([, event]) => event)
  expect(events.filter(event => event.type === 'stream_end')).toHaveLength(1)
  expect(events.findIndex(event => event.type === 'note_repair' && event.update.phase === 'unchanged')).toBeLessThan(events.findIndex(event => event.type === 'stream_end'))
})

it('keeps repair streaming through host verification, then publishes the outcome before stream_end', async () => {
  repairs.finish.mockReset(); repairs.continuation.mockReset().mockResolvedValue(undefined)
  const plan = { id: 'repair-plan', context: { workspacePath: '/tmp/repair', repoId: 'repo', branch: 'main' }, intent: 'repair', kind: 'suggestions', noteId: 'note', uri: 'note://repo/note', path: '.agents/notes/topic.md', title: 'Target', summaries: ['Issue'] }
  repairs.claim.mockResolvedValue(plan)
  getSession.mockReturnValue({ sessionId: 'repair-session', workspace: { workspaceId: 'repair-ws', workspaceRoot: '/tmp/repair' }, status: 'running' })
  immediateStream('Adjusted the Note.')
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  repairs.finish.mockImplementation(async () => { await gate; return { id: plan.id, phase: 'resolved', changed: true, resolved: 1, remaining: 0 } })
  const reply = vi.fn()
  const turn = handleChatStream({ reply } as never, { requestId: 'repair-host-verify', conversationId: 'repair-conv', providerId: 'p', domain: 'project', sourceTag: 'janus-chat', noteRepairId: plan.id, messages: userMessages, workspaceResources: [{ agentSessionId: 'repair-session', workspaceId: 'repair-ws', workspacePath: '/tmp/repair', workspaceName: 'Fixture' }] })
  await vi.waitFor(() => expect(repairs.finish).toHaveBeenCalled())
  expect(reply.mock.calls.some(([, event]) => event?.type === 'stream_end')).toBe(false)
  expect(reply.mock.calls.some(([, event]) => event?.type === 'note_repair' && event.update.phase === 'reviewing')).toBe(true)
  finish(); await turn
  const events = reply.mock.calls.filter(([channel]) => channel === 'llm:chat:agent-event').map(([, event]) => event)
  expect(events.findIndex(event => event.type === 'note_repair' && event.update.phase === 'resolved')).toBeLessThan(events.findIndex(event => event.type === 'stream_end'))
  expect(events.filter(event => event.type === 'stream_end')).toHaveLength(1)
})

it.each(['failure', 'cancel'] as const)('publishes repair %s with write evidence before ending the host stream', async mode => {
  const id = 'repair-' + mode, root = '/tmp/repair'
  repairs.claim.mockResolvedValue({ id, context: { workspacePath: root, repoId: 'repo', branch: 'main' }, intent: 'repair', kind: 'suggestions', noteId: 'note', uri: 'note://repo/note', path: '.agents/notes/topic.md', title: 'Target', summaries: ['Issue'] })
  repairs.finish.mockReset()
  repairs.finish.mockImplementation(async (_id, signal: AbortSignal) => {
    if (mode === 'failure') throw new Error('Review unavailable')
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }))
  })
  repairs.fail.mockImplementation((id, error, cancelled) => ({ id, phase: cancelled ? 'cancelled' : 'failed', changed: true, error: String(error) }))
  getSession.mockReturnValue({ sessionId: 'repair-session', workspace: { workspaceId: 'repair-ws', workspaceRoot: root }, status: 'running' })
  immediateStream('Note changed.')
  const reply = vi.fn()
  const turn = handleChatStream({ reply } as never, { requestId: id, conversationId: id, providerId: 'p', domain: 'project', sourceTag: 'janus-chat', noteRepairId: id, messages: userMessages, workspaceResources: [{ agentSessionId: 'repair-session', workspaceId: 'repair-ws', workspacePath: root, workspaceName: 'Fixture' }] })
  if (mode === 'cancel') { await vi.waitFor(() => expect(repairs.finish).toHaveBeenCalled()); abortChatStream(id) }
  await turn
  const events = reply.mock.calls.filter(([channel]) => channel === 'llm:chat:agent-event').map(([, event]) => event)
  const terminal = events.findIndex(event => event.type === 'note_repair' && event.update.phase === (mode === 'cancel' ? 'cancelled' : 'failed'))
  expect(terminal).toBeGreaterThanOrEqual(0); expect(events[terminal].update.changed).toBe(true)
  expect(terminal).toBeLessThan(events.findIndex(event => event.type === 'stream_end'))
  expect(events.filter(event => event.type === 'stream_end')).toHaveLength(1)
})
