import React, { useReducer, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { JanusIsland } from '../../../src/renderer/src/components/janus'
import { JanusChat } from '../../../src/renderer/src/components/janus/JanusChat'
import {
  INITIAL_ISLAND_CONTROLLER_STATE,
  reduceIslandController,
} from '../../../src/renderer/src/components/janus/islandController'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { createTerminalPaneContent, getLeafPanes } from '../../../src/renderer/src/lib/workspace-pane'
import { useWorkspaceStore } from '../../../src/renderer/src/stores/workspace'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/components/janus/janus-island.css'

installElectronApiFallback()

const workspaceOne = {
  id: 'workspace-1',
  name: 'Workspace One',
  path: 'C:\\workspace-one',
  clis: [],
  layout: { mode: 'tabs' as const, positions: [] },
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
}
const workspaceTwo = {
  ...workspaceOne,
  id: 'workspace-2',
  name: 'Workspace Two',
  path: 'C:\\workspace-two',
}
const workspaceThree = {
  ...workspaceOne,
  id: 'workspace-3',
  name: 'Workspace Three',
  path: 'C:\\workspace-three',
}
const workspaceTwoPane = {
  type: 'leaf' as const,
  id: 'pane-terminal-two',
  tabs: [createTerminalPaneContent('terminal-2', 'workspace-2')],
  activeTabId: 'terminal:terminal-2',
}

useWorkspaceStore.setState({
  workspaces: [workspaceOne, workspaceTwo, workspaceThree],
  activeWorkspaceId: 'workspace-1',
  activeTerminalId: 'terminal-1',
  paneTree: {
    type: 'leaf',
    id: 'pane-terminal',
    tabs: [createTerminalPaneContent('terminal-1', 'workspace-1')],
    activeTabId: 'terminal:terminal-1',
  },
  focusedPaneId: 'pane-terminal',
  focusedTabId: 'terminal:terminal-1',
  terminalSnapshots: {
    'workspace-2': {
      terminals: [{
        id: 'terminal-2',
        workspaceId: 'workspace-2',
        name: 'Terminal 2',
        preset: 'shell',
        cwd: workspaceTwo.path,
        shell: 'powershell',
        pid: null,
        status: 'wait',
      }],
      activeTerminalId: 'terminal-2',
      paneTree: workspaceTwoPane,
      focusedPaneId: workspaceTwoPane.id,
      focusedTabId: workspaceTwoPane.activeTabId,
    },
  },
})

const controllerData = {
  messages: [{ id: 'shared-message', role: 'assistant' as const, content: 'Shared controller message', timestamp: 1 }],
  error: null,
  modelOptions: [],
  activeModel: null,
  modelNotice: null,
}

function Harness() {
  const [island, dispatch] = useReducer(reduceIslandController, INITIAL_ISLAND_CONTROLLER_STATE)
  const [singleCount, setSingleCount] = useState(0)
  const [doubleCount, setDoubleCount] = useState(0)
  const [callbackVersion, setCallbackVersion] = useState(1)
  const [calledVersion, setCalledVersion] = useState(0)
  const [cycleCount, setCycleCount] = useState(0)
  const [clearCount, setClearCount] = useState(0)
  const [stopCount, setStopCount] = useState(0)
  const [isStreaming, setIsStreaming] = useState(true)
  const paneTree = useWorkspaceStore((state) => state.paneTree)
  const focusedPaneId = useWorkspaceStore((state) => state.focusedPaneId)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const chatPane = getLeafPanes(paneTree).find((leaf) => leaf.tabs.some((tab) => tab.type === 'janus-chat')) ?? null
  const terminalTabCount = getLeafPanes(paneTree).flatMap((leaf) => leaf.tabs).filter((tab) => tab.type === 'terminal').length

  const controller = {
    ...controllerData,
    isStreaming,
    pendingContent: isStreaming ? 'Shared pending stream' : '',
  }
  const chatProps = {
    ...controller,
    modeColor: '#ff7830',
    onCycleModel: () => setCycleCount((count) => count + 1),
    onSelectModel: () => undefined,
    onSend: () => undefined,
    onStop: () => setStopCount((count) => count + 1),
    onRetry: () => undefined,
    onClear: () => setClearCount((count) => count + 1),
    onOpenLlmConfig: () => undefined,
  }
  const resourceController = {
    resources: [
      { workspaceId: 'workspace-1', workspaceName: 'Workspace One', workspacePath: workspaceOne.path },
      { workspaceId: 'workspace-2', workspaceName: 'Workspace Two', workspacePath: workspaceTwo.path },
    ],
    availableWorkspaces: [workspaceOne, workspaceTwo, workspaceThree],
    attachWorkspace: () => undefined,
    detachWorkspace: () => undefined,
    activities: [],
    pendingApprovals: [],
    resolveApproval: () => undefined,
  }

  return (
    <main
      data-testid="harness"
      data-stage={island.stage}
      data-single-count={singleCount}
      data-double-count={doubleCount}
      data-called-version={calledVersion}
      data-cycle-count={cycleCount}
      data-clear-count={clearCount}
      data-stop-count={stopCount}
      data-terminal-tab-count={terminalTabCount}
      data-active-workspace={activeWorkspaceId}
      data-pane-ratio={paneTree?.type === 'split' ? paneTree.ratio : 'single'}
      data-pane-tabs={getLeafPanes(paneTree).flatMap((leaf) => leaf.tabs).map((tab) => tab.type).join(',')}
    >
      <button data-testid="replace-single" onClick={() => setCallbackVersion(2)}>Replace single callback</button>
      <button data-testid="reopen-island" onClick={() => dispatch({ type: 'double-activate' })}>Reopen Island</button>
      <button data-testid="toggle-streaming" onClick={() => setIsStreaming((value) => !value)}>Toggle streaming</button>
      <button data-testid="switch-empty-workspace" onClick={() => useWorkspaceStore.getState().setActiveWorkspace('workspace-3')}>
        Switch empty workspace
      </button>
      <JanusIsland
        stage={island.stage}
        onSingleActivate={() => {
          setSingleCount((count) => count + 1)
          setCalledVersion(callbackVersion)
          dispatch({ type: 'single-activate' })
        }}
        onDoubleActivate={() => {
          setDoubleCount((count) => count + 1)
          dispatch({ type: 'double-activate' })
        }}
        onDismiss={() => dispatch({ type: 'dismiss' })}
        {...controller}
        onChatCycleModel={chatProps.onCycleModel}
        onChatSelectModel={() => undefined}
        onChatSend={() => undefined}
        onChatStop={chatProps.onStop}
        onChatRetry={() => undefined}
        onChatClear={chatProps.onClear}
        onOpenLlmConfig={() => undefined}
        onAddChatToWorkspace={() => {
          const workspaceStore = useWorkspaceStore.getState()
          workspaceStore.openJanusChatInWorkspace()
          dispatch({ type: 'dismiss' })
        }}
        resourceController={resourceController}
        knowledgeTrace={null}
        knowledgePeekActive={island.knowledge.presentation !== 'hidden'}
        knowledgePeekEmpty={island.knowledge.presentation === 'empty'}
      />
      {chatPane && (
        <section data-testid="workspace-chat">
          <button
            data-testid="close-workspace-chat"
            onClick={() => useWorkspaceStore.getState().closePaneTab(chatPane.id, 'janus-chat')}
          >
            Close workspace Chat
          </button>
          <JanusChat visible workspace focused={focusedPaneId === chatPane.id} {...chatProps} />
        </section>
      )}
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />)
