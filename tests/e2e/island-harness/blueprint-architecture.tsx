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
import { useThemeStore } from '../../../src/renderer/src/stores/theme'
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
if (params.has('v2')) {
  for (const node of [root, module, orphan]) {
    node.kind = node.note!.kind = 'module'; node.tags = node.note!.tags = []
    node.note!.moduleState = node === orphan ? 'planned' : 'partial'
    node.note!.metadata = { ...node.note!.metadata!, schema: 'harness-note/2', kind: 'module', tags: [], role: node === root ? 'project' : undefined, moduleState: node.note!.moduleState, updated: '2026-10-08T00:00:00Z' }
  }
  orphan.title = orphan.note!.title = 'Planned module'
  orphan.note!.parent = root.sourceUri!
  orphan.note!.metadata!.parent = root.sourceUri!
  for (const node of [task, decision]) {
    node.note!.module = module.sourceUri!
    node.note!.metadata = { ...node.note!.metadata!, schema: 'harness-note/2', module: module.sourceUri, updated: '2026-10-08T00:00:00Z' }
  }
  for (const [index, kind] of ['note', 'idea', 'requirement', 'decision'].entries()) {
    const node = structuredClone(decision)
    node.id = `0000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    node.sourceUri = `note://${R}/${node.id}`
    node.title = node.note!.title = `${index === 3 ? 'Root' : 'Child'} ${kind}`
    node.kind = node.note!.kind = kind
    node.note!.id = node.id
    node.note!.module = index === 3 ? root.sourceUri! : module.sourceUri!
    node.note!.metadata = { ...node.note!.metadata!, id: node.id, kind: kind as any, module: node.note!.module }
    graph.nodes[node.id] = node; graph.nodeIds.push(node.id)
    graph.noteSnapshot!.entries.push({ ...graph.noteSnapshot!.entries[0], uri: node.sourceUri, doc: node.note })
  }
  for (const [index, title, kind, owner] of [
    [4, 'Parser submodule', 'module', module.sourceUri],
    [5, 'Deep parsing document', 'note', `note://${R}/00000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa`],
    [6, 'Legacy unassigned document', 'note', null],
    [7, 'Retired module', 'module', null],
    [8, 'Additional module A', 'module', root.sourceUri],
    [9, 'Additional module B', 'module', root.sourceUri],
  ] as const) {
    if (index >= 8 && !params.has('wide')) continue
    const node = structuredClone(module)
    node.id = `0000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`; node.sourceUri = `note://${R}/${node.id}`
    node.title = node.note!.title = title; node.kind = node.note!.kind = kind
    node.note!.id = node.id; node.note!.relations = []
    node.note!.parent = kind === 'module' ? owner : null
    node.note!.module = kind !== 'module' ? owner ?? undefined : undefined
    node.note!.moduleState = index === 7 ? 'retired' : kind === 'module' ? 'partial' : undefined
    node.note!.metadata = { schema: 'harness-note/2', id: node.id, kind, lifecycle: 'accepted', created: '2026-10-08', updated: '2026-10-08T00:00:00Z', ...(node.note!.parent ? { parent: node.note!.parent } : {}), ...(owner && kind !== 'module' ? { module: owner } : {}), ...(node.note!.moduleState ? { moduleState: node.note!.moduleState } : {}) }
    node.note!.body = `# ${title}\n\nOriginal ${title} content.`
    graph.nodes[node.id] = node; graph.nodeIds.push(node.id)
    graph.noteSnapshot!.entries.push({ ...graph.noteSnapshot!.entries[0], uri: node.sourceUri, doc: node.note })
  }
  module.note!.body = '# Reader module\n\nReader module responsibilities from module.md.'
  orphan.note!.body = '# Planned module\n\nPlanned module responsibilities from module.md.'
  module.note!.relations.push({ type: 'related-to', target: graph.nodes['00000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa'].sourceUri! })
  graph.noteSnapshot!.diagnostics.push({ code: 'FIXTURE_PARSE_DIAGNOSTIC', message: 'Invalid historical document remains visible' } as any)
}
if (params.has('collapsed')) graph.collapsedNodeIds = [root.id]
if (params.has('untagged')) for (const node of Object.values(graph.nodes)) { node.tags = []; node.note!.tags = [] }
installWorkbenchBoundary(() => graph, workspace.path)
useWorkspaceStore.setState({ activeWorkspaceId: workspace.id, workspaces: [workspace as any] })
useBlueprintMaintenanceStore.setState({ initialized: true })
useBlueprintStore.setState({ currentBlueprint: graph, blueprintWorkspace: { [graph.id]: workspace.path }, loading: false })
;(window as any).architectureFixture = {
  graph,
  theme: (theme: string) => { document.documentElement.dataset.theme = theme; useThemeStore.setState({ theme }) },
  refresh: () => {
    graph.nodes[module.id].title = 'Reader module refreshed'
    graph.contentRevision++
    return useBlueprintStore.getState().loadBlueprint(graph.id)
  },
  focusTask: () => {
    useNoteFocusStore.getState().activate('fixture')
    useNoteFocusStore.getState().receive({ id: crypto.randomUUID(), workspacePath: workspace.path, conversationId: 'fixture', mode: 'display', focus: 'explicit', notes: [{ uri: task.sourceUri!, role: 'target' }], source: 'assistant', createdAt: new Date().toISOString() } as any)
  },
  focus: (title: string, focus = 'explicit', reference?: string) => {
    const target = Object.values(graph.nodes).find(node => node.title === title)!
    const related = Object.values(graph.nodes).find(node => node.title === reference)
    useNoteFocusStore.getState().activate('fixture')
    useNoteFocusStore.getState().receive({ id: crypto.randomUUID(), workspacePath: workspace.path, conversationId: 'fixture', mode: 'display', focus, notes: [{ uri: target.sourceUri!, role: 'target' }, ...(related ? [{ uri: related.sourceUri, role: 'reference' }] : [])], source: 'assistant', createdAt: new Date().toISOString() } as any)
  },
}
void initI18n().then(() => createRoot(document.getElementById('root')!).render(params.has('workbench') ? <JanusChatProvider><BlueprintWorkbench isOpen onClose={() => {}} /></JanusChatProvider> : <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}><BlueprintCanvas blueprintId={graph.id} /></main>))
