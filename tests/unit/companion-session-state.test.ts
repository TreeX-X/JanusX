import { describe, expect, it } from 'vitest'
import { CompanionSessionState } from '../../src/main/companion/session-state'

describe('CompanionSessionState', () => {
  it('tracks approvals from resolved hooks and clears them on completion, exit, and shutdown', () => {
    const state = new CompanionSessionState()
    state.registerTerminal({ terminalId: 'term-1', engine: 'codex', workspaceId: 'ws', cwd: 'C:/repo' })
    state.handleHookPayload({ source: 'codex', event: 'PermissionRequest', terminalId: 'term-1' })
    expect(state.hasPendingApproval('term-1')).toBe(true)
    state.handleHookPayload({ source: 'codex', event: 'Stop', terminalId: 'term-1' })
    expect(state.hasPendingApproval('term-1')).toBe(false)
    state.setPendingApproval('term-1')
    state.unregisterTerminal('term-1')
    expect(state.hasPendingApproval('term-1')).toBe(false)
    expect(state.getTerminal('term-1')).toBeUndefined()
    state.clear()
  })
})
