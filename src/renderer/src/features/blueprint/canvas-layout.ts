import type { Edge, Node } from '@xyflow/react'
import type { Blueprint, BlueprintNode } from '@/services/blueprint'
import type { BlueprintNodeData } from '@/components/blueprint/BlueprintNodeCard'

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const
const SEVERITY_LABEL = ['低', '中', '高', '严重'] as const

function descendantsOf(blueprint: Blueprint, nodeId: string): BlueprintNode[] {
  const descendants: BlueprintNode[] = []
  const visit = (id: string) => blueprint.nodeIds.forEach((candidateId) => {
    const child = blueprint.nodes[candidateId]
    if (child?.parentId === id) { descendants.push(child); visit(child.id) }
  })
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
): BlueprintNodeData {
  const openIssues = (node.issues ?? []).filter((issue) => issue.status === 'open')
  const highestSeverity = openIssues.reduce((highest, issue) => Math.max(highest, SEVERITY_RANK[issue.severity]), -1)
  const latest = node.analyses?.at(-1)
  const analysisAge = latest ? Math.max(0, Math.round((Date.now() - new Date(latest.createdAt).getTime()) / 86400000)) : 0
  const descendants = collapsed ? descendantsOf(blueprint, node.id) : []
  const subtreeOpenIssues = descendants.flatMap((item) => item.issues ?? []).filter((issue) => issue.status === 'open')
  const subtreeDone = descendants.filter((item) => item.status === 'done').length
  return {
    title: node.title,
    status: node.status,
    nodeType: node.type,
    progress: node.progress,
    workspaceName: node.workspaceId ? workspaceNameById[node.workspaceId] ?? node.workspaceSnapshot?.name ?? null : null,
    boundTerminalId: node.boundTerminalId,
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
  const positions: Record<string, { x: number; y: number }> = {}
  let cursor = 0
  const place = (id: string, depth: number): number => {
    const children = childrenOf[id] ?? []
    if (children.length === 0) {
      const x = cursor * (NODE_W + X_GAP)
      cursor++
      positions[id] = { x, y: depth * (NODE_H + Y_GAP) }
      return x
    }
    const childXs = children.map((childId) => place(childId, depth + 1))
    const x = childXs.reduce((sum, childX) => sum + childX, 0) / childXs.length
    positions[id] = { x, y: depth * (NODE_H + Y_GAP) }
    return x
  }
  for (const rootId of roots) {
    place(rootId, 0)
    cursor += 0.5
  }
  for (const id of Object.keys(canvasLayout)) {
    if (nodes[id] && canvasLayout[id]) positions[id] = canvasLayout[id]
  }
  return positions
}

export function computeBlueprintSubtreeLayout(
  blueprint: Blueprint,
  nodeId: string,
  current: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  if (!blueprint.nodes[nodeId]) return current
  const subtreeIds = new Set<string>()
  const visit = (id: string) => {
    if (subtreeIds.has(id) || !blueprint.nodes[id]) return
    subtreeIds.add(id)
    for (const candidateId of blueprint.nodeIds) {
      if (blueprint.nodes[candidateId]?.parentId === id) visit(candidateId)
    }
  }
  visit(nodeId)

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

export function createDefaultLayoutRecovery(
  blueprint: Blueprint,
  current: Record<string, { x: number; y: number }>,
): {
  previous: Record<string, { x: number; y: number }>
  next: Record<string, { x: number; y: number }>
} {
  return {
    previous: { ...current },
    next: computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {}),
  }
}

export function deriveBlueprintFlow(
  blueprint: Blueprint,
  existing: Record<string, { x: number; y: number }>,
  workspaceNameById: Record<string, string>,
  focusedNodeIds: Set<string>,
  focusActive: boolean,
  collapsedNodeIds: Set<string> = new Set(),
): { nodes: Node<BlueprintNodeData, 'blueprint'>[]; edges: Edge[] } {
  const layout = computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, blueprint.canvasLayout ?? {})
  const hidden = new Set<string>()
  const hideDescendants = (id: string) => blueprint.nodeIds.forEach((childId) => {
    if (blueprint.nodes[childId]?.parentId === id && !hidden.has(childId)) { hidden.add(childId); hideDescendants(childId) }
  })
  collapsedNodeIds.forEach(hideDescendants)
  const nodes: Node<BlueprintNodeData, 'blueprint'>[] = blueprint.nodeIds
    .filter((id) => !hidden.has(id))
    .filter((id) => blueprint.nodes[id])
    .map((id) => {
      const node = blueprint.nodes[id]
      const focused = focusedNodeIds.has(id)
      return {
        id,
        type: 'blueprint',
        position: existing[id] ?? layout[id] ?? { x: 0, y: 0 },
        data: deriveBlueprintCardData(blueprint, node, workspaceNameById, focused, focusActive, collapsedNodeIds.has(id)),
      }
    })
  const edges: Edge[] = blueprint.nodeIds
    .filter((id) => !hidden.has(id))
    .filter((id) => {
      const node = blueprint.nodes[id]
      return node && node.parentId && blueprint.nodes[node.parentId]
    })
    .map((id) => ({
      id: `e-${blueprint.nodes[id].parentId}->${id}`,
      source: blueprint.nodes[id].parentId as string,
      target: id,
      type: 'blueprintAdaptive',
      style: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.5 },
    }))
  return { nodes, edges }
}
