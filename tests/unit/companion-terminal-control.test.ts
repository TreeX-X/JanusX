import { beforeEach, describe, expect, it, vi } from 'vitest'

const { write, getInstance } = vi.hoisted(() => ({
  write: vi.fn(),
  getInstance: vi.fn(() => ({ id: 'term-1' })),
}))
vi.mock('../../src/main/terminal/manager', () => ({ terminalManager: { write, getInstance } }))

import { CompanionSessionState } from '../../src/main/companion/session-state'
import { MainProcessTerminalControl } from '../../src/main/companion/terminal-control'

describe('MainProcessTerminalControl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates follow-up to the checkpoint-aware submit transaction', () => {
    const submitLineTransaction = vi.fn()
    const sessions = new CompanionSessionState()
    sessions.registerTerminal({ terminalId: 'term-1', engine: 'codex', workspaceId: 'ws', cwd: 'C:/repo' })
    const control = new MainProcessTerminalControl(submitLineTransaction, sessions)

    control.submitLine('term-1', 'continue')

    expect(submitLineTransaction).toHaveBeenCalledOnce()
    expect(submitLineTransaction).toHaveBeenCalledWith('term-1', 'continue')
    expect(write).not.toHaveBeenCalled()
  })

  it('uses interrupt and guarded approval keystrokes only for the requested terminal', () => {
    const sessions = new CompanionSessionState()
    sessions.registerTerminal({ terminalId: 'term-1', engine: 'codex', workspaceId: 'ws', cwd: 'C:/repo' })
    sessions.setPendingApproval('term-1')
    const control = new MainProcessTerminalControl(vi.fn(), sessions)

    control.interrupt('term-1')
    control.respondToApproval('term-1', true)

    expect(write).toHaveBeenNthCalledWith(1, 'term-1', '\x03')
    expect(write).toHaveBeenNthCalledWith(2, 'term-1', 'y\r')
    expect(control.hasPendingApproval('term-1')).toBe(false)
  })

  it('omits registered metadata when the PTY is no longer live', () => {
    const sessions = new CompanionSessionState()
    sessions.registerTerminal({ terminalId: 'term-stale', engine: 'codex', workspaceId: 'ws', cwd: 'C:/repo' })
    getInstance.mockReturnValueOnce(undefined)
    expect(new MainProcessTerminalControl(vi.fn(), sessions).listTerminals()).toEqual([])
  })
})
