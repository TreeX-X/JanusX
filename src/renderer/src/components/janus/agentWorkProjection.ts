import type { AgentResultCard, RoundtableEventEnvelope, RoundtableUserMessage } from '../../../../shared/roundtable/events'

export interface RoundtableToolCall {
  toolCallId: string
  toolName: string
  workspaceId: string
  agentId: string
  roundId: string
  status: 'started' | 'completed' | 'failed' | 'cancelled'
  errorCode?: string
  error?: string
}

export interface AgentWorkProjection {
  workingAgents: string[]
  queuedAgents: string[]
  cards: AgentResultCard[]
  errors: Record<string, string>
  toolCalls: RoundtableToolCall[]
}

export const EMPTY_AGENT_WORK_PROJECTION: AgentWorkProjection = {
  workingAgents: [], queuedAgents: [], cards: [], errors: {}, toolCalls: [],
}

export interface PendingUserInput {
  id: string
  content: string
  roundNumber: number
  timestamp: number
}

/**
 * Drop optimistic inputs once the matching confirmed user:message arrives.
 * (content, roundNumber) is unique per session: sends are only possible from
 * idle/awaiting-user, so the same text cannot be pending twice in one round.
 */
export function reconcilePendingUserMessages(confirmed: RoundtableUserMessage[], pending: PendingUserInput[]): PendingUserInput[] {
  return pending.filter((item) => !confirmed.some((msg) => msg.text === item.content && msg.roundNumber === item.roundNumber))
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
    toolCalls: [...projection.toolCalls],
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
    case 'round:started':
    case 'round:awaiting-user':
    case 'session:ended': {
      // Round boundary: any agent still flagged working/queued never delivered
      // a result or error for this round (lost event, restored snapshot, or a
      // remount gap). Drop the flags so the synthetic "analyzing" cards in the
      // dialog disappear instead of lingering after the round ends. Delivered
      // cards, errors and tool traces are kept as history.
      next.workingAgents = []
      next.queuedAgents = []
      return next
    }
    case 'workspace:tool-started':
      if (!next.toolCalls.some((item) => item.toolCallId === event.toolCallId)) {
        next.toolCalls.push({ toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'started' })
      }
      return next
    case 'workspace:tool-completed': {
      const index = next.toolCalls.findIndex((item) => item.toolCallId === event.toolCallId)
      const record: RoundtableToolCall = { toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'completed' }
      if (index >= 0) next.toolCalls[index] = record
      else next.toolCalls.push(record)
      return next
    }
    case 'workspace:tool-failed': {
      const index = next.toolCalls.findIndex((item) => item.toolCallId === event.toolCallId)
      const record: RoundtableToolCall = { toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'failed', errorCode: event.errorCode, error: event.error }
      if (index >= 0) next.toolCalls[index] = record
      else next.toolCalls.push(record)
      return next
    }
    case 'workspace:tool-cancelled': {
      const index = next.toolCalls.findIndex((item) => item.toolCallId === event.toolCallId)
      const record: RoundtableToolCall = { toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'cancelled' }
      if (index >= 0) next.toolCalls[index] = record
      else next.toolCalls.push(record)
      return next
    }
    default:
      return next
  }
}
