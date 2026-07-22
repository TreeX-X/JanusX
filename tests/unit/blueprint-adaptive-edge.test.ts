import { describe, expect, it } from 'vitest'
import { Position } from '@xyflow/react'
import { getAdaptiveEdgeEndpoints } from '../../src/renderer/src/features/blueprint/adaptive-edge-geometry'
import { deriveBlueprintFlow } from '../../src/renderer/src/features/blueprint/canvas-layout'
import type { Blueprint } from '../../src/renderer/src/services/blueprint'

const rect = (x: number, y: number, width = 100, height = 50) => ({ x, y, width, height })

describe('blueprint adaptive edge geometry', () => {
  it('uses right and left boundaries for horizontal nodes', () => {
    const endpoints = getAdaptiveEdgeEndpoints(rect(0, 0), rect(300, 0))

    expect(endpoints.source).toEqual({ x: 100, y: 25, position: Position.Right })
    expect(endpoints.target).toEqual({ x: 300, y: 25, position: Position.Left })
  })

  it('uses bottom and top boundaries for vertical nodes', () => {
    const endpoints = getAdaptiveEdgeEndpoints(rect(0, 0), rect(0, 200))

    expect(endpoints.source).toEqual({ x: 50, y: 50, position: Position.Bottom })
    expect(endpoints.target).toEqual({ x: 50, y: 200, position: Position.Top })
  })

  it('selects the first intersected card sides for diagonal geometry', () => {
    const endpoints = getAdaptiveEdgeEndpoints(rect(0, 0), rect(100, 200))

    expect(endpoints.source.position).toBe(Position.Bottom)
    expect(endpoints.source.x).toBeGreaterThan(50)
    expect(endpoints.target.position).toBe(Position.Top)
    expect(endpoints.target.x).toBeLessThan(150)
  })

  it('uses a deterministic vertical route for overlapping centers', () => {
    const endpoints = getAdaptiveEdgeEndpoints(rect(10, 20), rect(10, 20))

    expect(endpoints.source).toEqual({ x: 60, y: 70, position: Position.Bottom })
    expect(endpoints.target).toEqual({ x: 60, y: 20, position: Position.Top })
  })

  it('does not change edge identity or topology when node positions move', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'child'], canvasLayout: {},
      nodes: {
        root: { id: 'root', title: 'Root', type: 'epic', status: 'planned', progress: 0, parentId: null, children: ['child'] },
        child: { id: 'child', title: 'Child', type: 'task', status: 'planned', progress: 0, parentId: 'root', children: [] },
      },
    } as unknown as Blueprint
    const before = deriveBlueprintFlow(blueprint, { root: { x: 0, y: 0 }, child: { x: 0, y: 200 } }, {}, new Set(), false)
    const after = deriveBlueprintFlow(blueprint, { root: { x: 400, y: 200 }, child: { x: 0, y: 200 } }, {}, new Set(), false)

    expect(after.edges).toEqual(before.edges)
    expect(after.edges[0]).toMatchObject({
      id: 'e-root->child', source: 'root', target: 'child', type: 'blueprintAdaptive'
    })
    expect(blueprint.nodes.child.parentId).toBe('root')
  })
})
