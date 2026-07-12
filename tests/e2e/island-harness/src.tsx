import React, { useReducer, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { JanusIsland } from '../../../src/renderer/src/components/janus'
import {
  INITIAL_ISLAND_CONTROLLER_STATE,
  reduceIslandController,
} from '../../../src/renderer/src/components/janus/islandController'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/components/janus/janus-island.css'

installElectronApiFallback()

function Harness() {
  const [island, dispatch] = useReducer(reduceIslandController, INITIAL_ISLAND_CONTROLLER_STATE)
  const [singleCount, setSingleCount] = useState(0)
  const [doubleCount, setDoubleCount] = useState(0)
  const [callbackVersion, setCallbackVersion] = useState(1)
  const [calledVersion, setCalledVersion] = useState(0)

  return (
    <main data-testid="harness" data-stage={island.stage} data-single-count={singleCount} data-double-count={doubleCount} data-called-version={calledVersion}>
      <button data-testid="replace-single" onClick={() => setCallbackVersion(2)}>Replace single callback</button>
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
        messages={[]}
        pendingContent=""
        isStreaming={false}
        error={null}
        modelOptions={[]}
        activeModel={null}
        modelNotice={null}
        onChatCycleModel={() => undefined}
        onChatSelectModel={() => undefined}
        onChatSend={() => undefined}
        onChatStop={() => undefined}
        onChatRetry={() => undefined}
        onChatClear={() => undefined}
        onOpenLlmConfig={() => undefined}
        knowledgeTrace={null}
        knowledgePeekActive={island.knowledge.presentation !== 'hidden'}
        knowledgePeekEmpty={island.knowledge.presentation === 'empty'}
      />
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />)
