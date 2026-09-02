import { describe, expect, it } from 'vitest'
import { projectParchment } from '../../src/shared/roundtable/parchment'
import { EMPTY_ROUNDTABLE_STATE, reduceRoundtableEvent, replayRoundtableEvents } from '../../src/shared/roundtable/state'

const envelope = (event: any, eventId: string) => ({ ...event, eventId, occurredAt: '2026-01-01T00:00:00.000Z' })

describe('roundtable shared state', () => {
  it('replays events, keeps cards across rounds, and deduplicates event ids', () => {
    const first = envelope({ type: 'session:created', sessionId: 's1', workflowId: 'w', workflowVersion: '1' }, 'e1')
    const started = envelope({ type: 'round:started', sessionId: 's1', roundId: 'r1', roundNumber: 1, trigger: 'initial-input', userInput: 'Topic' }, 'e2')
    const card = { id: 'c1', sessionId: 's1', roundId: 'r1', agentId: 'a1', role: 'refiner', title: 'proposal', status: 'completed', summary: 'x', createdAt: '2026-01-01', updatedAt: '2026-01-01', sourceEventIds: ['e3'] }
    const result = envelope({ type: 'agent:result', sessionId: 's1', roundId: 'r1', card }, 'e3')
    const state = replayRoundtableEvents([first, started, result, result])
    expect(state.cards).toHaveLength(1)
    expect(state.userInput).toBe('Topic')
    expect(state.eventIds).toEqual(['e1', 'e2', 'e3'])
  })

  it('projects only confirmed decisions as conclusion and preserves pending items', () => {
    const state = reduceRoundtableEvent({ ...EMPTY_ROUNDTABLE_STATE, userInput: 'Topic' }, envelope({
      type: 'agent:result', sessionId: 's', roundId: 'r', card: { id: 'c', sessionId: 's', roundId: 'r', agentId: 'a', role: 'refiner', title: 'x', status: 'completed', summary: 'x', createdAt: '2026-01-01', updatedAt: '2026-01-01', sourceEventIds: [] },
    }, 'c'))
    const withFacts = { ...state, facts: [
      { id: 'd', kind: 'decision' as const, status: 'confirmed' as const, title: 'Decision', content: 'Use reducer', sourceEventIds: ['e'], updatedAt: '2026-01-01' },
      { id: 'q', kind: 'question' as const, status: 'pending-validation' as const, title: 'Question', content: 'Load test?', sourceEventIds: ['e2'], updatedAt: '2026-01-01' },
    ] }
    const parchment = projectParchment(withFacts)
    expect(parchment.conclusion).toBe('Use reducer')
    expect(parchment.unresolved.map((item) => item.id)).toEqual(['q'])
    expect(parchment.sourceEventIds).toEqual(['e', 'e2'])
  })
})
