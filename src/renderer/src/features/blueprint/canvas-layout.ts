import type { Edge, Node } from '@xyflow/react'
import type { Blueprint, BlueprintNode } from '@/services/blueprint'
import type { BlueprintNodeData } from '@/components/blueprint/BlueprintNodeCard'
import { STATUS_VISUALS } from '@/components/blueprint/blueprintStatus'

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const
const SEVERITY_LABEL = ['低', '中', '高', '严重'] as const

interface BlueprintGraphIndex {
  childrenByParent: Map<string, string[]>
  descendantsById: Map<string, BlueprintNode[]>
}

function buildBlueprintGraphIndex(blueprint: Blueprint): BlueprintGraphIndex {
  const childrenByParent = new Map<string, string[]>()
  for (const id of blueprint.nodeIds) {
    const parentId = blueprint.nodes[id]?.parentId
    if (!parentId || !blueprint.nodes[parentId]) continue
    const children = childrenByParent.get(parentId) ?? []
    children.push(id)
    childrenByParent.set(parentId, children)
  }
  const descendantsById = new Map<string, BlueprintNode[]>()
  const collect = (id: string): BlueprintNode[] => {
    const cached = descendantsById.get(id)
    if (cached) return cached
    const descendants: BlueprintNode[] = []
    for (const childId of childrenByParent.get(id) ?? []) {
      const child = blueprint.nodes[childId]
      if (child) descendants.push(child, ...collect(childId))
    }
    descendantsById.set(id, descendants)
    return descendants
  }
  for (const id of blueprint.nodeIds) collect(id)
  return { childrenByParent, descendantsById }
}

function descendantsOf(blueprint: Blueprint, nodeId: string, index?: BlueprintGraphIndex): BlueprintNode[] {
  if (index) return index.descendantsById.get(nodeId) ?? []
  const descendants: BlueprintNode[] = []
  const childrenByParent = new Map<string, BlueprintNode[]>()
  for (const id of blueprint.nodeIds) {
    const node = blueprint.nodes[id]
    if (!node?.parentId) continue
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }
  const visit = (id: string) => {
    const children = childrenByParent.get(id) ?? []
    for (const child of children) { descendants.push(child); visit(child.id) }
  }
  visit(nodeId)
  return descendants
}

export function deriveBlueprintCardData(
  blueprint: Blueprint,
  node: BlueprintNode,
  workspaceNameById: Record<string, string>,
  focused: boolean,
  focusActive: boolean,
  collapsed: boolean,
  index?: BlueprintGraphIndex,
): BlueprintNodeData {
  const openIssues = (node.issues ?? []).filter((issue) => issue.status === 'open')
  const highestSeverity = openIssues.reduce((highest, issue) => Math.max(highest, SEVERITY_RANK[issue.severity]), -1)
  const latest = node.analyses?.at(-1)
  const analysisAge = latest ? Math.max(0, Math.round((Date.now() - new Date(latest.createdAt).getTime()) / 86400000)) : 0
  const descendants = collapsed ? descendantsOf(blueprint, node.id, index) : []
  const subtreeOpenIssues = descendants.flatMap((item) => item.issues ?? []).filter((issue) => issue.status === 'open')
  const subtreeDone = descendants.filter((item) => item.status === 'done').length
  return {
    title: node.title,
    status: node.status,
    nodeType: node.type,
    progress: node.progress,
    workspaceName: node.workspaceId ? workspaceNameById[node.workspaceId] ?? node.workspaceSnapshot?.name ?? null : null,
    boundTerminalId: node.boundTerminalId,
    childCount: (node.children ?? []).filter((childId) => blueprint.nodes[childId]).length,
    collapsed,
    childSummary: node.children?.length ? `${node.children.filter((id) => blueprint.nodes[id]?.status === 'done').length}/${node.children.length} 子项完成` : undefined,
    issueSummary: openIssues.length ? `${openIssues.length} 问题 · ${SEVERITY_LABEL[highestSeverity]}` : undefined,
    blockedReason: node.status === 'blocked' ? (openIssues[0]?.title || '状态阻塞') : undefined,
    analysisSummary: latest ? `分析 ${Math.round((latest.result.confidence ?? 0) * 100)}% · ${analysisAge === 0 ? '今日' : `${analysisAge}天前`}` : undefined,
    collapsedSummary: collapsed && descendants.length ? `已折叠 ${descendants.length} · ${subtreeDone}/${descendants.length} 完成${subtreeOpenIssues.length ? ` · ${subtreeOpenIssues.length} 风险` : ''}` : undefined,
    searchMatched: focusActive && focused,
    searchDimmed: focusActive && !focused,
  }
}

const NODE_W = 240
const NODE_H = 110
const X_GAP = 32
const Y_GAP = 64
/** 网格行距比层级行距更紧凑，让同父叶子读作一个分组块 */
const GRID_ROW_GAP = 48
/** 兄弟子树之间的额外间距，用于视觉分组 */
const SUBTREE_GAP = 64
/** 独立根树之间的间距 */
const ROOT_GAP = 120
const GRID_MAX_COLS = 4
const ROW_PITCH = NODE_H + Y_GAP
const GRID_ROW_PITCH = NODE_H + GRID_ROW_GAP
const layoutCache = new WeakMap<object, Map<string, Record<string, { x: number; y: number }>>>()

function layoutSignature(collapsedNodeIds: Set<string>, overrides: Blueprint['canvasLayout']): string {
  const collapsed = [...collapsedNodeIds].sort().join(',')
  const positions = Object.entries(overrides ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, point]) => `${id}:${point.x},${point.y}`)
    .join('|')
  return `${collapsed}::${positions}`
}

/** 叶子网格列数：接近正方形，上限 GRID_MAX_COLS，避免画布单向铺开 */
function gridColumns(count: number): number {
  return Math.max(1, Math.min(GRID_MAX_COLS, Math.ceil(Math.sqrt(count))))
}

function gridBlockWidth(count: number): number {
  const cols = gridColumns(count)
  return cols * NODE_W + (cols - 1) * X_GAP
}

export function computeBlueprintLayout(
  nodes: Record<string, BlueprintNode>,
  rootNodeId: string,
  canvasLayout: Blueprint['canvasLayout'],
): Record<string, { x: number; y: number }> {
  const childrenOf: Record<string, string[]> = {}
  const roots: string[] = []
  for (const id of Object.keys(nodes)) {
    const parentId = nodes[id].parentId
    if (parentId && nodes[parentId]) (childrenOf[parentId] ??= []).push(id)
    else roots.push(id)
  }
  roots.sort((a, b) => (a === rootNodeId ? -1 : b === rootNodeId ? 1 : 0))

  const splitChildren = (id: string) => {
    const children = childrenOf[id] ?? []
    return {
      branches: children.filter((childId) => (childrenOf[childId] ?? []).length > 0),
      leaves: children.filter((childId) => (childrenOf[childId] ?? []).length === 0)
    }
  }

  const widths: Record<string, number> = {}
  const measure = (id: string): number => {
    const { branches, leaves } = splitChildren(id)
    const units = branches.map(measure)
    if (leaves.length) units.push(gridBlockWidth(leaves.length))
    widths[id] = units.length
      ? Math.max(NODE_W, units.reduce((sum, width) => sum + width, 0) + SUBTREE_GAP * (units.length - 1))
      : NODE_W
    return widths[id]
  }

  const positions: Record<string, { x: number; y: number }> = {}
  const place = (id: string, left: number, depth: number): void => {
    const width = widths[id]
    const { branches, leaves } = splitChildren(id)
    const y = depth * ROW_PITCH
    if (!branches.length && !leaves.length) {
      positions[id] = { x: left + (width - NODE_W) / 2, y }
      return
    }
    const unitWidths = branches.map((childId) => widths[childId])
    if (leaves.length) unitWidths.push(gridBlockWidth(leaves.length))
    const unitsTotal = unitWidths.reduce((sum, unitWidth) => sum + unitWidth, 0) + SUBTREE_GAP * (unitWidths.length - 1)
    let cursor = left + (width - unitsTotal) / 2
    let extentLeft = Number.POSITIVE_INFINITY
    let extentRight = Number.NEGATIVE_INFINITY
    const track = (x: number) => {
      extentLeft = Math.min(extentLeft, x)
      extentRight = Math.max(extentRight, x + NODE_W)
    }
    for (const childId of branches) {
      place(childId, cursor, depth + 1)
      track(positions[childId].x)
      cursor += widths[childId] + SUBTREE_GAP
    }
    if (leaves.length) {
      const cols = gridColumns(leaves.length)
      leaves.forEach((leafId, index) => {
        const position = {
          x: cursor + (index % cols) * (NODE_W + X_GAP),
          y: (depth + 1) * ROW_PITCH + Math.floor(index / cols) * GRID_ROW_PITCH
        }
        positions[leafId] = position
        track(position.x)
      })
    }
    positions[id] = { x: (extentLeft + extentRight) / 2 - NODE_W / 2, y }
  }

  let rootLeft = 0
  for (const rootId of roots) {
    measure(rootId)
    place(rootId, rootLeft, 0)
    rootLeft += widths[rootId] + ROOT_GAP
  }
  for (const id of Object.keys(canvasLayout)) {
    if (nodes[id] && canvasLayout[id]) positions[id] = canvasLayout[id]
  }
  return positions
}

/** 收集 nodeId 及其全部后代（含 nodeId 自身） */
export function collectSubtreeIds(blueprint: Blueprint, nodeId: string): Set<string> {
  const subtreeIds = new Set<string>()
  const childrenByParent = buildBlueprintGraphIndex(blueprint).childrenByParent
  const visit = (id: string) => {
    if (subtreeIds.has(id) || !blueprint.nodes[id]) return
    subtreeIds.add(id)
    for (const childId of childrenByParent.get(id) ?? []) visit(childId)
  }
  visit(nodeId)
  return subtreeIds
}

/** 折叠集合展开为被隐藏的后代 id 集合 */
export function collectHiddenNodeIds(blueprint: Blueprint, collapsedNodeIds: Set<string>): Set<string> {
  const hidden = new Set<string>()
  const childrenByParent = buildBlueprintGraphIndex(blueprint).childrenByParent
  const hideDescendants = (id: string) => (childrenByParent.get(id) ?? []).forEach((childId) => {
    if (!hidden.has(childId)) { hidden.add(childId); hideDescendants(childId) }
  })
  collapsedNodeIds.forEach(hideDescendants)
  return hidden
}

/** 只对折叠后可见的树计算布局，折叠子树时画布随之收紧 */
export function computeVisibleBlueprintLayout(
  blueprint: Blueprint,
  collapsedNodeIds: Set<string>,
  overrides: Blueprint['canvasLayout'],
  index: BlueprintGraphIndex = buildBlueprintGraphIndex(blueprint),
): Record<string, { x: number; y: number }> {
  const signature = layoutSignature(collapsedNodeIds, overrides)
  const cached = layoutCache.get(blueprint)?.get(signature)
  if (cached) return cached
  const hidden = new Set<string>()
  const hideDescendants = (id: string) => (index.childrenByParent.get(id) ?? []).forEach((childId) => {
    if (!hidden.has(childId)) { hidden.add(childId); hideDescendants(childId) }
  })
  collapsedNodeIds.forEach(hideDescendants)
  const visibleNodes: Record<string, BlueprintNode> = {}
  for (const id of blueprint.nodeIds) {
    if (!hidden.has(id) && blueprint.nodes[id]) visibleNodes[id] = blueprint.nodes[id]
  }
  const layout = computeBlueprintLayout(visibleNodes, blueprint.rootNodeId, overrides ?? {})
  const entries = layoutCache.get(blueprint) ?? new Map<string, Record<string, { x: number; y: number }>>()
  entries.set(signature, layout)
  layoutCache.set(blueprint, entries)
  return layout
}

export function computeBlueprintSubtreeLayout(
  blueprint: Blueprint,
  nodeId: string,
  current: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  if (!blueprint.nodes[nodeId]) return current
  const subtreeIds = collectSubtreeIds(blueprint, nodeId)

  const defaults = computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {})
  const anchor = current[nodeId] ?? defaults[nodeId] ?? { x: 0, y: 0 }
  const defaultAnchor = defaults[nodeId] ?? { x: 0, y: 0 }
  const next = { ...current }
  for (const id of subtreeIds) {
    const position = defaults[id]
    if (position) next[id] = {
      x: anchor.x + position.x - defaultAnchor.x,
      y: anchor.y + position.y - defaultAnchor.y,
    }
  }
  return next
}

export function deriveBlueprintFlow(
  blueprint: Blueprint,
  overrides: Blueprint['canvasLayout'] | undefined,
  workspaceNameById: Record<string, string>,
  focusedNodeIds: Set<string>,
  focusActive: boolean,
  collapsedNodeIds: Set<string> = new Set(),
): { nodes: Node<BlueprintNodeData, 'blueprint'>[]; edges: Edge[] } {
  const index = buildBlueprintGraphIndex(blueprint)
  const hidden = new Set<string>()
  const hideDescendants = (id: string) => (index.childrenByParent.get(id) ?? []).forEach((childId) => {
    if (!hidden.has(childId)) { hidden.add(childId); hideDescendants(childId) }
  })
  collapsedNodeIds.forEach(hideDescendants)
  const layout = computeVisibleBlueprintLayout(blueprint, collapsedNodeIds, overrides ?? blueprint.canvasLayout ?? {}, index)
  const nodes: Node<BlueprintNodeData, 'blueprint'>[] = blueprint.nodeIds
    .filter((id) => !hidden.has(id))
    .filter((id) => blueprint.nodes[id])
    .map((id) => {
      const node = blueprint.nodes[id]
      const focused = focusedNodeIds.has(id)
      return {
        id,
        type: 'blueprint',
        position: layout[id] ?? { x: 0, y: 0 },
        data: deriveBlueprintCardData(blueprint, node, workspaceNameById, focused, focusActive, collapsedNodeIds.has(id), index),
      }
    })
  const edges: Edge[] = blueprint.nodeIds
    .filter((id) => !hidden.has(id))
    .filter((id) => {
      const node = blueprint.nodes[id]
      return node && node.parentId && blueprint.nodes[node.parentId] && !hidden.has(node.parentId)
    })
    .map((id) => ({
      id: `e-${blueprint.nodes[id].parentId}->${id}`,
      source: blueprint.nodes[id].parentId as string,
      target: id,
      type: 'blueprintAdaptive',
      style: {
        stroke: `${STATUS_VISUALS[blueprint.nodes[id].status]?.color ?? '#888888'}66`,
        strokeWidth: 1.6
      },
    }))
  return { nodes, edges }
}
