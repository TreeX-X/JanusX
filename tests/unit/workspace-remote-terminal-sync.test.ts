import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from '../../src/renderer/src/stores/workspace'
import { getLeafPanes } from '../../src/renderer/src/lib/workspace-pane'
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

  it('keeps a foreign split terminal out of the active workspace and removes it on collapse', () => {
    const store = useWorkspaceStore.getState()
    store.addTerminalForWorkspace(terminal('t-active', 'ws-active'))
    store.addTerminalForWorkspace(terminal('t-other', 'ws-other'))
    const activePaneId = getLeafPanes(useWorkspaceStore.getState().paneTree)[0].id

    useWorkspaceStore.getState().splitPaneWithTerminal('t-other', activePaneId, 'right')
    const split = useWorkspaceStore.getState()
    expect(split.terminals.map((item) => item.id)).toEqual(['t-active'])
    expect(getLeafPanes(split.paneTree).flatMap((leaf) => leaf.tabs).map((tab) => tab.id)).toContain('terminal:t-other')

    useWorkspaceStore.getState().collapsePaneLayout()
    const collapsed = useWorkspaceStore.getState()
    expect(getLeafPanes(collapsed.paneTree).flatMap((leaf) => leaf.tabs).map((tab) => tab.id)).toEqual(['terminal:t-active'])
    expect(collapsed.terminalSnapshots['ws-other'].terminals.map((item) => item.id)).toEqual(['t-other'])
  })

  it('rejects moving a foreign terminal into the current workspace tab strip', () => {
    const store = useWorkspaceStore.getState()
    store.addTerminalForWorkspace(terminal('t-active', 'ws-active'))
    store.addTerminalForWorkspace(terminal('t-other', 'ws-other'))
    const activePaneId = getLeafPanes(useWorkspaceStore.getState().paneTree)[0].id

    useWorkspaceStore.getState().moveTerminalToPane('t-other', activePaneId)

    const state = useWorkspaceStore.getState()
    expect(state.terminals.map((item) => item.id)).toEqual(['t-active'])
    expect(getLeafPanes(state.paneTree)[0].tabs.map((tab) => tab.id)).toEqual(['terminal:t-active'])
  })

  it('does not persist a foreign split terminal when switching workspaces', () => {
    const store = useWorkspaceStore.getState()
    store.addTerminalForWorkspace(terminal('t-active', 'ws-active'))
    store.addTerminalForWorkspace(terminal('t-other', 'ws-other'))
    const activePaneId = getLeafPanes(useWorkspaceStore.getState().paneTree)[0].id
    useWorkspaceStore.getState().splitPaneWithTerminal('t-other', activePaneId, 'right')

    useWorkspaceStore.getState().setActiveWorkspace('ws-other')
    useWorkspaceStore.getState().setActiveWorkspace('ws-active')

    const restored = useWorkspaceStore.getState()
    expect(restored.terminals.map((item) => item.id)).toEqual(['t-active'])
    expect(getLeafPanes(restored.paneTree).flatMap((leaf) => leaf.tabs).map((tab) => tab.id)).toEqual(['terminal:t-active'])
  })

  it('refuses to activate a legacy foreign terminal mixed into a single pane', () => {
    const store = useWorkspaceStore.getState()
    store.addTerminalForWorkspace(terminal('t-active', 'ws-active'))
    store.addTerminalForWorkspace(terminal('t-other', 'ws-other'))
    const pane = getLeafPanes(useWorkspaceStore.getState().paneTree)[0]
    useWorkspaceStore.setState({
      activeTerminalId: 't-active',
      paneTree: {
        ...pane,
        tabs: [
          ...pane.tabs,
          { type: 'terminal', id: 'terminal:t-other', terminalId: 't-other', workspaceId: 'ws-other' },
        ],
      },
    })

    useWorkspaceStore.getState().setPaneTab(pane.id, 'terminal:t-other')

    const state = useWorkspaceStore.getState()
    expect(state.activeTerminalId).toBe('t-active')
    expect(getLeafPanes(state.paneTree)[0].activeTabId).toBe('terminal:t-active')
  })
})
