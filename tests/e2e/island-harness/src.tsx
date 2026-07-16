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

useWorkspaceStore.setState({
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
    >
      <button data-testid="replace-single" onClick={() => setCallbackVersion(2)}>Replace single callback</button>
      <button data-testid="reopen-island" onClick={() => dispatch({ type: 'double-activate' })}>Reopen Island</button>
      <button data-testid="toggle-streaming" onClick={() => setIsStreaming((value) => !value)}>Toggle streaming</button>
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
          useWorkspaceStore.getState().openJanusChatInWorkspace()
          dispatch({ type: 'dismiss' })
        }}
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
