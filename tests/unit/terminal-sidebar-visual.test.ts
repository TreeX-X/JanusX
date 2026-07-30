import { describe, expect, it } from 'vitest'
import type { Terminal } from '../../src/renderer/src/types'
import { getTerminalStatusVisual, summarizeTerminalActivity } from '../../src/renderer/src/lib/terminal-sidebar-visual'

function terminal(id: string, status: Terminal['status']): Terminal {
  return {
    id,
    workspaceId: 'workspace-1',
    name: id,
    preset: 'shell',
    cwd: 'C:/workspace',
    status,
    createdAt: 1,
  }
}

describe('terminal sidebar visuals', () => {
  it('summarizes total, running, and error terminals for the workspace badge', () => {
    expect(summarizeTerminalActivity([
      terminal('one', 'running'),
      terminal('two', 'wait'),
      terminal('three', 'error'),
    ])).toEqual({ total: 3, running: 1, errors: 1 })
  })

  it('uses localized labels and distinct colors for every terminal state', () => {
    expect(getTerminalStatusVisual('running').label).toBe('运行中')
    expect(getTerminalStatusVisual('wait').label).toBe('等待')
    expect(getTerminalStatusVisual('error').label).toBe('异常')
    expect(new Set(['running', 'wait', 'error'].map((status) =>
      getTerminalStatusVisual(status as Terminal['status']).color
    )).size).toBe(3)
  })
})
