import type { AgentRuntimeEvent, ApprovalRequest } from '../../../../shared/ipc/agent-runtime'

export type JanusToolActivityStatus = 'requested' | 'approval' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface JanusToolActivity {
  correlationId: string
  toolName: string
  status: JanusToolActivityStatus
  summary?: string
}

export interface JanusRuntimeState {
  activities: JanusToolActivity[]
  pendingApprovals: ApprovalRequest[]
}

export const EMPTY_JANUS_RUNTIME_STATE: JanusRuntimeState = { activities: [], pendingApprovals: [] }

function replaceActivity(state: JanusRuntimeState, activity: JanusToolActivity): JanusToolActivity[] {
  return [
    ...state.activities.filter((item) => item.correlationId !== activity.correlationId),
    activity,
  ].slice(-8)
}

export function runtimeEventSessionId(event: AgentRuntimeEvent): string | null {
  if (event.type === 'session-created' || event.type === 'session-ended') return event.session.id
  if (event.type === 'approval-requested') return event.request.sessionId
  if (event.type === 'policy-decided') return event.decision.sessionId
  if ('sessionId' in event) return event.sessionId
  return event.result.sessionId
}

export function reduceJanusRuntimeState(state: JanusRuntimeState, event: AgentRuntimeEvent): JanusRuntimeState {
  if (event.type === 'session-created') return state
  if (event.type === 'session-ended') return { ...state, pendingApprovals: [] }
  if (event.type === 'policy-decided') return state

  if (event.type === 'approval-requested') {
    return {
      activities: replaceActivity(state, {
        correlationId: event.request.correlationId,
        toolName: event.request.toolName,
        status: 'approval',
        summary: event.request.preview?.summary,
      }),
      pendingApprovals: [
        ...state.pendingApprovals.filter((item) => item.id !== event.request.id),
        event.request,
      ],
    }
  }

  if (event.type === 'tool-requested' || event.type === 'tool-started') {
    const correlationId = event.correlationId
    return {
      activities: replaceActivity(state, {
        correlationId,
        toolName: event.toolName,
        status: event.type === 'tool-started' ? 'running' : 'requested',
      }),
      pendingApprovals: state.pendingApprovals.filter((item) => item.correlationId !== correlationId),
    }
  }

  const status: JanusToolActivityStatus = event.type === 'tool-completed'
    ? 'completed'
    : event.type === 'tool-cancelled'
      ? 'cancelled'
      : 'failed'
  return {
    activities: replaceActivity(state, {
      correlationId: event.result.correlationId,
      toolName: event.result.toolName,
      status,
      summary: event.result.summary || event.result.error,
    }),
    pendingApprovals: state.pendingApprovals.filter((item) =>
      item.correlationId !== event.result.correlationId),
  }
}
