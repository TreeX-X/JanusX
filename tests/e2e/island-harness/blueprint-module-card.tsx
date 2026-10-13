import React from 'react'
import { createRoot } from 'react-dom/client'
import { ReactFlow, useNodesState, type ReactFlowInstance } from '@xyflow/react'
import { BlueprintCardActionsContext, BlueprintNodeCard, type BlueprintRFNodeType } from '../../../src/renderer/src/components/blueprint/BlueprintNodeCard'
import { initI18n } from '../../../src/renderer/src/i18n'
import '@xyflow/react/dist/style.css'
import '../../../src/renderer/src/styles/themes.generated.css'
import '../../../src/renderer/src/components/blueprint/blueprint.css'
import '../../../src/renderer/src/components/blueprint/module-browsing.css'
import '../../../src/renderer/src/components/blueprint/note-focus.css'

const nodeTypes = { blueprint: BlueprintNodeCard }
const actions = { toggleCollapse: () => {}, moduleBrowsing: true, architectureRoles: { module: 'module' as const } }
const initial: BlueprintRFNodeType[] = [{ id: 'module', type: 'blueprint', position: { x: 0, y: 0 }, data: {
  title: 'Module card', status: 'planned', nodeType: 'feature', kind: 'module', moduleState: 'partial',
  progress: 0, workspaceName: null, boundTerminalId: null,
} }]

// Production card and React Flow measurement/semantic zoom, with a stationary
// viewport so pixel checks do not race app navigation and auto-fit.
function Fixture() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial)
  const init = (flow: ReactFlowInstance<BlueprintRFNodeType>) => {
    ;(window as any).moduleCardFixture = {
      zoom: (zoom: number) => flow.setViewport({ x: 400 - 120 * zoom, y: 250, zoom }),
      state: (state: string) => setNodes(nodes => nodes.map(node => ({ ...node, selected: state !== 'default',
        className: state === 'focus' ? 'bp-assistant-target' : '', data: { ...node.data, searchMatched: state === 'matched' },
      }))),
      theme: (theme: string) => { document.documentElement.dataset.theme = theme },
    }
  }
  return <div className="blueprint-canvas-wrapper" style={{ height: '100vh', background: 'var(--shell-bg)' }}>
    <BlueprintCardActionsContext.Provider value={actions}>
      <ReactFlow nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onInit={init} minZoom={0.05} maxZoom={4} />
    </BlueprintCardActionsContext.Provider>
  </div>
}
void initI18n().then(() => createRoot(document.getElementById('root')!).render(<Fixture />))
