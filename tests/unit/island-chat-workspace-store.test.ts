import { afterEach, describe, expect, it } from 'vitest'
import { createTerminalPaneContent, getLeafPanes } from '../../src/renderer/src/lib/workspace-pane'
import { useWorkspaceStore } from '../../src/renderer/src/stores/workspace'
import type { Terminal } from '../../src/renderer/src/types'

const initialState = useWorkspaceStore.getState()

function terminal(id: string, workspaceId: string): Terminal {
  return {
    id,
    workspaceId,
    name: id,
    preset: 'shell',
    cwd: '/workspace',
    shell: 'shell',
    pid: null,
    status: 'idle',
  }
}

function setTerminalPane(workspaceId = 'workspace-1', terminalId = 'terminal-1') {
  useWorkspaceStore.setState({
    activeWorkspaceId: workspaceId,
    terminals: [terminal(terminalId, workspaceId)],
    activeTerminalId: terminalId,
    paneTree: {
      type: 'leaf',
      id: 'pane-terminal',
      tabs: [createTerminalPaneContent(terminalId, workspaceId)],
      activeTabId: `terminal:${terminalId}`,
    },
    focusedPaneId: 'pane-terminal',
    focusedTabId: `terminal:${terminalId}`,
  })
}

afterEach(() => useWorkspaceStore.setState(initialState, true))

describe('Island Chat workspace store orchestration', () => {
  it('opens a right split at 0.62 and focuses one Chat tab on repeated open', () => {
    setTerminalPane()

    useWorkspaceStore.getState().openJanusChatInWorkspace()
    const opened = useWorkspaceStore.getState()
    expect(opened.paneTree).toMatchObject({ type: 'split', direction: 'horizontal', ratio: 0.62 })
    expect(opened.focusedTabId).toBe('janus-chat')
    expect(opened.activeTerminalId).toBeNull()

    useWorkspaceStore.getState().openJanusChatInWorkspace()
    const repeated = useWorkspaceStore.getState()
    expect(getLeafPanes(repeated.paneTree).flatMap((leaf) => leaf.tabs).filter((tab) => tab.type === 'janus-chat')).toHaveLength(1)
    expect(repeated.focusedTabId).toBe('janus-chat')
  })

  it('isolates and restores the Chat pane with its active workspace snapshot', () => {
    setTerminalPane('workspace-1')
    useWorkspaceStore.getState().openJanusChatInWorkspace()

    useWorkspaceStore.getState().setActiveWorkspace('workspace-2')
    expect(useWorkspaceStore.getState().paneTree).toBeNull()

    useWorkspaceStore.getState().setActiveWorkspace('workspace-1')
    const restored = useWorkspaceStore.getState()
    expect(getLeafPanes(restored.paneTree).flatMap((leaf) => leaf.tabs).some((tab) => tab.type === 'janus-chat')).toBe(true)
    expect(restored.focusedTabId).toBe('janus-chat')
  })

  it('closes only Chat and preserves terminal selection and removal behavior', () => {
    setTerminalPane()
    useWorkspaceStore.getState().openJanusChatInWorkspace()
    const chatPane = getLeafPanes(useWorkspaceStore.getState().paneTree).find((leaf) => leaf.activeTabId === 'janus-chat')!

    useWorkspaceStore.getState().closePaneTab(chatPane.id, 'janus-chat')
    let state = useWorkspaceStore.getState()
    expect(getLeafPanes(state.paneTree).flatMap((leaf) => leaf.tabs).map((tab) => tab.id)).toEqual(['terminal:terminal-1'])
    expect(state.activeTerminalId).toBe('terminal-1')

    state.setActiveTerminal('terminal-1')
    expect(useWorkspaceStore.getState().focusedTabId).toBe('terminal:terminal-1')
    useWorkspaceStore.getState().removeTerminal('terminal-1')
    state = useWorkspaceStore.getState()
    expect(state.terminals).toEqual([])
    expect(state.paneTree).toBeNull()
    expect(state.activeTerminalId).toBeNull()
  })
})
