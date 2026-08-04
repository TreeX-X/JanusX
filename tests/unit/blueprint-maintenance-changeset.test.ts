import { describe, expect, it } from 'vitest'
import type { Blueprint } from '../../src/shared/janus/types'
import type { BlueprintChangeSet } from '../../src/shared/janus/maintenance-types'
import { applyOperations, selectOperations } from '../../src/main/janus/maintenance/changeset'

function fixture(): Blueprint {
  const node = (id: string, parentId: string | null, children: string[] = []) => ({
    id, title: id, type: 'task' as const, status: 'not-started' as const, progress: 0,
    statusSource: 'manual' as const, positioning: '', description: '', features: [], completedItems: [],
    techSolution: '', notes: '', todos: [], issues: [], activities: [], analyses: [], workspaceId: null,
    workspaceSnapshot: null, boundTerminalId: null, terminalHistory: [], lastAnalyzedCommitSha: null,
    children, parentId, tags: [], createdAt: '', updatedAt: ''
  })
  return {
    schemaVersion: 2, contentRevision: 3, id: 'bp', name: 'BP', description: '', rootNodeId: 'root',
    nodeIds: ['root', 'child'], nodes: { root: node('root', null, ['child']), child: node('child', 'root') },
    requirementCandidates: [], mountedTo: null, canvasLayout: {}, createdAt: '', updatedAt: ''
  }
}

describe('Blueprint maintenance ChangeSet', () => {
  it('applies selected update and create operations to a clone', () => {
    const source = fixture()
    const operations = [
      { operationId: 'u', type: 'update-node' as const, nodeId: 'child', before: { title: 'child' }, after: { title: 'Changed' }, reason: '', evidenceRefs: [], dependsOn: [], risk: 'low' as const },
      { operationId: 'c', type: 'create-node' as const, tempNodeId: 'new-1', parentId: 'child', after: { title: 'New', type: 'task' as const, description: '', positioning: '', techSolution: '', notes: '', tags: [] }, reason: '', evidenceRefs: [], dependsOn: [], risk: 'low' as const }
    ]
    const result = applyOperations(source, operations, new Set(['root', 'child']))
    expect(result.contentRevision).toBe(4)
    expect(result.nodes.child.title).toBe('Changed')
    expect(result.nodes.child.children).toHaveLength(1)
    expect(source.nodes.child.title).toBe('child')
  })

  it('rejects a partial selection with a missing dependency', () => {
    const changeSet = { operations: [
      { operationId: 'child', type: 'update-node', nodeId: 'child', before: {}, after: { title: 'x' }, reason: '', evidenceRefs: [], dependsOn: ['parent'], risk: 'low' }
    ] } as BlueprintChangeSet
    expect(() => selectOperations(changeSet, ['child'])).toThrow('缺少依赖')
  })

  it('orders selected operations by dependencies and rejects dependency cycles', () => {
    const dependent = { operationId: 'child', type: 'update-node', nodeId: 'child', before: {}, after: { title: 'x' }, reason: '', evidenceRefs: [], dependsOn: ['parent'], risk: 'low' } as const
    const parent = { operationId: 'parent', type: 'update-node', nodeId: 'child', before: {}, after: { notes: 'y' }, reason: '', evidenceRefs: [], dependsOn: [], risk: 'low' } as const
    expect(selectOperations({ operations: [dependent, parent] } as BlueprintChangeSet, ['child', 'parent']).map((item) => item.operationId)).toEqual(['parent', 'child'])

    const cyclic = { operations: [{ ...dependent, dependsOn: ['parent'] }, { ...parent, dependsOn: ['child'] }] } as BlueprintChangeSet
    expect(() => selectOperations(cyclic, ['child', 'parent'])).toThrow('依赖不能形成环')
  })

  it('rejects moving a node outside the authorized scope', () => {
    expect(() => applyOperations(fixture(), [{
      operationId: 'm', type: 'move-node', nodeId: 'child', beforeParentId: 'root', afterParentId: 'root',
      reason: '', evidenceRefs: [], dependsOn: [], risk: 'low'
    }], new Set(['child']))).toThrow('目标父节点不在维护范围内')
  })

  it('rejects a move that creates a hierarchy cycle', () => {
    const source = fixture()
    source.nodes.leaf = { ...source.nodes.child, id: 'leaf', title: 'leaf', parentId: 'child', children: [] }
    source.nodes.child.children = ['leaf']
    source.nodeIds.push('leaf')
    expect(() => applyOperations(source, [{
      operationId: 'm', type: 'move-node', nodeId: 'child', beforeParentId: 'root', afterParentId: 'leaf',
      reason: '', evidenceRefs: [], dependsOn: [], risk: 'low'
    }], new Set(['root', 'child', 'leaf']))).toThrow('层级不能形成环')
  })
})
