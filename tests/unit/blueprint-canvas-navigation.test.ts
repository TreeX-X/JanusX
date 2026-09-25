import { describe, expect, it } from 'vitest'
import type { BlueprintNode } from '../../src/renderer/src/services/blueprint'
import {
  collectLocalHierarchyIds,
  computeInitialCollapsedIds,
  stepMatchIndex,
  visibleNodeIds
} from '../../src/renderer/src/features/blueprint/canvas-navigation'

const nodes = {
  root: { id: 'root', parentId: null, children: ['branch'] },
  branch: { id: 'branch', parentId: 'root', children: ['leaf'] },
  leaf: { id: 'leaf', parentId: 'branch', children: ['deep'] },
  deep: { id: 'deep', parentId: 'leaf', children: [] },
} as unknown as Record<string, BlueprintNode>

function buildTree(spec: { id: string; parentId: string | null; childIds: string[] }[]): {
  nodes: Record<string, BlueprintNode>
  nodeIds: string[]
} {
  return {
    nodes: Object.fromEntries(spec.map((entry) => [
      entry.id,
      { id: entry.id, parentId: entry.parentId, children: entry.childIds } as unknown as BlueprintNode
    ])),
    nodeIds: spec.map((entry) => entry.id)
  }
}

describe('blueprint canvas navigation', () => {
  it('uses parentId for local descendants and collapse decisions despite stale children', () => {
    const tree = buildTree([
      { id: 'root', parentId: null, childIds: ['unrelated'] },
      { id: 'branch', parentId: 'root', childIds: [] },
      { id: 'leaf', parentId: 'branch', childIds: [] },
      { id: 'unrelated', parentId: null, childIds: [] },
    ])
    expect(collectLocalHierarchyIds(tree.nodes, 'root', 2)).toEqual(new Set(['root', 'branch', 'leaf']))
    expect(computeInitialCollapsedIds(tree.nodes, tree.nodeIds, 3)).toEqual(new Set(['branch']))
  })

  it('keeps the cycle representative visible when collapsed and uses the same effective hierarchy locally', () => {
    const tree = buildTree([
      { id: 'a', parentId: 'c', childIds: ['b'] },
      { id: 'b', parentId: 'a', childIds: ['c'] },
      { id: 'c', parentId: 'b', childIds: ['a'] },
    ])
    expect(visibleNodeIds(tree.nodes, tree.nodeIds, new Set(['a']))).toEqual(['a'])
    expect(visibleNodeIds(tree.nodes, tree.nodeIds, new Set())).toEqual(tree.nodeIds)
    expect(visibleNodeIds(tree.nodes, tree.nodeIds, new Set(['b']))).toEqual(['a', 'b'])
    expect(collectLocalHierarchyIds(tree.nodes, 'a', 1)).toEqual(new Set(['a', 'b']))
    expect(computeInitialCollapsedIds(tree.nodes, tree.nodeIds, 2)).toEqual(new Set(['b']))
    expect(computeInitialCollapsedIds(Object.fromEntries(Object.entries(tree.nodes).reverse()), [...tree.nodeIds].reverse(), 2)).toEqual(new Set(['b']))
  })

  it('keeps a self-parent representative visible when collapsed', () => {
    const tree = buildTree([{ id: 'self', parentId: 'self', childIds: ['self'] }])
    expect(visibleNodeIds(tree.nodes, tree.nodeIds, new Set(['self']))).toEqual(['self'])
    expect(visibleNodeIds(tree.nodes, tree.nodeIds, new Set())).toEqual(['self'])
    expect(collectLocalHierarchyIds(tree.nodes, 'self', 5)).toEqual(new Set(['self']))
  })

  it('treats missing parents as roots when filtering visibility', () => {
    const tree = buildTree([
      { id: 'orphan', parentId: 'missing', childIds: [] },
      { id: 'child', parentId: 'orphan', childIds: [] },
    ])
    expect(visibleNodeIds(tree.nodes, tree.nodeIds, new Set(['missing']))).toEqual(tree.nodeIds)
    expect(collectLocalHierarchyIds(tree.nodes, 'child', 1)).toEqual(new Set(['child', 'orphan']))
  })

  it('includes every ancestor and only the configured descendant depth', () => {
    expect([...collectLocalHierarchyIds(nodes, 'branch', 1)]).toEqual(['branch', 'root', 'leaf'])
    expect(collectLocalHierarchyIds(nodes, 'branch', 2).has('deep')).toBe(true)
  })

  it('excludes matches hidden by collapsed ancestors and wraps stepping', () => {
    expect(visibleNodeIds(nodes, ['root', 'leaf', 'deep'], new Set(['branch']))).toEqual(['root'])
    expect(stepMatchIndex(0, -1, 3)).toBe(2)
    expect(stepMatchIndex(2, 1, 3)).toBe(0)
    expect(stepMatchIndex(9, 0, 2)).toBe(1)
  })

  it('keeps small blueprints fully expanded', () => {
    const tree = buildTree([
      { id: 'root', parentId: null, childIds: ['a', 'b'] },
      { id: 'a', parentId: 'root', childIds: [] },
      { id: 'b', parentId: 'root', childIds: [] },
    ])
    expect(computeInitialCollapsedIds(tree.nodes, tree.nodeIds)).toEqual(new Set())
  })

  it('collapses wide shallow blueprints down to root plus first level', () => {
    const spec = [{ id: 'root', parentId: null as string | null, childIds: [] as string[] }]
    for (let m = 0; m < 5; m++) {
      const moduleId = `m${m}`
      const taskIds = Array.from({ length: 8 }, (_, i) => `${moduleId}-t${i}`)
      spec[0].childIds.push(moduleId)
      spec.push({ id: moduleId, parentId: 'root', childIds: taskIds })
      taskIds.forEach((taskId) => spec.push({ id: taskId, parentId: moduleId, childIds: [] }))
    }
    const tree = buildTree(spec)

    const collapsed = computeInitialCollapsedIds(tree.nodes, tree.nodeIds)

    expect(collapsed).toEqual(new Set(['m0', 'm1', 'm2', 'm3', 'm4']))
  })

  it('keeps deeper levels visible while the running total fits the budget', () => {
    const spec = [{ id: 'root', parentId: null as string | null, childIds: [] as string[] }]
    const epicIds = ['e0', 'e1', 'e2']
    spec[0].childIds = epicIds
    const featureIds: string[] = []
    epicIds.forEach((epicId, epicIndex) => {
      const children = Array.from({ length: 4 }, (_, i) => `${epicId}-f${i}`)
      featureIds.push(...children)
      spec.push({ id: epicId, parentId: 'root', childIds: children })
      children.forEach((featureId, featureIndex) => {
        const taskIds = epicIndex * 4 + featureIndex < 10
          ? Array.from({ length: 3 }, (_, i) => `${featureId}-t${i}`)
          : []
        spec.push({ id: featureId, parentId: epicId, childIds: taskIds })
        taskIds.forEach((taskId) => spec.push({ id: taskId, parentId: featureId, childIds: [] }))
      })
    })
    const tree = buildTree(spec)

    const collapsed = computeInitialCollapsedIds(tree.nodes, tree.nodeIds)

    expect(epicIds.some((id) => collapsed.has(id))).toBe(false)
    expect(collapsed).toEqual(new Set(featureIds.filter((id) => tree.nodes[id].children.length > 0)))
  })
})
