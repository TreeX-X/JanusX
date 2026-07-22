import { describe, expect, it } from 'vitest'
import type { BlueprintNode } from '../../src/renderer/src/services/blueprint'
import { collectLocalHierarchyIds, stepMatchIndex, visibleNodeIds } from '../../src/renderer/src/features/blueprint/canvas-navigation'

const nodes = {
  root: { id: 'root', parentId: null, children: ['branch'] },
  branch: { id: 'branch', parentId: 'root', children: ['leaf'] },
  leaf: { id: 'leaf', parentId: 'branch', children: ['deep'] },
  deep: { id: 'deep', parentId: 'leaf', children: [] },
} as unknown as Record<string, BlueprintNode>

describe('blueprint canvas navigation', () => {
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
})
