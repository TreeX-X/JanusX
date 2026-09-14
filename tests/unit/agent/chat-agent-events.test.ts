import { describe, expect, it } from 'vitest'
import { toChatAgentEvent } from '@janus-agent/chat-core'
import { EMPTY_JANUS_RUNTIME_STATE, reduceChatAgentEvent, reduceJanusRuntimeState } from '../../../src/renderer/src/components/janus/janusRuntimeState'

describe('Chat Agent events', () => {
  it('redacts argument values before a tool call reaches Chat IPC', () => {
    const event = toChatAgentEvent({
      type: 'tool_call_ready',
      requestId: 'request-1',
      call: {
        id: 'call-1',
        name: 'workspace_read',
        arguments: { path: 'src/secret.ts', apiKey: 'super-secret-value' },
      },
    })

    expect(event).toEqual({
      type: 'tool_call_ready',
      requestId: 'request-1',
      callId: 'call-1',
      toolName: 'workspace_read',
      argumentKeys: ['path', 'redacted'],
    })
    expect(JSON.stringify(event)).not.toContain('super-secret-value')
    expect(JSON.stringify(event)).not.toContain('src/secret.ts')
  })

  it('keeps one tool card through construction and Runtime execution', () => {
    let state = reduceChatAgentEvent(EMPTY_JANUS_RUNTIME_STATE, {
      type: 'tool_call_start', requestId: 'request-1', callId: 'call-1', toolName: 'workspace_read',
    })
    state = reduceChatAgentEvent(state, {
      type: 'tool_call_delta', requestId: 'request-1', callId: 'call-1', argumentDeltaLength: 12,
    })
    state = reduceChatAgentEvent(state, {
      type: 'tool_call_ready', requestId: 'request-1', callId: 'call-1', toolName: 'workspace_read', argumentKeys: ['path'],
    })
    state = reduceJanusRuntimeState(state, {
      type: 'tool-started', sessionId: 'session-1', correlationId: 'call-1', toolName: 'workspace_read', startedAt: '2026-08-27T00:00:00.000Z',
    })

    expect(state.activities).toEqual([{
      correlationId: 'call-1',
      toolName: 'workspace_read',
      status: 'running',
      summary: 'Input keys: path',
      argsDigest: 'path',
      argumentChars: 12,
    }])
  })

  it('mirrors todo snapshots wholesale and clears them on the next turn', () => {
    let state = reduceChatAgentEvent(EMPTY_JANUS_RUNTIME_STATE, {
      type: 'todo_update',
      requestId: 'request-1',
      todos: [
        { content: 'Write code', status: 'in_progress' },
        { content: 'Write tests', status: 'pending' },
      ],
    })
    expect(state.todos).toEqual([
      { content: 'Write code', status: 'in_progress' },
      { content: 'Write tests', status: 'pending' },
    ])
    state = reduceChatAgentEvent(state, { type: 'agent_start', requestId: 'request-2' })
    expect(state.todos).toEqual([])
  })

  it('tracks open mid-turn questions until they resolve', () => {
    const requested = {
      type: 'question_requested',
      requestId: 'request-1',
      callId: 'call-9',
      questions: [{ question: 'Proceed?', header: 'Confirm', options: [{ label: 'Yes' }, { label: 'No' }], multiple: false }],
      allowCustom: true,
    } as const
    let state = reduceChatAgentEvent(EMPTY_JANUS_RUNTIME_STATE, requested)
    expect(state.pendingQuestions).toHaveLength(1)
    expect(state.pendingQuestions[0]?.callId).toBe('call-9')
    state = reduceChatAgentEvent(state, {
      type: 'question_resolved', requestId: 'request-1', callId: 'call-9', status: 'answered',
    })
    expect(state.pendingQuestions).toEqual([])
  })
})
