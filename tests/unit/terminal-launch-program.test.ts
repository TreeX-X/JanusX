import { describe, expect, it } from 'vitest'
import {
  isTerminalPreset,
  resolveTerminalLaunchCommand,
  resolveTerminalLaunchProgram,
} from '../../src/shared/terminalLaunch'

describe('resolveTerminalLaunchProgram', () => {
  it('returns direct CLI program for agent presets', () => {
    expect(resolveTerminalLaunchProgram('claude')).toEqual({ command: 'claude', args: [] })
    expect(resolveTerminalLaunchProgram('codex')).toEqual({ command: 'codex', args: [] })
    expect(resolveTerminalLaunchProgram('opencode')).toEqual({ command: 'opencode', args: [] })
    expect(resolveTerminalLaunchProgram('janus')).toEqual({ command: 'janus', args: ['tui'] })
  })

  it('returns undefined for shell preset', () => {
    expect(resolveTerminalLaunchProgram('shell')).toBeUndefined()
    expect(resolveTerminalLaunchCommand('shell')).toBeUndefined()
  })

  it('recognizes the janus preset and its auto command', () => {
    expect(isTerminalPreset('janus')).toBe(true)
    expect(isTerminalPreset('unknown')).toBe(false)
    expect(resolveTerminalLaunchCommand('janus')).toBe('janus tui')
  })

  it('accepts custom command/args input', () => {
    expect(
      resolveTerminalLaunchProgram({ command: 'codex', args: ['--search'] }),
    ).toEqual({ command: 'codex', args: ['--search'] })
  })
})
