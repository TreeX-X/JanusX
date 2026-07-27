import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEvent, ApprovalRequest, ToolResult } from '../../src/shared/ipc/agent-runtime'
import {
  EMPTY_JANUS_RUNTIME_STATE,
  reduceJanusRuntimeState,
  runtimeEventSessionId,
} from '../../src/renderer/src/components/janus/janusRuntimeState'

const approval: ApprovalRequest = {
  id: 'approval-1', sessionId: 'session-1', workspaceId: 'workspace-1', toolName: 'workspace.edit',
  input: {}, correlationId: 'call-1', evidenceConfidence: 'medium', actionRisk: 'write',
  approvalPolicy: 'per-action', reasonCode: 'ACTION_REQUIRES_APPROVAL', createdAt: 'now',
}

const result: ToolResult = {
  workspaceId: 'workspace-1', sessionId: 'session-1', correlationId: 'call-1', toolName: 'workspace.edit',
  status: 'completed', startedAt: 'now', completedAt: 'now', durationMs: 1, summary: 'Changed one file',
}

describe('Janus runtime activity state', () => {
  it('tracks approval, running and completion as one tool activity', () => {
    let state = reduceJanusRuntimeState(EMPTY_JANUS_RUNTIME_STATE, { type: 'approval-requested', request: approval })
    expect(state.pendingApprovals).toEqual([approval])
    expect(state.activities[0].status).toBe('approval')

    state = reduceJanusRuntimeState(state, {
      type: 'tool-started', sessionId: 'session-1', correlationId: 'call-1', toolName: 'workspace.edit', startedAt: 'now',
    })
    expect(state.pendingApprovals).toEqual([])
    expect(state.activities[0].status).toBe('running')

    state = reduceJanusRuntimeState(state, { type: 'tool-completed', result })
    expect(state.activities).toEqual([expect.objectContaining({ status: 'completed', summary: 'Changed one file' })])
  })

  it('extracts session identity from each event shape', () => {
    const events: AgentRuntimeEvent[] = [
      { type: 'approval-requested', request: approval },
      { type: 'tool-requested', sessionId: 'session-1', correlationId: 'call-1', toolName: 'workspace.read' },
      { type: 'tool-completed', result },
    ]
    expect(events.map(runtimeEventSessionId)).toEqual(['session-1', 'session-1', 'session-1'])
  })
})
