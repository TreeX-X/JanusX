import { describe, expect, it } from 'vitest'
import {
  computeBlueprintLayout,
  computeBlueprintSubtreeLayout,
  computeVisibleBlueprintLayout,
  deriveBlueprintFlow,
  deriveBlueprintCardData
} from '../../src/renderer/src/features/blueprint/canvas-layout'
import type { Blueprint, BlueprintNode } from '../../src/renderer/src/services/blueprint'

describe('blueprint canvas layout', () => {
  it('derives stable nodes and parent edges while preserving saved positions', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'child'], canvasLayout: { root: { x: 42, y: 24 } },
      nodes: {
        root: { id: 'root', title: 'Root', type: 'epic', status: 'planned', progress: 0, parentId: null, children: ['child'] },
        child: { id: 'child', title: 'Child', type: 'task', status: 'in-progress', progress: 50, parentId: 'root', children: [] },
      },
    } as unknown as Blueprint

    const result = deriveBlueprintFlow(blueprint, undefined, {}, new Set(['child']), true)

    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.find((node) => node.id === 'root')?.position).toEqual({ x: 42, y: 24 })
    expect(result.nodes.find((node) => node.id === 'child')?.data.searchMatched).toBe(true)
    expect(result.edges).toEqual([expect.objectContaining({ source: 'root', target: 'child' })])
    expect(result.edges[0].style?.stroke).toBe('#22c55e66')
  })

  it('wraps wide leaf sets into a near-square grid instead of a single row', () => {
    const leafIds = Array.from({ length: 9 }, (_, index) => `leaf-${index}`)
    const nodes = {
      root: { id: 'root', parentId: null },
      ...Object.fromEntries(leafIds.map((id) => [id, { id, parentId: 'root' }]))
    } as unknown as Record<string, BlueprintNode>

    const layout = computeBlueprintLayout(nodes, 'root', {})

    expect(layout['leaf-0']).toEqual({ x: 0, y: 174 })
    expect(layout['leaf-4']).toEqual({ x: 272, y: 332 })
    expect(layout['leaf-8']).toEqual({ x: 544, y: 490 })
    expect(layout.root).toEqual({ x: 272, y: 0 })
    const maxX = Math.max(...leafIds.map((id) => layout[id].x))
    expect(maxX).toBe(544)
  })

  it('separates sibling subtrees and centers parents over the children extent', () => {
    const nodes = {
      root: { id: 'root', parentId: null },
      b1: { id: 'b1', parentId: 'root' },
      l1: { id: 'l1', parentId: 'b1' },
      b2: { id: 'b2', parentId: 'root' },
      l2: { id: 'l2', parentId: 'b2' },
    } as unknown as Record<string, BlueprintNode>

    const layout = computeBlueprintLayout(nodes, 'root', {})

    expect(layout.b2.x - layout.b1.x).toBe(304)
    expect(layout.root).toEqual({ x: 152, y: 0 })
    expect(layout.b1.y).toBe(174)
    expect(layout.l1.y).toBe(348)
  })

  it('compacts the canvas around visible nodes when subtrees are collapsed', () => {
    const leafIds = Array.from({ length: 10 }, (_, index) => `t-${index}`)
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'm1', 'm2', ...leafIds], canvasLayout: {},
      nodes: {
        root: { id: 'root', title: 'Root', type: 'epic', status: 'planning', progress: 0, parentId: null, children: ['m1', 'm2'] },
        m1: { id: 'm1', title: 'M1', type: 'feature', status: 'planning', progress: 0, parentId: 'root', children: leafIds.slice(0, 5) },
        m2: { id: 'm2', title: 'M2', type: 'feature', status: 'planning', progress: 0, parentId: 'root', children: leafIds.slice(5) },
        ...Object.fromEntries(leafIds.map((id, index) => [id, {
          id, title: id, type: 'task', status: 'planning', progress: 0,
          parentId: index < 5 ? 'm1' : 'm2', children: []
        }]))
      },
    } as unknown as Blueprint

    const collapsed = new Set(['m1', 'm2'])
    const result = deriveBlueprintFlow(blueprint, {}, {}, new Set(), false, collapsed)

    expect(result.nodes.map((node) => node.id).sort()).toEqual(['m1', 'm2', 'root'])
    const m1 = result.nodes.find((node) => node.id === 'm1')!
    const m2 = result.nodes.find((node) => node.id === 'm2')!
    expect(m2.position.x - m1.position.x).toBe(272)
    expect(computeVisibleBlueprintLayout(blueprint, collapsed, {}).m2).toEqual(m2.position)
  })

  it('keeps saved positions when collapse visibility changes', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'branch', 'leaf'],
      canvasLayout: {
        root: { x: 120, y: 40 },
        branch: { x: 480, y: 260 },
        leaf: { x: 820, y: 540 },
      },
      nodes: {
        root: { id: 'root', parentId: null, children: ['branch'] },
        branch: { id: 'branch', parentId: 'root', children: ['leaf'] },
        leaf: { id: 'leaf', parentId: 'branch', children: [] },
      },
    } as unknown as Blueprint

    const collapsed = deriveBlueprintFlow(blueprint, blueprint.canvasLayout, {}, new Set(), false, new Set(['branch']))
    const expanded = deriveBlueprintFlow(blueprint, blueprint.canvasLayout, {}, new Set(), false, new Set())

    expect(collapsed.nodes.map((node) => [node.id, node.position])).toEqual([
      ['root', { x: 120, y: 40 }],
      ['branch', { x: 480, y: 260 }],
    ])
    expect(expanded.nodes.map((node) => [node.id, node.position])).toEqual([
      ['root', { x: 120, y: 40 }],
      ['branch', { x: 480, y: 260 }],
      ['leaf', { x: 820, y: 540 }],
    ])
  })

  it('lays out only the selected subtree and preserves unrelated manual branches', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'left', 'leaf', 'right'], canvasLayout: {},
      nodes: {
        root: { id: 'root', parentId: null },
        left: { id: 'left', parentId: 'root' },
        leaf: { id: 'leaf', parentId: 'left' },
        right: { id: 'right', parentId: 'root' },
      },
    } as unknown as Blueprint
    const current = {
      root: { x: 50, y: 50 }, left: { x: 400, y: 300 }, leaf: { x: 999, y: 999 }, right: { x: 900, y: 400 },
    }

    const result = computeBlueprintSubtreeLayout(blueprint, 'left', current)

    expect(result.root).toEqual(current.root)
    expect(result.right).toEqual(current.right)
    expect(result.left).toEqual(current.left)
    expect(result.leaf).not.toEqual(current.leaf)
  })

  it('can ignore saved positions when calculating an explicit default layout', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root'], canvasLayout: { root: { x: 999, y: 999 } },
      nodes: { root: { id: 'root', parentId: null } },
    } as unknown as Blueprint

    expect(computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {})).toEqual({ root: { x: 0, y: 0 } })
  })

  it('reuses cached visible layout for the same blueprint and inputs', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root'], canvasLayout: {},
      nodes: { root: { id: 'root', parentId: null, children: [] } },
    } as unknown as Blueprint
    const first = computeVisibleBlueprintLayout(blueprint, new Set(), {})
    const second = computeVisibleBlueprintLayout(blueprint, new Set(), {})
    expect(second).toBe(first)
  })

  it('derives truthful issue and analysis signals and removes them when source data is resolved', () => {
    const now = new Date().toISOString()
    const blueprint = { id: 'bp', rootNodeId: 'root', nodeIds: ['root'], canvasLayout: {}, nodes: { root: {
      id: 'root', title: 'Root', type: 'task', status: 'blocked', progress: 10, parentId: null, children: [], workspaceId: null, boundTerminalId: null,
      issues: [{ id: 'i', title: 'Broken', description: '', severity: 'critical', status: 'open', createdAt: now }],
      analyses: [{ id: 'a', nodeId: 'root', trigger: 'manual', inputSummary: { blueprint: '', actual: '' }, result: { confidence: .8 }, applied: true, createdAt: now }]
    } } } as unknown as Blueprint
    const node = blueprint.nodes.root
    const first = deriveBlueprintCardData(blueprint, node, {}, false, false, false)
    expect(first.issueSummary).toBe('1 问题 · 严重')
    expect(first.analysisSummary).toContain('80%')
    node.issues[0].status = 'resolved'
    node.analyses = []
    const next = deriveBlueprintCardData(blueprint, node, {}, false, false, false)
    expect(next.issueSummary).toBeUndefined()
    expect(next.analysisSummary).toBeUndefined()
  })

  it('hides collapsed descendants and exposes subtree completion and risk aggregates', () => {
    const blueprint = { id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'done', 'risk'], canvasLayout: {}, nodes: {
      root: { id: 'root', title: 'Root', type: 'epic', status: 'in-progress', progress: 20, parentId: null, children: ['done', 'risk'], workspaceId: null, boundTerminalId: null, issues: [], analyses: [] },
      done: { id: 'done', title: 'Done', type: 'task', status: 'done', progress: 100, parentId: 'root', children: [], workspaceId: null, boundTerminalId: null, issues: [], analyses: [] },
      risk: { id: 'risk', title: 'Risk', type: 'task', status: 'blocked', progress: 0, parentId: 'root', children: [], workspaceId: null, boundTerminalId: null, issues: [{ id: 'i', status: 'open', severity: 'high' }], analyses: [] },
    } } as unknown as Blueprint
    const result = deriveBlueprintFlow(blueprint, {}, {}, new Set(), false, new Set(['root']))
    expect(result.nodes.map((node) => node.id)).toEqual(['root'])
    expect(result.edges).toHaveLength(0)
    expect(result.nodes[0].data.collapsedSummary).toBe('已折叠 2 · 1/2 完成 · 1 风险')
  })
})
