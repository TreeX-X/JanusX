import type { Blueprint } from '../../../src/shared/janus/types'
import type { BlueprintChangeSet, BlueprintMaintenanceTask, BlueprintMaintenanceStartInput, BlueprintMaintenanceApplyInput, BlueprintMaintenanceAuditRecord, BlueprintMaintenanceUndoApplyInput, BlueprintMaintenanceEvent } from '../../../src/shared/janus/maintenance-types'

/** IPC boundary double only. Selection, approval, chat and refresh use production code. */
export function installMaintenanceFixture(initial: Blueprint, workspace: { id: string; path: string; name: string }) {
  const graph = structuredClone(initial)
  const nodeId = graph.rootNodeId
  const listeners = new Set<(event: BlueprintMaintenanceEvent) => void>()
  const state = {
    starts: [] as BlueprintMaintenanceStartInput[], applies: [] as BlueprintMaintenanceApplyInput[],
    undoPrepares: [] as Array<{ blueprintId: string; auditId: string }>, undoApplies: [] as BlueprintMaintenanceUndoApplyInput[],
    graphReads: [] as string[], refreshes: [] as string[], mutations: 0,
    checkoutViews: {} as Record<string, Blueprint>,
    tasks: [] as BlueprintMaintenanceTask[], audits: [] as BlueprintMaintenanceAuditRecord[],
    changeSourceHash(hash: string) { graph.nodes[nodeId].sourceHash = hash },
    completeProposal(taskId: string) {
      const task = state.tasks.find(item => item.id === taskId)!
      task.changeSet = proposal(task.id); task.status = 'proposal-ready'; task.progress = 100; task.phase = 'Ready'; publish(task)
    },
    replaceProposal() {
      const task = state.tasks[0]
      if (!task?.changeSet) throw new Error('No proposal to replace')
      task.changeSet = { ...task.changeSet, reason: 'Revised proposal with the same identity', operations: task.changeSet.operations.map(op => op.type === 'update-node' ? { ...op, after: { title: 'Revised title' } } : op) }
      publish(task)
    },
    graph: () => structuredClone(graph),
  }
  const publish = (task: BlueprintMaintenanceTask) => listeners.forEach(listener => listener({ task: structuredClone(task) }))
  const proposal = (taskId: string): BlueprintChangeSet => ({
    id: 'proposal-1', taskId, blueprintId: graph.id, baseRevision: 1, version: 1, status: 'ready', createdAt: '2026-09-25T00:00:00Z', reason: 'Update selected note and clean obsolete nodes',
    sourceHashes: { [nodeId]: graph.nodes[nodeId].sourceHash! },
    evidence: [{ workspaceId: workspace.id, workspaceRootFingerprint: workspace.path, files: [{ path: 'src/value.ts', sha256: 'e'.repeat(64), role: 'critical', sourceState: 'committed', supportsOperationIds: ['rename', 'description'] }] }],
    operations: [
      { operationId: 'rename', type: 'update-node', nodeId, before: { title: 'Task' }, after: { title: 'Maintained task' }, reason: 'Clarify title', evidenceRefs: ['src/value.ts'], dependsOn: [], risk: 'low' },
      { operationId: 'description', type: 'update-node', nodeId, before: { description: '' }, after: { description: 'Verified implementation' }, reason: 'Document implementation', evidenceRefs: ['src/value.ts'], dependsOn: ['rename'], risk: 'low' },
      ...['delete-a', 'delete-b'].map(operationId => ({ operationId, type: 'delete-node' as const, nodeId: operationId, impact: { title: operationId, parentId: nodeId, childIds: [], incomingRelationIds: [], outgoingRelationIds: [] }, reason: 'Remove obsolete note', evidenceRefs: [], dependsOn: [], risk: 'high' as const })),
    ],
    groups: [
      { id: 'details', kind: 'node', title: 'Note details', summary: 'Title and description', risk: 'low', operationIds: ['rename', 'description'], evidenceRefs: ['src/value.ts'] },
      { id: 'cleanup', kind: 'deletes', title: 'Obsolete notes', summary: 'Two individual deletions', risk: 'high', operationIds: ['delete-a', 'delete-b'], evidenceRefs: [] },
    ],
  })
  let reverse: BlueprintChangeSet | null = null
  Object.assign(window.electron.janus, {
    listMaintenanceTasks: async () => structuredClone(state.tasks),
    listMaintenanceAudits: async () => structuredClone(state.audits),
    onMaintenanceTask: (listener: (event: BlueprintMaintenanceEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    startMaintenanceTask: async (input: BlueprintMaintenanceStartInput) => {
      state.starts.push(structuredClone(input))
      const task: BlueprintMaintenanceTask = { ...input, id: 'maintenance-1', blueprintName: graph.name, baseRevision: 1, status: 'draft', progress: 0, phase: 'Created', messages: [], changeSet: null, changeSetHistory: [], createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
      state.tasks = [task]; publish(task); return structuredClone(task)
    },
    applyMaintenanceChangeSet: async (input: BlueprintMaintenanceApplyInput) => {
      state.applies.push(structuredClone(input))
      const task = state.tasks.find(item => item.id === input.taskId)!
      const changeSet = task.changeSet!
      if (changeSet.sourceHashes?.[nodeId] !== graph.nodes[nodeId].sourceHash) throw new Error('STALE_SOURCE_HASH: selected note changed; refresh and propose again')
      if (input.operationIds.includes('description') && !input.operationIds.includes('rename')) throw new Error('Missing dependency rename')
      for (const op of changeSet.operations.filter(op => input.operationIds.includes(op.operationId))) {
        if (op.type === 'delete-node' && !input.confirmedDeleteOperationIds?.includes(op.operationId)) throw new Error('Deletion needs individual confirmation')
      }
      const beforeSnapshot = structuredClone(graph)
      for (const op of changeSet.operations.filter(op => input.operationIds.includes(op.operationId))) {
        if (op.type === 'update-node') Object.assign(graph.nodes[op.nodeId], op.after)
        if (op.type === 'delete-node') { delete graph.nodes[op.nodeId]; graph.nodeIds = graph.nodeIds.filter(id => id !== op.nodeId) }
      }
      graph.nodes[nodeId].sourceHash = 'b'.repeat(64); state.mutations++
      state.audits.push({ id: 'audit-1', taskId: task.id, changeSetId: changeSet.id, blueprintId: graph.id, beforeRevision: 1, afterRevision: 2, selectedOperationIds: input.operationIds, rejectedOperationIds: changeSet.operations.filter(op => !input.operationIds.includes(op.operationId)).map(op => op.operationId), confirmedDeleteOperationIds: input.confirmedDeleteOperationIds, status: 'applied', changeSetSnapshot: structuredClone(changeSet), beforeSnapshot, afterSnapshot: structuredClone(graph), harnessRoot: workspace.path, createdAt: '2026-09-25T00:00:01Z' })
      task.changeSet = null; task.status = 'active'; publish(task)
      return { task: structuredClone(task), blueprintRevision: 2, appliedOperationIds: input.operationIds }
    },
    loadBlueprint: async (cwd: string) => { state.refreshes.push(cwd); return structuredClone(graph) },
    completeMaintenanceTask: async (taskId: string) => { const task = state.tasks.find(item => item.id === taskId)!; task.status = 'completed'; publish(task); return structuredClone(task) },
    cancelMaintenanceTask: async (taskId: string) => { const task = state.tasks.find(item => item.id === taskId)!; task.status = 'cancelled'; publish(task); return structuredClone(task) },
    prepareMaintenanceUndo: async (input: { blueprintId: string; auditId: string }) => {
      state.undoPrepares.push(input)
      const audit = state.audits.find(item => item.id === input.auditId)!
      // These fixture proposals update title/description; only applied fields reverse.
      const textFields = (patch: { title?: string; description?: string }) => ({
        ...('title' in patch ? { title: patch.title } : {}),
        ...('description' in patch ? { description: patch.description } : {}),
      })
      reverse = { ...structuredClone(audit.changeSetSnapshot), id: 'undo-1', undoOfAuditId: audit.id, sourceHashes: { [nodeId]: graph.nodes[nodeId].sourceHash! }, groups: undefined, operations: audit.changeSetSnapshot.operations.flatMap(op => op.type === 'update-node' && audit.selectedOperationIds.includes(op.operationId) ? [{ ...op, operationId: 'undo-' + op.operationId, dependsOn: [], before: textFields(op.after), after: textFields(op.before) }] : []) }
      return { changeSet: structuredClone(reverse), conflicts: [] }
    },
    applyMaintenanceUndo: async (input: BlueprintMaintenanceUndoApplyInput) => {
      state.undoApplies.push(structuredClone(input))
      if (reverse?.sourceHashes?.[nodeId] !== graph.nodes[nodeId].sourceHash) throw new Error('STALE_SOURCE_HASH: undo source changed')
      const beforeSnapshot = structuredClone(graph)
      for (const op of reverse!.operations.filter(op => input.operationIds.includes(op.operationId))) if (op.type === 'update-node') Object.assign(graph.nodes[op.nodeId], op.after)
      graph.nodes[nodeId].sourceHash = 'c'.repeat(64); state.mutations++
      state.audits.push({ id: 'audit-undo', taskId: 'maintenance-1', changeSetId: reverse!.id, blueprintId: graph.id, beforeRevision: 2, afterRevision: 3, selectedOperationIds: input.operationIds, rejectedOperationIds: reverse!.operations.filter(op => !input.operationIds.includes(op.operationId)).map(op => op.operationId), status: 'applied', changeSetSnapshot: structuredClone(reverse!), beforeSnapshot, afterSnapshot: structuredClone(graph), undoOfAuditId: 'audit-1', harnessRoot: workspace.path, createdAt: '2026-09-25T00:00:02Z' })
      return { blueprintRevision: 3, appliedOperationIds: input.operationIds, auditId: 'audit-undo' }
    },
  })
  Object.assign(window.electron.harness, { projectGraph: async (cwd: string) => {
    state.graphReads.push(cwd)
    const source = cwd === workspace.path ? graph : state.checkoutViews[cwd]
    return source ? { blueprint: structuredClone(source), rev: 1, repoId: source.nodes[source.rootNodeId].sourceUri!.split('/')[2], repoName: source.name, invalid: [], adapterVersion: 'fixture' } : null
  } })
  return state
}
