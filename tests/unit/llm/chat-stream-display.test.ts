import { describe, expect, it } from 'vitest'
import { toChatStreamDisplay } from '../../../src/main/llm/chat-stream-display'
import { EMPTY_JANUS_RUNTIME_STATE, reduceChatAgentEvent, reduceJanusRuntimeState } from '../../../src/renderer/src/components/janus/janusRuntimeState'

const call = { id: 'call-1', name: 'command_run', arguments: { program: 'npm', args: ['test'], env: { apiKey: 'private-value' } } }

describe('chat stream display adapter', () => {
  it('projects allowlisted arguments and redacts nested results before IPC', () => {
    const ready = toChatStreamDisplay({ type: 'tool_call_ready', requestId: 'r1', call })!
    expect(JSON.stringify(ready)).toContain('npm')
    expect(JSON.stringify(ready)).not.toContain('private-value')
    const result = toChatStreamDisplay({
      type: 'tool_execution_update', requestId: 'r1', call,
      partialResult: { stdout: '\u001b[31mhello\u001b[0m', password: 'secret-value' },
    })!
    expect(JSON.stringify(result)).toContain('hello')
    expect(JSON.stringify(result)).toContain('[REDACTED]')
    expect(JSON.stringify(result)).not.toContain('secret-value')
    expect(JSON.stringify(result)).not.toContain('\\u001b')
  })

  it('bounds output and keeps failed command output visible', () => {
    const event = toChatStreamDisplay({
      type: 'tool_execution_end', requestId: 'r1', call, isError: false,
      result: { content: 'command failed', details: { output: { stdout: 'x'.repeat(20000), exitCode: 1 } } },
    })!
    expect(event.type).toBe('tool_display')
    if (event.type !== 'tool_display') throw new Error('wrong event')
    expect(event.status).toBe('failed')
    expect(event.resultDigest!.length).toBeLessThanOrEqual(12000)
    expect(event.resultDigest).toContain('[output truncated]')
    expect(event.errorDetail).toBe('command failed')
  })

  it('merges display updates with lifecycle and runtime events without duplicate cards', () => {
    let state = reduceChatAgentEvent(EMPTY_JANUS_RUNTIME_STATE, {
      type: 'tool_call_ready', requestId: 'r1', callId: call.id, toolName: call.name, argumentKeys: ['program', 'args'],
    })
    state = reduceChatAgentEvent(state, toChatStreamDisplay({ type: 'tool_call_ready', requestId: 'r1', call })!)
    state = reduceJanusRuntimeState(state, {
      type: 'tool-started', sessionId: 's1', correlationId: call.id, toolName: call.name, startedAt: '2026-09-09T00:00:00Z',
    })
    state = reduceChatAgentEvent(state, toChatStreamDisplay({ type: 'tool_execution_update', requestId: 'r1', call, partialResult: 'first output' })!)
    expect(state.activities[0]).toMatchObject({ status: 'running', resultDigest: 'first output' })
    state = reduceChatAgentEvent(state, { type: 'tool_execution_end', requestId: 'r1', callId: call.id, toolName: call.name, status: 'completed' })
    state = reduceChatAgentEvent(state, toChatStreamDisplay({ type: 'tool_execution_end', requestId: 'r1', call, isError: false, result: { content: 'final output' } })!)
    expect(state.activities).toHaveLength(1)
    expect(state.activities[0]).toMatchObject({ status: 'completed', resultDigest: 'final output' })
    expect(state.activities[0].argsDigest).toContain('npm')
  })

  it('does not duplicate text or lifecycle delivery', () => {
    expect(toChatStreamDisplay({ type: 'text_delta', requestId: 'r1', delta: 'hello' })).toBeUndefined()
    expect(toChatStreamDisplay({ type: 'stream_start', requestId: 'r1' })).toBeUndefined()
  })
})
