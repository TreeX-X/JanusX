import { describe, expect, it } from 'vitest'
import {
  computeBlueprintLayout,
  computeBlueprintSubtreeLayout,
  createDefaultLayoutRecovery,
  deriveBlueprintFlow,
  deriveBlueprintCardData
} from '../../src/renderer/src/features/blueprint/canvas-layout'
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

  it('retains the previous manual layout for undoing a default-layout restore', () => {
    const blueprint = {
      id: 'bp', rootNodeId: 'root', nodeIds: ['root'], canvasLayout: {},
      nodes: { root: { id: 'root', parentId: null } },
    } as unknown as Blueprint
    const current = { root: { x: 420, y: 210 } }

    const recovery = createDefaultLayoutRecovery(blueprint, current)

    expect(recovery.next.root).toEqual({ x: 0, y: 0 })
    expect(recovery.previous).toEqual(current)
    expect(recovery.previous).not.toBe(current)
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
