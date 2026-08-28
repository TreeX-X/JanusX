import type { AgentRuntimeEvent, ApprovalRequest } from '../../../../shared/ipc/agent-runtime'
import type { ChatAgentEvent } from '../../../../shared/ipc/llm'

export type JanusToolActivityStatus = 'requested' | 'approval' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface JanusToolActivity {
  correlationId: string
  toolName: string
  status: JanusToolActivityStatus
  summary?: string
  argsDigest?: string
  argumentChars?: number
}

export interface JanusRuntimeState {
  activities: JanusToolActivity[]
  pendingApprovals: ApprovalRequest[]
}

export const EMPTY_JANUS_RUNTIME_STATE: JanusRuntimeState = { activities: [], pendingApprovals: [] }

function replaceActivity(state: JanusRuntimeState, activity: JanusToolActivity): JanusToolActivity[] {
  const previous = state.activities.find((item) => item.correlationId === activity.correlationId)
  return [
    ...state.activities.filter((item) => item.correlationId !== activity.correlationId),
    { ...previous, ...activity },
  ].slice(-8)
}

function activity(state: JanusRuntimeState, correlationId: string): JanusToolActivity | undefined {
  return state.activities.find((item) => item.correlationId === correlationId)
}

/** Reduces safe Chat Agent IPC events into the same cards used by Runtime tool events. */
export function reduceChatAgentEvent(state: JanusRuntimeState, event: ChatAgentEvent): JanusRuntimeState {
  if (event.type === 'tool_call_start') {
    return {
      ...state,
      activities: replaceActivity(state, {
        correlationId: event.callId,
        toolName: event.toolName ?? activity(state, event.callId)?.toolName ?? 'tool',
        status: 'requested',
        summary: 'Preparing tool input',
        argumentChars: 0,
      }),
    }
  }
  if (event.type === 'tool_call_delta') {
    const current = activity(state, event.callId)
    const argumentChars = (current?.argumentChars ?? 0) + event.argumentDeltaLength
    return {
      ...state,
      activities: replaceActivity(state, {
        correlationId: event.callId,
        toolName: current?.toolName ?? 'tool',
        status: 'requested',
        summary: `Preparing tool input (${argumentChars} chars)`,
        argumentChars,
      }),
    }
  }
  if (event.type === 'tool_call_ready') {
    const argsDigest = event.argumentKeys.length ? event.argumentKeys.join(', ') : undefined
    return {
      ...state,
      activities: replaceActivity(state, {
        correlationId: event.callId,
        toolName: event.toolName,
        status: 'requested',
        summary: argsDigest ? `Input keys: ${argsDigest}` : 'Tool input ready',
        argsDigest,
      }),
    }
  }
  if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update') {
    return {
      ...state,
      activities: replaceActivity(state, {
        correlationId: event.callId,
        toolName: event.toolName,
        status: 'running',
        summary: 'Executing',
      }),
    }
  }
  if (event.type === 'tool_execution_end') {
    return {
      ...state,
      activities: replaceActivity(state, {
        correlationId: event.callId,
        toolName: event.toolName,
        status: event.status,
        summary: event.status === 'completed' ? 'Completed' : 'Failed',
      }),
    }
  }
  return state
}

export function runtimeEventSessionId(event: AgentRuntimeEvent): string | null {
  if (event.type === 'session-created' || event.type === 'session-updated' || event.type === 'session-ended') return event.session.id
  if (event.type === 'approval-requested') return event.request.sessionId
  if (event.type === 'policy-decided') return event.decision.sessionId
  if ('sessionId' in event) return event.sessionId
  return event.result.sessionId
}

export function reduceJanusRuntimeState(state: JanusRuntimeState, event: AgentRuntimeEvent): JanusRuntimeState {
  if (event.type === 'session-created') return state
  if (event.type === 'session-updated') return state
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
