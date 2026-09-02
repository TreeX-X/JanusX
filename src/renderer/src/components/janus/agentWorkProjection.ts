import type { AgentResultCard, RoundtableEventEnvelope } from '../../../../shared/roundtable/events'

export interface AgentWorkProjection {
  workingAgents: string[]
  queuedAgents: string[]
  cards: AgentResultCard[]
  errors: Record<string, string>
}

export const EMPTY_AGENT_WORK_PROJECTION: AgentWorkProjection = {
  workingAgents: [], queuedAgents: [], cards: [], errors: {},
}

export function reduceAgentWorkEvent(
  projection: AgentWorkProjection,
  event: RoundtableEventEnvelope,
): AgentWorkProjection {
  const next = {
    workingAgents: [...projection.workingAgents],
    queuedAgents: [...projection.queuedAgents],
    cards: [...projection.cards],
    errors: { ...projection.errors },
  }
  const remove = (items: string[], id: string) => items.filter((item) => item !== id)
  switch (event.type) {
    case 'agent:queued':
      if (!next.queuedAgents.includes(event.agentId)) next.queuedAgents.push(event.agentId)
      return next
    case 'agent:working':
      next.queuedAgents = remove(next.queuedAgents, event.agentId)
      if (!next.workingAgents.includes(event.agentId)) next.workingAgents.push(event.agentId)
      return next
    case 'agent:result':
      next.workingAgents = remove(next.workingAgents, event.card.agentId)
      next.queuedAgents = remove(next.queuedAgents, event.card.agentId)
      next.cards = [...next.cards.filter((card) => card.id !== event.card.id), event.card]
      return next
    case 'agent:error':
      next.workingAgents = remove(next.workingAgents, event.agentId)
      next.queuedAgents = remove(next.queuedAgents, event.agentId)
      next.errors[event.agentId] = event.error
      return next
    default:
      return next
  }
}
