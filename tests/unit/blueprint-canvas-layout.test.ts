import { describe, expect, it } from 'vitest'
import {
  computeBlueprintLayout,
  computeBlueprintSubtreeLayout,
  computeVisibleBlueprintLayout,
  deriveBlueprintFlow,
  deriveBlueprintCardData,
  collectHiddenNodeIds,
  collectSubtreeIds,
  relationDash
} from '../../src/renderer/src/features/blueprint/canvas-layout'
import type { Blueprint, BlueprintNode } from '../../src/renderer/src/services/blueprint'

function forest(entries: Array<[string, string | null]>): Blueprint {
  return {
    id: 'forest', rootNodeId: entries[0][0], nodeIds: entries.map(([id]) => id), canvasLayout: {},
    nodes: Object.fromEntries(entries.map(([id, parentId]) => [id, {
      id, parentId, children: [], title: id, status: 'planned', progress: 0,
    }])),
  } as unknown as Blueprint
}

function expectNoOverlap(layout: Record<string, { x: number; y: number }>): void {
  const points = Object.values(layout)
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j]
      expect(a.x + 240 <= b.x || b.x + 240 <= a.x || a.y + 110 <= b.y || b.y + 110 <= a.y).toBe(true)
    }
  }
}

describe('blueprint canvas layout', () => {
  it('packs 20 independent roots into bounded columns and a compact two-dimensional forest', () => {
    const blueprint = forest(Array.from({ length: 20 }, (_, i) => [`root-${i}`, null]))
    const layout = computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {})
    expect(Object.keys(layout)).toHaveLength(20)
    expect(computeBlueprintLayout(Object.fromEntries(Object.entries(blueprint.nodes).reverse()), blueprint.rootNodeId, {})).toEqual(layout)
    const rows = new Map<number, number>()
    Object.values(layout).forEach(({ y }) => rows.set(y, (rows.get(y) ?? 0) + 1))
    expect(rows.size).toBeGreaterThan(1)
    expect(Math.max(...rows.values())).toBeLessThanOrEqual(4)
    const width = Math.max(...Object.values(layout).map(({ x }) => x)) + 240
    const height = Math.max(...Object.values(layout).map(({ y }) => y)) + 110
    expect(Math.max(width / height, height / width)).toBeLessThan(3)
    expectNoOverlap(layout)
    expect(deriveBlueprintFlow(blueprint, {}, {}, new Set(), false).edges).toEqual([])
  })

  it('wraps five independent roots onto at least two rows', () => {
    const blueprint = forest(Array.from({ length: 5 }, (_, i) => [`root-${i}`, null]))
    const layout = computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {})
    expect(new Set(Object.values(layout).map(({ y }) => y)).size).toBeGreaterThanOrEqual(2)
  })

  it('keeps coordinates identical under reversed insertion and sorts numeric sibling IDs naturally', () => {
    const blueprint = forest([['root', null], ['leaf-10', 'root'], ['leaf-2', 'root'], ['other', null]])
    const reversed = Object.fromEntries(Object.entries(blueprint.nodes).reverse())
    const layout = computeBlueprintLayout(blueprint.nodes, 'root', {})
    expect(computeBlueprintLayout(reversed, 'root', {})).toEqual(layout)
    expect(layout['leaf-2'].x).toBeLessThan(layout['leaf-10'].x)
  })

  it('packs disconnected tall and wide trees using their full bounding boxes', () => {
    const entries: Array<[string, string | null]> = []
    const groups: string[][] = []
    for (let i = 0; i < 6; i++) {
      const root = `root-${i}`
      const group = [root]
      entries.push([root, null])
      for (let j = 0; j < 12; j++) {
        const id = `${root}-child-${j}`
        entries.push([id, i % 2 === 0 && j > 0 ? group[j] : root])
        group.push(id)
      }
      groups.push(group)
    }
    const blueprint = forest(entries)
    const layout = computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {})
    expect(new Set(groups.map(([id]) => layout[id].y)).size).toBeGreaterThan(1)
    expectNoOverlap(layout)
    const bounds = groups.map((group) => ({
      left: Math.min(...group.map((id) => layout[id].x)),
      right: Math.max(...group.map((id) => layout[id].x)) + 240,
      top: Math.min(...group.map((id) => layout[id].y)),
      bottom: Math.max(...group.map((id) => layout[id].y)) + 110,
    }))
    bounds.forEach((a, i) => bounds.slice(i + 1).forEach((b) =>
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true)
    ))
    entries.forEach(([id, parentId]) => {
      if (parentId) expect(layout[id].y).toBeGreaterThan(layout[parentId].y)
    })
  })

  it('renders pure cycles once with finite deterministic coordinates and preserves raw parent edges', () => {
    const blueprint = forest([['a', 'c'], ['b', 'a'], ['c', 'b'], ['self', 'self']])
    const original = JSON.stringify(blueprint)
    const flow = deriveBlueprintFlow(blueprint, {}, {}, new Set(), false)
    const layout = computeBlueprintLayout(blueprint.nodes, 'a', {})
    expect(flow.nodes.map(({ id }) => id).sort()).toEqual(['a', 'b', 'c', 'self'])
    Object.values(layout).forEach(({ x, y }) => {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    })
    expectNoOverlap(layout)
    expect(computeBlueprintLayout(Object.fromEntries(Object.entries(blueprint.nodes).reverse()), 'a', {})).toEqual(layout)
    expect(flow.edges.map(({ source, target }) => `${source}->${target}`).sort()).toEqual(['a->b', 'b->c', 'c->a', 'self->self'])
    expect(JSON.stringify(blueprint)).toBe(original)
  })

  it('keeps the collapsed cycle representative visible with consistent subtree summaries', () => {
    const blueprint = forest([['a', 'c'], ['b', 'a'], ['c', 'b']])
    const collapsed = new Set(['a'])
    expect(collectHiddenNodeIds(blueprint, collapsed)).toEqual(new Set(['b', 'c']))
    expect(collectSubtreeIds(blueprint, 'b')).toEqual(new Set(['b', 'c']))
    const flow = deriveBlueprintFlow(blueprint, {}, {}, new Set(), false, collapsed)
    expect(flow.nodes.map(({ id }) => id)).toEqual(['a'])
    expect(Object.keys(computeVisibleBlueprintLayout(blueprint, collapsed, {}))).toEqual(['a'])
    expect(flow.nodes[0].data.collapsedSummary).toBe('已折叠 2 · 0/2 完成')
    expect(deriveBlueprintCardData(blueprint, blueprint.nodes.a, {}, false, false, true).collapsedSummary).toBe(flow.nodes[0].data.collapsedSummary)
    const reversed = { ...blueprint, nodeIds: [...blueprint.nodeIds].reverse(), nodes: Object.fromEntries(Object.entries(blueprint.nodes).reverse()) }
    const collapsedBranch = deriveBlueprintFlow(reversed, {}, {}, new Set(), false, new Set(['b']))
    expect(collapsedBranch.nodes.map(({ id }) => id).sort()).toEqual(['a', 'b'])
    expect(collapsedBranch.nodes.find(({ id }) => id === 'b')!.data.collapsedSummary).toBe('已折叠 1 · 0/1 完成')
    expect(deriveBlueprintFlow(blueprint, {}, {}, new Set(), false).nodes).toHaveLength(3)
  })

  it('uses parentId despite stale children and retains missing-parent roots without inventing edges', () => {
    const blueprint = forest([['root', null], ['child', 'root'], ['orphan', 'missing'], ['grandchild', 'orphan']])
    blueprint.nodes.root.children = ['orphan']
    const flow = deriveBlueprintFlow(blueprint, {}, {}, new Set(), false)
    expect(flow.nodes).toHaveLength(4)
    expect(flow.edges.map(({ source, target }) => `${source}->${target}`).sort()).toEqual(['orphan->grandchild', 'root->child'])
    expect(collectSubtreeIds(blueprint, 'root')).toEqual(new Set(['root', 'child']))
    expect(collectHiddenNodeIds(blueprint, new Set(['root']))).toEqual(new Set(['child']))
    expect(flow.nodes.find(({ id }) => id === 'orphan')!.data.childCount).toBe(1)
    const layout = computeBlueprintLayout(blueprint.nodes, 'root', {})
    expect(layout.child.y).toBeGreaterThan(layout.root.y)
    expect(layout.grandchild.y).toBeGreaterThan(layout.orphan.y)
  })

  it('preserves saved drag positions in a compact forest until an explicit reset', () => {
    const blueprint = forest(Array.from({ length: 20 }, (_, i) => [`root-${i}`, null]))
    blueprint.canvasLayout = { 'root-7': { x: -777, y: 999 }, 'root-18': { x: 9000, y: 0 } }
    const saved = deriveBlueprintFlow(blueprint, undefined, {}, new Set(), false)
    Object.entries(blueprint.canvasLayout).forEach(([id, point]) => {
      expect(saved.nodes.find((node) => node.id === id)!.position).toEqual(point)
    })
    const reset = computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {})
    expect(reset['root-7']).not.toEqual(blueprint.canvasLayout['root-7'])
    expect(new Set(Object.values(reset).map(({ y }) => y)).size).toBeGreaterThan(1)
  })

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
    expect(result.edges[0].style).toMatchObject({ stroke: '#8a8a8a', strokeWidth: 1.6 })
    expect(result.edges[0].style).not.toHaveProperty('strokeDasharray')
  })

  it('renders note relations as dashed edges, skipping parent duplicates', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root', 'a', 'b'], canvasLayout: {},
      nodes: {
        root: { id: 'root', title: 'Root', type: 'epic', status: 'planned', progress: 0, parentId: null, children: ['a', 'b'] },
        a: { id: 'a', title: 'A', type: 'task', status: 'in-progress', progress: 0, parentId: 'root', children: [] },
        b: { id: 'b', title: 'B', type: 'task', status: 'done', progress: 100, parentId: 'root', children: [] },
      },
      relations: [
        { id: 'a:depends-on:b', sourceNodeId: 'a', targetNodeId: 'b', type: 'depends-on' },
        { id: 'a:related-to:root', sourceNodeId: 'a', targetNodeId: 'root', type: 'related-to' },
        { id: 'a:related-to:missing', sourceNodeId: 'a', targetNodeId: 'missing', type: 'related-to' },
      ],
    } as unknown as Blueprint

    const result = deriveBlueprintFlow(blueprint, undefined, {}, new Set(), false)

    const rel = result.edges.find((edge) => edge.id === 'e-rel-a-depends-on-b')
    expect(rel).toMatchObject({ source: 'a', target: 'b' })
    expect(rel?.style).toMatchObject({ stroke: 'rgba(255,255,255,.2)', strokeDasharray: '5 4' })
    // Mirrors the parent edge root->a: skipped to avoid double-drawing.
    expect(result.edges.some((edge) => edge.id === 'e-rel-a-related-to-root')).toBe(false)
    // Dangling targets never render.
    expect(result.edges.some((edge) => String(edge.id).includes('missing'))).toBe(false)
  })

  it('maps each relation type onto its own dash language', () => {
    expect(relationDash('depends-on')).toBe('5 4')
    expect(relationDash('implements')).toBe('2 3')
    expect(relationDash('related-to')).toBe('5 5')
    expect(relationDash('blocks')).toBe('5 5')
    expect(relationDash('')).toBe('5 5')
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
