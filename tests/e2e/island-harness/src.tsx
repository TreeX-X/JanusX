import React, { useReducer, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type { ApprovalRequest } from '../../../src/shared/ipc/agent-runtime'
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
  messages: [
    { id: 'prompt-one', role: 'user' as const, content: 'First recalled prompt', timestamp: 1 },
    { id: 'shared-message', role: 'assistant' as const, content: 'Shared controller message', timestamp: 2 },
    { id: 'prompt-two', role: 'user' as const, content: 'Latest recalled prompt', timestamp: 3 },
  ],
  error: null,
  modelOptions: [
    { providerId: 'provider-a', providerName: 'Provider A', modelId: 'model-a1', label: 'Provider A / model-a1', isDefault: true, isProviderDefault: true },
    { providerId: 'provider-a', providerName: 'Provider A', modelId: 'model-a2', label: 'Provider A / model-a2', isDefault: false, isProviderDefault: false },
    { providerId: 'provider-b', providerName: 'Provider B', modelId: 'model-b1', label: 'Provider B / model-b1', isDefault: false, isProviderDefault: true },
  ],
  modelNotice: null,
}

const approvalFixture: ApprovalRequest = {
  id: 'approval-fixture',
  sessionId: 'session-fixture',
  workspaceId: 'workspace-1',
  correlationId: 'call-fixture',
  toolName: 'workspace.edit',
  input: {},
  evidenceConfidence: 'medium',
  actionRisk: 'write',
  approvalPolicy: 'per-action',
  reasonCode: 'ACTION_REQUIRES_APPROVAL',
  preview: {
    summary: 'Edit README.md with 1 exact replacement',
    paths: ['README.md'],
    detail: 'Replacement 1\n- Previous project summary\n+ Updated project summary',
    truncated: false,
  },
  createdAt: '2026-07-31T00:00:00.000Z',
}

function Harness() {
  const [island, dispatch] = useReducer(reduceIslandController, INITIAL_ISLAND_CONTROLLER_STATE)
  const [singleCount, setSingleCount] = useState(0)
  const [doubleCount, setDoubleCount] = useState(0)
  const [callbackVersion, setCallbackVersion] = useState(1)
  const [calledVersion, setCalledVersion] = useState(0)
  const [activeModel, setActiveModel] = useState(controllerData.modelOptions[0])
  const [clearCount, setClearCount] = useState(0)
  const [lastSentPrompt, setLastSentPrompt] = useState('')
  const [stopCount, setStopCount] = useState(0)
  const [isStreaming, setIsStreaming] = useState(true)
  const [approvalPending, setApprovalPending] = useState(
    () => new URLSearchParams(window.location.search).get('approval') === '1',
  )
  const [approvalDecision, setApprovalDecision] = useState('pending')
  const paneTree = useWorkspaceStore((state) => state.paneTree)
  const focusedPaneId = useWorkspaceStore((state) => state.focusedPaneId)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const chatPane = getLeafPanes(paneTree).find((leaf) => leaf.tabs.some((tab) => tab.type === 'janus-chat')) ?? null
  const terminalTabCount = getLeafPanes(paneTree).flatMap((leaf) => leaf.tabs).filter((tab) => tab.type === 'terminal').length

  const controller = {
    ...controllerData,
    activeModel,
    isStreaming,
    pendingContent: isStreaming ? 'Shared pending stream' : '',
  }
  const chatProps = {
    ...controller,
    modeColor: '#ff7830',
    onSelectModel: (providerId: string, modelId: string) => {
      const next = controllerData.modelOptions.find((option) =>
        option.providerId === providerId && option.modelId === modelId)
      if (next) setActiveModel(next)
    },
    onSend: (text: string) => setLastSentPrompt(text),
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
    pendingApprovals: approvalPending ? [approvalFixture] : [],
    resolveApproval: (_approvalId: string, approved: boolean) => {
      setApprovalDecision(approved ? 'approved' : 'rejected')
      setApprovalPending(false)
    },
  }

  return (
    <main
      data-testid="harness"
      data-stage={island.stage}
      data-single-count={singleCount}
      data-double-count={doubleCount}
      data-called-version={calledVersion}
      data-active-provider={activeModel.providerId}
      data-active-model={activeModel.modelId}
      data-clear-count={clearCount}
      data-last-sent-prompt={lastSentPrompt}
      data-stop-count={stopCount}
      data-terminal-tab-count={terminalTabCount}
      data-active-workspace={activeWorkspaceId}
      data-pane-ratio={paneTree?.type === 'split' ? paneTree.ratio : 'single'}
      data-pane-tabs={getLeafPanes(paneTree).flatMap((leaf) => leaf.tabs).map((tab) => tab.type).join(',')}
      data-approval-decision={approvalDecision}
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
        onChatSelectModel={chatProps.onSelectModel}
        onChatSend={chatProps.onSend}
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
