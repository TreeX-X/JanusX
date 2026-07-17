import { describe, expect, it } from 'vitest'
import { deriveBlueprintFlow } from '../../src/renderer/src/features/blueprint/canvas-layout'
import type { Blueprint } from '../../src/renderer/src/services/blueprint'

describe('blueprint canvas layout', () => {
  it('derives stable nodes and parent edges while preserving saved positions', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'child'], canvasLayout: { root: { x: 42, y: 24 } },
      nodes: {
        root: { id: 'root', title: 'Root', type: 'epic', status: 'planned', progress: 0, parentId: null, children: ['child'] },
        child: { id: 'child', title: 'Child', type: 'task', status: 'in-progress', progress: 50, parentId: 'root', children: [] },
      },
    } as unknown as Blueprint

    const result = deriveBlueprintFlow(blueprint, {}, {}, new Set(['child']), true)

    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.find((node) => node.id === 'root')?.position).toEqual({ x: 42, y: 24 })
    expect(result.nodes.find((node) => node.id === 'child')?.data.searchMatched).toBe(true)
    expect(result.edges).toEqual([expect.objectContaining({ source: 'root', target: 'child' })])
  })
})
