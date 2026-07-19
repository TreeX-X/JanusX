import { describe, expect, it, vi } from 'vitest'
import { rollbackTerminalCreation } from '../../src/main/companion/terminal-creation-rollback'

describe('terminal creation rollback', () => {
  it('cleans every post-PTY registration even when one cleanup throws', () => {
    const calls: string[] = []
    const operation = (name: string, fail = false) => vi.fn(() => { calls.push(name); if (fail) throw new Error(name) })
    rollbackTerminalCreation({
      clearState: operation('state'), unregisterCompanion: operation('companion'),
      unregisterHook: operation('hook', true), unregisterRecorder: operation('recorder'),
      removeRun: operation('run'), killPty: operation('pty'),
    })
    expect(calls).toEqual(['state', 'companion', 'hook', 'recorder', 'run', 'pty'])
  })
})
