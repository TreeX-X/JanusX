import { describe, expect, it } from 'vitest'
import { EMPTY_AGENT_WORK_PROJECTION, reconcilePendingUserMessages, reduceAgentWorkEvent } from '../../src/renderer/src/components/janus/agentWorkProjection'

const event = (value: any, id: string) => ({ ...value, eventId: id, occurredAt: '2026-01-01T00:00:00Z' })

describe('roundtable agent work projection', () => {
  it('moves an agent from queue to working to completed card', () => {
    let state = reduceAgentWorkEvent(EMPTY_AGENT_WORK_PROJECTION, event({ type: 'agent:queued', sessionId: 's', roundId: 'r', agentId: 'a', role: 'refiner' }, '1'))
    state = reduceAgentWorkEvent(state, event({ type: 'agent:working', sessionId: 's', roundId: 'r', agentId: 'a', role: 'refiner' }, '2'))
    state = reduceAgentWorkEvent(state, event({ type: 'agent:result', sessionId: 's', roundId: 'r', card: { id: 'c', sessionId: 's', roundId: 'r', agentId: 'a', role: 'refiner', title: 'Result', status: 'completed', summary: 'Done', createdAt: '2026-01-01', updatedAt: '2026-01-01', sourceEventIds: ['3'] } }, '3'))
    expect(state.queuedAgents).toEqual([])
    expect(state.workingAgents).toEqual([])
    expect(state.cards[0].summary).toBe('Done')
  })

  it('clears working state and records failures', () => {
    const queued = reduceAgentWorkEvent(EMPTY_AGENT_WORK_PROJECTION, event({ type: 'agent:working', sessionId: 's', roundId: 'r', agentId: 'a', role: 'challenger' }, '1'))
    const failed = reduceAgentWorkEvent(queued, event({ type: 'agent:error', sessionId: 's', roundId: 'r', agentId: 'a', role: 'challenger', error: 'timeout' }, '2'))
    expect(failed.workingAgents).toEqual([])
    expect(failed.errors).toEqual({ a: 'timeout' })
  })

  it('tracks workspace tool calls from start to completion', () => {
    let state = reduceAgentWorkEvent(EMPTY_AGENT_WORK_PROJECTION, event({ type: 'workspace:tool-started', sessionId: 's', roundId: 'r', agentId: 'a', toolCallId: 't1', toolName: 'workspace.read', workspaceId: 'w1' }, '1'))
    expect(state.toolCalls).toEqual([{ toolCallId: 't1', toolName: 'workspace.read', workspaceId: 'w1', agentId: 'a', roundId: 'r', status: 'started' }])
    state = reduceAgentWorkEvent(state, event({ type: 'workspace:tool-completed', sessionId: 's', roundId: 'r', agentId: 'a', toolCallId: 't1', toolName: 'workspace.read', workspaceId: 'w1' }, '2'))
    expect(state.toolCalls[0]?.status).toBe('completed')
  })

  it('records workspace tool failures with error codes', () => {
    let state = reduceAgentWorkEvent(EMPTY_AGENT_WORK_PROJECTION, event({ type: 'workspace:tool-started', sessionId: 's', roundId: 'r', agentId: 'a', toolCallId: 't1', toolName: 'workspace.read', workspaceId: 'w1' }, '1'))
    state = reduceAgentWorkEvent(state, event({ type: 'workspace:tool-failed', sessionId: 's', roundId: 'r', agentId: 'a', toolCallId: 't1', toolName: 'workspace.read', workspaceId: 'w1', errorCode: 'SENSITIVE_PATH', error: 'denied' }, '2'))
    expect(state.toolCalls[0]).toMatchObject({ status: 'failed', errorCode: 'SENSITIVE_PATH' })
  })

  it('drops optimistic inputs once the confirmed message arrives', () => {
    const confirmed = [{ id: 'u1', text: 'Hello', roundNumber: 1, createdAt: '2026-01-01T00:00:00.000Z' }]
    const pending = [
      { id: 'p1', content: 'Hello', roundNumber: 1, timestamp: 1 },
      { id: 'p2', content: 'Hello', roundNumber: 2, timestamp: 2 },
      { id: 'p3', content: 'Other', roundNumber: 1, timestamp: 3 },
    ]
    // Same text in a later round stays pending; only the exact round confirms.
    expect(reconcilePendingUserMessages(confirmed, pending).map((item) => item.id)).toEqual(['p2', 'p3'])
    expect(reconcilePendingUserMessages([], pending)).toHaveLength(3)
  })

  it('drops stale working agents when the round finishes without their results', () => {
    const card = { id: 'c1', sessionId: 's', roundId: 'r', agentId: 'refiner-1', role: 'refiner', title: 'Result', status: 'completed', summary: 'Done', createdAt: '2026-01-01', updatedAt: '2026-01-01', sourceEventIds: ['3'] }
    let state = reduceAgentWorkEvent(EMPTY_AGENT_WORK_PROJECTION, event({ type: 'agent:working', sessionId: 's', roundId: 'r', agentId: 'refiner-1', role: 'refiner' }, '1'))
    state = reduceAgentWorkEvent(state, event({ type: 'agent:working', sessionId: 's', roundId: 'r', agentId: 'challenger-1', role: 'challenger' }, '2'))
    state = reduceAgentWorkEvent(state, event({ type: 'agent:result', sessionId: 's', roundId: 'r', card }, '3'))
    // challenger never delivered: awaiting-user must not leave it analyzing.
    state = reduceAgentWorkEvent(state, event({ type: 'round:awaiting-user', sessionId: 's', roundId: 'r', roundNumber: 1 }, '4'))
    expect(state.workingAgents).toEqual([])
    expect(state.queuedAgents).toEqual([])
    expect(state.cards.map((item) => item.id)).toEqual(['c1'])
  })

  it('resets working agents when a new round starts and when the session ends', () => {
    let state = reduceAgentWorkEvent(EMPTY_AGENT_WORK_PROJECTION, event({ type: 'agent:queued', sessionId: 's', roundId: 'r1', agentId: 'refiner-1', role: 'refiner' }, '1'))
    state = reduceAgentWorkEvent(state, event({ type: 'agent:working', sessionId: 's', roundId: 'r1', agentId: 'refiner-1', role: 'refiner' }, '2'))
    state = reduceAgentWorkEvent(state, event({ type: 'round:started', sessionId: 's', roundId: 'r2', roundNumber: 2, trigger: 'user-advance' }, '3'))
    expect(state.workingAgents).toEqual([])
    expect(state.queuedAgents).toEqual([])
    state = reduceAgentWorkEvent(state, event({ type: 'agent:working', sessionId: 's', roundId: 'r2', agentId: 'challenger-1', role: 'challenger' }, '4'))
    state = reduceAgentWorkEvent(state, event({ type: 'session:ended', sessionId: 's' }, '5'))
    expect(state.workingAgents).toEqual([])
    expect(state.queuedAgents).toEqual([])
  })
})
