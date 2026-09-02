import { describe, expect, it } from 'vitest'
import { EMPTY_AGENT_WORK_PROJECTION, reduceAgentWorkEvent } from '../../src/renderer/src/components/janus/agentWorkProjection'

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
})
