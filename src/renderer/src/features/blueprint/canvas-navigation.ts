import type { BlueprintNode } from '@/services/blueprint'

const idOrder = new Intl.Collator('en', { numeric: true })
const compareIds = (a: string, b: string): number => idOrder.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)

/** View-only forest: keep explicit parents, cut one stable edge per cycle. */
export function buildEffectiveHierarchy(nodes: Record<string, BlueprintNode>): {
  roots: string[]
  parentById: Map<string, string>
  childrenByParent: Map<string, string[]>
} {
  const ids = Object.keys(nodes).sort(compareIds)
  const parentById = new Map<string, string>()
  for (const id of ids) {
    const parentId = nodes[id].parentId
    if (parentId && nodes[parentId]) parentById.set(id, parentId)
  }
  const resolved = new Set<string>()
  for (const id of ids) {
    const path: string[] = []
    const pathIndex = new Map<string, number>()
    let current: string | undefined = id
    while (current !== undefined && !resolved.has(current)) {
      const cycleStart = pathIndex.get(current)
      if (cycleStart !== undefined) {
        const representative = path.slice(cycleStart).sort(compareIds)[0]
        parentById.delete(representative)
        break
      }
      pathIndex.set(current, path.length)
      path.push(current)
      current = parentById.get(current)
    }
    path.forEach((entry) => resolved.add(entry))
  }
  const roots: string[] = []
  const childrenByParent = new Map<string, string[]>()
  for (const id of ids) {
    const parentId = parentById.get(id)
    if (parentId === undefined) roots.push(id)
    else {
      const children = childrenByParent.get(parentId) ?? []
      children.push(id)
      childrenByParent.set(parentId, children)
    }
  }
  return { roots, parentById, childrenByParent }
}

export function collectLocalHierarchyIds(nodes: Record<string, BlueprintNode>, nodeId: string, descendantDepth: number): Set<string> {
  const { parentById, childrenByParent } = buildEffectiveHierarchy(nodes)
  const out = new Set<string>([nodeId])
  let parentId = parentById.get(nodeId)
  while (parentId !== undefined) { out.add(parentId); parentId = parentById.get(parentId) }
  const visit = (id: string, depth: number) => {
    if (depth >= descendantDepth) return
    for (const childId of childrenByParent.get(id) ?? []) {
      if (nodes[childId] && !out.has(childId)) { out.add(childId); visit(childId, depth + 1) }
    }
  }
  visit(nodeId, 0)
  return out
}

export function visibleNodeIds(nodes: Record<string, BlueprintNode>, nodeIds: string[], collapsedNodeIds: Set<string>): string[] {
  const { parentById } = buildEffectiveHierarchy(nodes)
  return nodeIds.filter((id) => {
    if (!nodes[id]) return false
    let parentId = parentById.get(id)
    while (parentId) {
      if (collapsedNodeIds.has(parentId)) return false
      parentId = parentById.get(parentId)
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

  const { parentById, childrenByParent } = buildEffectiveHierarchy(nodes)
  const depthOf = new Map<string, number>()
  const depth = (id: string): number => {
    const known = depthOf.get(id)
    if (known !== undefined) return known
    const parentId = parentById.get(id)
    const value = parentId ? depth(parentId) + 1 : 0
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
    depth(id) >= collapseDepth && (childrenByParent.get(id)?.length ?? 0) > 0
  ))
}
