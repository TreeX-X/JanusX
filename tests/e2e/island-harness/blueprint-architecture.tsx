import React from 'react'
import { createRoot } from 'react-dom/client'
import { BlueprintCanvas } from '../../../src/renderer/src/components/blueprint/BlueprintCanvas'
import { BlueprintWorkbench } from '../../../src/renderer/src/components/blueprint/BlueprintWorkbench'
import { JanusChatProvider } from '../../../src/renderer/src/components/janus/JanusChatProvider'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n } from '../../../src/renderer/src/i18n'
import { useBlueprintStore } from '../../../src/renderer/src/stores/blueprint'
import { useBlueprintMaintenanceStore } from '../../../src/renderer/src/stores/blueprint-maintenance'
import { useWorkspaceStore } from '../../../src/renderer/src/stores/workspace'
import { useNoteFocusStore } from '../../../src/renderer/src/stores/note-focus'
import { createWorkbenchGraph, installWorkbenchBoundary } from './workbench-fixture'
import { DEFAULT_APP_THEME } from '../../../src/shared/ipc/theme'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'
import '../../../src/renderer/src/components/janus/janus-island.css'
import '../../../src/renderer/src/components/blueprint/blueprint.css'

installElectronApiFallback()
document.documentElement.dataset.theme = DEFAULT_APP_THEME
Object.assign(window.electron.system, { getLanguage: async () => 'zh-CN', onPrepareQuit: () => () => {} })
const R = '11111111-1111-4111-8111-111111111111', rootId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const workspace = { id: 'architecture', name: 'Architecture', path: 'C:/architecture', createdAt: '', updatedAt: '' }
const graph = createWorkbenchGraph(R, rootId, workspace)
const [root, task, decision, module, orphan] = graph.nodeIds.map(id => graph.nodes[id])
function declare(node: typeof root, role: string, parent: string | null) {
  node.tags = ['architecture:' + role]; node.note!.tags = node.tags; node.kind = 'initiative'; node.note!.kind = 'initiative'
  node.note!.parent = parent; node.note!.metadata = { ...node.note!.metadata!, kind: 'initiative', tags: node.tags, parent: parent ?? undefined }
}
declare(root, 'project', null)
declare(module, 'module', root.sourceUri!)
declare(orphan, 'module', `note://${R}/99999999-9999-4999-8999-999999999999`)
module.title = module.note!.title = 'Reader module'; orphan.title = orphan.note!.title = 'Unresolved module'
root.note!.metadata!.interfaces = [{ name: 'read', direction: 'provides' }]
module.note!.metadata!.interfaces = [{ name: 'read', direction: 'needs', provider: root.sourceUri }]
module.note!.relations = [{ type: 'related-to', target: task.sourceUri! }, { type: 'governed-by', target: decision.sourceUri! }, { type: 'related-to', target: `note://${R}/99999999-9999-4999-8999-999999999999` }]
decision.kind = decision.note!.kind = 'decision'; decision.title = decision.note!.title = 'Storage decision'
const params = new URLSearchParams(location.search)
if (params.has('collapsed')) graph.collapsedNodeIds = [root.id]
if (params.has('untagged')) for (const node of Object.values(graph.nodes)) { node.tags = []; node.note!.tags = [] }
installWorkbenchBoundary(() => graph, workspace.path)
useWorkspaceStore.setState({ activeWorkspaceId: workspace.id, workspaces: [workspace as any] })
useBlueprintMaintenanceStore.setState({ initialized: true })
useBlueprintStore.setState({ currentBlueprint: graph, blueprints: [{ id: graph.id, name: graph.name, rootNodeId: root.id, nodeCount: graph.nodeIds.length } as any], blueprintWorkspace: { [graph.id]: workspace.path }, loading: false })
;(window as any).architectureFixture = {
  graph,
  refresh: () => {
    graph.nodes[module.id].title = 'Reader module refreshed'
    graph.contentRevision++
    return useBlueprintStore.getState().loadBlueprint(graph.id)
  },
  focusTask: () => {
    useNoteFocusStore.getState().activate('fixture')
    useNoteFocusStore.getState().receive({ id: crypto.randomUUID(), workspacePath: workspace.path, conversationId: 'fixture', mode: 'display', focus: 'explicit', notes: [{ uri: task.sourceUri!, role: 'target' }], source: 'assistant', createdAt: new Date().toISOString() } as any)
  },
}
void initI18n().then(() => createRoot(document.getElementById('root')!).render(params.has('workbench') ? <JanusChatProvider><BlueprintWorkbench isOpen onClose={() => {}} /></JanusChatProvider> : <main style={{ height: '100vh' }}><BlueprintCanvas blueprintId={graph.id} /></main>))
