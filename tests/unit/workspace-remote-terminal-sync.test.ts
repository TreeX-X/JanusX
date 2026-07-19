import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from '../../src/renderer/src/stores/workspace'
import type { Terminal } from '../../src/renderer/src/types'

const terminal = (id: string, workspaceId: string): Terminal => ({
  id, workspaceId, name: 'Codex terminal', preset: 'codex', cwd: 'C:/repo', shell: 'powershell.exe',
  autoCommand: 'codex', pid: 123, status: 'running', updatedAt: Date.now(),
})

describe('remote terminal workspace synchronization', () => {
  beforeEach(() => useWorkspaceStore.setState({
    activeWorkspaceId: 'ws-active', terminals: [], activeTerminalId: null, paneTree: null,
    focusedPaneId: null, focusedTabId: null, terminalSnapshots: {},
  }))

  it('adds a current-workspace terminal to the active pane', () => {
    useWorkspaceStore.getState().addTerminalForWorkspace(terminal('t-active', 'ws-active'))
    const state = useWorkspaceStore.getState()
    expect(state.terminals.map((item) => item.id)).toContain('t-active')
    expect(state.paneTree).not.toBeNull()
  })

  it('updates only the inactive workspace snapshot', () => {
    useWorkspaceStore.getState().addTerminalForWorkspace(terminal('t-other', 'ws-other'))
    const state = useWorkspaceStore.getState()
    expect(state.terminals).toHaveLength(0)
    expect(state.paneTree).toBeNull()
    expect(state.terminalSnapshots['ws-other'].terminals.map((item) => item.id)).toEqual(['t-other'])
  })
})
