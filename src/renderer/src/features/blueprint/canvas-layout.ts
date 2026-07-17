import type { Edge, Node } from '@xyflow/react'
import type { Blueprint, BlueprintNode } from '@/services/blueprint'
import type { BlueprintNodeData } from '@/components/blueprint/BlueprintNodeCard'

const NODE_W = 240
const NODE_H = 110
const X_GAP = 32
const Y_GAP = 64

function computeLayout(
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

export function deriveBlueprintFlow(
  blueprint: Blueprint,
  existing: Record<string, { x: number; y: number }>,
  workspaceNameById: Record<string, string>,
  focusedNodeIds: Set<string>,
  focusActive: boolean,
): { nodes: Node<BlueprintNodeData, 'blueprint'>[]; edges: Edge[] } {
  const layout = computeLayout(blueprint.nodes, blueprint.rootNodeId, blueprint.canvasLayout ?? {})
  const nodes: Node<BlueprintNodeData, 'blueprint'>[] = blueprint.nodeIds
    .filter((id) => blueprint.nodes[id])
    .map((id) => {
      const node = blueprint.nodes[id]
      const focused = focusedNodeIds.has(id)
      return {
        id,
        type: 'blueprint',
        position: existing[id] ?? layout[id] ?? { x: 0, y: 0 },
        data: {
          title: node.title,
          status: node.status,
          nodeType: node.type,
          progress: node.progress,
          workspaceName: node.workspaceId ? workspaceNameById[node.workspaceId] ?? node.workspaceSnapshot?.name ?? null : null,
          boundTerminalId: node.boundTerminalId,
          searchMatched: focusActive && focused,
          searchDimmed: focusActive && !focused,
        },
      }
    })
  const edges: Edge[] = blueprint.nodeIds
    .filter((id) => {
      const node = blueprint.nodes[id]
      return node && node.parentId && blueprint.nodes[node.parentId]
    })
    .map((id) => ({
      id: `e-${blueprint.nodes[id].parentId}->${id}`,
      source: blueprint.nodes[id].parentId as string,
      target: id,
      type: 'smoothstep',
      style: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.5 },
    }))
  return { nodes, edges }
}
