import type { BlueprintNode } from '@/services/blueprint'

export function collectLocalHierarchyIds(nodes: Record<string, BlueprintNode>, nodeId: string, descendantDepth: number): Set<string> {
  const out = new Set<string>([nodeId])
  let current = nodes[nodeId]
  while (current?.parentId && nodes[current.parentId]) { out.add(current.parentId); current = nodes[current.parentId] }
  const visit = (id: string, depth: number) => {
    if (depth >= descendantDepth) return
    for (const childId of nodes[id]?.children ?? []) {
      if (nodes[childId]) { out.add(childId); visit(childId, depth + 1) }
    }
  }
  visit(nodeId, 0)
  return out
}

export function visibleNodeIds(nodes: Record<string, BlueprintNode>, nodeIds: string[], collapsedNodeIds: Set<string>): string[] {
  return nodeIds.filter((id) => {
    let parentId = nodes[id]?.parentId
    while (parentId) {
      if (collapsedNodeIds.has(parentId)) return false
      parentId = nodes[parentId]?.parentId ?? null
    }
    return true
  })
}

export function stepMatchIndex(current: number, step: number, count: number): number {
  return count ? (Math.min(current, count - 1) + step + count) % count : 0
}
