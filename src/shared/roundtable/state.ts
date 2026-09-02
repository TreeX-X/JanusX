import type { RoundtableEvent, RoundtableEventEnvelope, RoundtableState } from './events'

export const EMPTY_ROUNDTABLE_STATE: RoundtableState = {
  phase: 'idle', roundNumber: 0, participants: [], cards: [], errors: [], facts: [], eventIds: [], version: 0, workspaceResources: [], workspaceContextFiles: [],
}

export function reduceRoundtableEvent(state: RoundtableState, event: RoundtableEventEnvelope | RoundtableEvent): RoundtableState {
  const eventId = 'eventId' in event ? event.eventId : undefined
  if (eventId && state.eventIds.includes(eventId)) return state
  const next = { ...state, cards: [...state.cards], errors: [...state.errors], facts: [...state.facts], eventIds: [...state.eventIds], version: state.version + 1 }
  if (eventId) next.eventIds.push(eventId)
  switch (event.type) {
    case 'session:created': return { ...next, phase: 'running', sessionId: event.sessionId, roundNumber: 0 }
    case 'round:started': return { ...next, phase: 'running', sessionId: event.sessionId, roundNumber: event.roundNumber, userInput: event.userInput }
    case 'agent:result': {
      const index = next.cards.findIndex((card) => card.id === event.card.id)
      if (index >= 0) next.cards[index] = event.card
      else next.cards.push(event.card)
      return next
    }
    case 'agent:error': return { ...next, errors: [...next.errors, `${event.agentId}: ${event.error}`] }
    case 'round:awaiting-user': return { ...next, phase: 'awaiting-user', roundNumber: event.roundNumber, sessionId: event.sessionId }
    case 'session:ended': return { ...next, phase: 'ended', sessionId: event.sessionId }
    default: return next
  }
}

export function replayRoundtableEvents(events: RoundtableEventEnvelope[]): RoundtableState {
  return events.reduce(reduceRoundtableEvent, EMPTY_ROUNDTABLE_STATE)
}
