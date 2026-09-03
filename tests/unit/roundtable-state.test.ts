import { describe, expect, it } from 'vitest'
import { projectParchment } from '../../src/shared/roundtable/parchment'
import { EMPTY_ROUNDTABLE_STATE, ROUNDTABLE_CHECKPOINT_VERSION, markInterrupted, migrateRoundtableState, reduceRoundtableEvent, replayRoundtableEvents } from '../../src/shared/roundtable/state'

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

  it('projects only confirmed decisions as conclusion and preserves pending items', () => {    const state = reduceRoundtableEvent({ ...EMPTY_ROUNDTABLE_STATE, userInput: 'Topic' }, envelope({
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

  it('exposes empty pending and conflicts on the legacy projection', () => {
    const parchment = projectParchment({ ...EMPTY_ROUNDTABLE_STATE, userInput: 'Topic' })
    expect(parchment.humanReadable.pending).toEqual([])
    expect(parchment.humanReadable.conflicts).toEqual([])
    expect(parchment.humanReadable.draft).toBe(true)
  })

  it('prefers the latest host draft for the human-readable parchment', () => {    const state = {
      ...EMPTY_ROUNDTABLE_STATE,
      userInput: 'Topic',
      facts: [
        { id: 'd', kind: 'decision' as const, status: 'confirmed' as const, title: 'Decision', content: 'Use reducer', sourceEventIds: ['e'], updatedAt: '2026-01-01' },
      ],
      hostDrafts: [
        {
          roundNumber: 1, final: false, conclusion: 'Adopt signals', decisions: ['Adopt signals'],
          evidence: [], pending: ['Validate cost'], conflicts: [{ id: 'c1', topic: 'Cost debate', factIds: [], status: 'open' as const, sourceEventIds: [] }],
          risks: [], actions: [], sourceEventIds: ['h1'], createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    const parchment = projectParchment(state)
    expect(parchment.conclusion).toBe('Adopt signals')
    expect(parchment.humanReadable).toMatchObject({
      conclusion: 'Adopt signals',
      decisions: ['Adopt signals'],
      pending: ['Validate cost'],
      draft: true,
    })
    expect(parchment.humanReadable.conflicts).toEqual([{ topic: 'Cost debate', status: 'open' }])
    // Fact pool stays intact beside the draft.
    expect(parchment.decisions.map((item) => item.id)).toEqual(['d'])
  })

  it('records user messages once across replays and id retries', () => {
    const message = { id: 'u1', text: 'Hello roundtable', roundNumber: 1, createdAt: '2026-01-01T00:00:00.000Z' }
    const first = envelope({ type: 'user:message', sessionId: 's', message }, 'e1')
    const duplicateEvent = envelope({ type: 'user:message', sessionId: 's', message }, 'e1')
    const retryId = envelope({ type: 'user:message', sessionId: 's', message }, 'e2')
    const state = replayRoundtableEvents([first, duplicateEvent, retryId])
    expect(state.userMessages).toHaveLength(1)
    expect(state.userMessages[0]).toMatchObject({ id: 'u1', text: 'Hello roundtable', sourceEventId: 'e1' })
  })

  it('migrates legacy snapshots missing newer fields', () => {
    expect(ROUNDTABLE_CHECKPOINT_VERSION).toBe(1)
    const migrated = migrateRoundtableState({ phase: 'awaiting-user', sessionId: 's', roundNumber: 2 })
    expect(migrated).toMatchObject({ phase: 'awaiting-user', sessionId: 's', roundNumber: 2 })
    expect(migrated.userMessages).toEqual([])
    expect(migrated.hostDrafts).toEqual([])
    expect(migrated.workspaceEvidenceRefs).toEqual([])
    expect(migrateRoundtableState(null)).toMatchObject({ phase: 'idle', roundNumber: 0 })
  })

  it('demotes interrupted running snapshots without fabricating history', () => {
    const running = { ...EMPTY_ROUNDTABLE_STATE, phase: 'running' as const, sessionId: 's', roundNumber: 2 }
    const resumed = markInterrupted(running)
    expect(resumed.phase).toBe('awaiting-user')
    expect(resumed.roundNumber).toBe(2)
    expect(resumed.errors).toHaveLength(1)
    expect(markInterrupted({ ...running, phase: 'awaiting-user' }).errors).toEqual([])
  })
})
