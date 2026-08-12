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

/** 大蓝图初始可见节点上限（超出则按层级预折叠） */
export const DEFAULT_COLLAPSE_MAX_VISIBLE = 24

/**
 * 大蓝图初次加载的预折叠集合：
 * 取累计可见节点数不超过 maxVisible 的最深完整层 D（至少保留根+第一层），
 * 折叠深度 ≥ D 的所有含子节点的节点，之后逐层展开。
 * 节点总数不超过 maxVisible 时不折叠。
 */
export function computeInitialCollapsedIds(
  nodes: Record<string, BlueprintNode>,
  nodeIds: string[],
  maxVisible = DEFAULT_COLLAPSE_MAX_VISIBLE
): Set<string> {
  const validIds = nodeIds.filter((id) => nodes[id])
  if (validIds.length <= maxVisible) return new Set()

  const depthOf = new Map<string, number>()
  const depth = (id: string): number => {
    const known = depthOf.get(id)
    if (known !== undefined) return known
    const parentId = nodes[id]?.parentId
    const value = parentId && nodes[parentId] ? depth(parentId) + 1 : 0
    depthOf.set(id, value)
    return value
  }
  const countAtDepth: number[] = []
  for (const id of validIds) {
    const d = depth(id)
    countAtDepth[d] = (countAtDepth[d] ?? 0) + 1
  }

  let collapseDepth = 1
  let visible = (countAtDepth[0] ?? 0) + (countAtDepth[1] ?? 0)
  for (let d = 2; d < countAtDepth.length; d++) {
    if (visible + (countAtDepth[d] ?? 0) > maxVisible) break
    visible += countAtDepth[d] ?? 0
    collapseDepth = d
  }

  return new Set(validIds.filter((id) =>
    depth(id) >= collapseDepth && (nodes[id].children ?? []).some((childId) => nodes[childId])
  ))
}
