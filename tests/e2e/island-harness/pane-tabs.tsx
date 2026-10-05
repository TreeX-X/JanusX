import React from 'react'
import ReactDOM from 'react-dom/client'
import { TerminalArea } from '../../../src/renderer/src/components/TerminalArea'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { createBrowserPaneContent, createTerminalPaneContent, getLeafPanes, type WorkspacePaneNode } from '../../../src/renderer/src/lib/workspace-pane'
import { setTerminalDragData, clearTerminalDragData } from '../../../src/renderer/src/lib/terminal-file-reference'
import { useWorkspaceStore } from '../../../src/renderer/src/stores/workspace'
import { useBrowserStore } from '../../../src/renderer/src/stores/browser'
import { changeLanguage, initI18n } from '../../../src/renderer/src/i18n'
import { DEFAULT_APP_THEME } from '../../../src/shared/ipc/theme'
import type { BrowserBounds, BrowserSurfaceState } from '../../../src/shared/ipc/browser'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
Object.assign(window.electron.system, { getLanguage: async () => 'en', setLanguage: async () => undefined })
document.documentElement.dataset.theme = DEFAULT_APP_THEME
const bounds: Record<string, BrowserBounds> = {}
let kills = 0
let creates = 0
const workspace = { id: 'ws', name: 'Tabs', path: 'C:/tabs', clis: [], layout: { mode: 'tabs' as const, positions: [] }, createdAt: new Date().toISOString() }
const terminals = ['a', 'b', 'c', 'sidebar'].map((id) => ({
  id, workspaceId: 'ws', cwd: 'C:/tabs', preset: 'shell' as const, name: `Terminal ${id}`, status: 'wait' as const,
}))
const surfaces: Record<string, BrowserSurfaceState> = Object.fromEntries(['d', 'e', 'f', 'g', 'h', 'i', 'j'].map((surfaceId) => [surfaceId, {
  surfaceId, carrier: 'pane', tabs: [], activeTabId: null, agentControlled: false,
}]))
Object.assign(window.electron.browser, {
  getState: async (id: string) => surfaces[id] ?? null,
  setBounds: async (id: string, value: BrowserBounds) => { bounds[id] = value },
  destroySurface: async (id: string) => { delete surfaces[id] },
})
Object.assign(window.electron.terminal, {
  kill: async () => { kills++; return { success: true } },
  create: async () => { creates++; throw new Error('Drag must not create a terminal') },
})
Object.values(surfaces).forEach((surface) => useBrowserStore.getState().applySurfaceState(surface))
const overflow = new URLSearchParams(location.search).has('overflow')
const left = {
  type: 'leaf' as const, id: 'left', activeTabId: 'terminal:a',
  tabs: ['a', 'b', 'c'].map((id) => createTerminalPaneContent(id, 'ws')),
}
const right = {
  type: 'leaf' as const, id: 'right', activeTabId: 'browser:d',
  tabs: (overflow ? ['d', 'e', 'f', 'g', 'h', 'i', 'j'] : ['d', 'e']).map(createBrowserPaneContent),
}
const paneTree: WorkspacePaneNode = { type: 'split', id: 'split', direction: 'horizontal', ratio: .5, first: left, second: right }
useWorkspaceStore.setState({
  workspaces: [workspace], activeWorkspaceId: 'ws', terminals, paneTree,
  focusedPaneId: 'left', focusedTabId: 'terminal:a', activeTerminalId: 'a', terminalSnapshots: {},
})
Object.assign(window, {
  paneFixture: {
    state: () => {
      const state = useWorkspaceStore.getState()
      return {
        panes: getLeafPanes(state.paneTree).map((pane) => ({ id: pane.id, tabs: pane.tabs.map((tab) => tab.id), active: pane.activeTabId })),
        tree: state.paneTree, focusedPane: state.focusedPaneId, focusedTab: state.focusedTabId,
        active: state.tabDragInFlight, bounds, kills, creates,
      }
    },
    switchWorkspace: () => useWorkspaceStore.getState().setActiveWorkspace(null),
    removeSource: () => useWorkspaceStore.getState().closePaneTab('left', 'terminal:a'),
  },
})
await initI18n()
await changeLanguage('en')
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div draggable onDragStart={(event) => setTerminalDragData(event.dataTransfer, 'sidebar')} onDragEnd={clearTerminalDragData} data-sidebar-terminal style={{ height: 32 }}>Sidebar terminal</div>
      <main style={{ display: 'flex', flex: 1, minHeight: 0 }}><TerminalArea /></main>
    </div>
  </React.StrictMode>,
)
