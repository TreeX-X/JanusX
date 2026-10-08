// Note: module navigation and document groups — see .agents/notes/blueprint/workflowx-v2-adoption.md
import type { Blueprint } from '@/services/blueprint'
import { resolveArchitectureNote, type ArchitectureProjection } from './architecture-view'

export const DOCUMENT_KINDS = ['note', 'idea', 'requirement', 'decision', 'task'] as const
export interface ModuleDocumentGroup {
  id: string; moduleId: string; kind: string; nodeIds: string[]
  x: number; y: number; width: number; height: number
}

/** Ownership is explicit and checkout scoped. Associations never move a document into another module. */
export function moduleDocuments(source: Blueprint, projection: ArchitectureProjection): Record<string, string[]> {
  const result: Record<string, string[]> = Object.fromEntries(projection.graph.nodeIds.map(id => [id, []]))
  for (const id of source.nodeIds) {
    const node = source.nodes[id]
    if (!node || projection.roles[id] || !DOCUMENT_KINDS.includes((node.note?.kind ?? node.kind) as typeof DOCUMENT_KINDS[number])) continue
    const uri = node.note?.module ?? node.note?.metadata?.module
    const owner = uri ? resolveArchitectureNote(source, id, uri) : undefined
    if (owner && result[owner]) result[owner].push(id)
  }
  return result
}

/** Disposable layout: module trees reserve space for their own document groups before child modules. */
export function expandModules(source: Blueprint, projection: ArchitectureProjection, expanded: ReadonlySet<string>) {
  const owned = moduleDocuments(source, projection)
  const graph: Blueprint = { ...projection.graph, nodes: { ...projection.graph.nodes }, nodeIds: [...projection.graph.nodeIds], canvasLayout: {} }
  const groups: ModuleDocumentGroup[] = []
  const widths = new Map<string, number>()
  const children = (id: string) => projection.graph.nodes[id].children
  const width = (id: string): number => {
    const cached = widths.get(id)
    if (cached !== undefined) return cached
    const own = expanded.has(id) && owned[id].length ? 568 : 240
    const nested = children(id)
    const value = Math.max(own, nested.reduce((sum, child) => sum + width(child), 0) + Math.max(0, nested.length - 1) * 64)
    widths.set(id, value)
    return value
  }
  const place = (id: string, left: number, top: number) => {
    const center = left + width(id) / 2
    graph.canvasLayout[id] = { x: center - 120, y: top }
    let y = top + 164
    if (expanded.has(id)) {
      for (const kind of DOCUMENT_KINDS) {
        const ids = owned[id].filter(child => (source.nodes[child].note?.kind ?? source.nodes[child].kind) === kind)
        if (!ids.length) continue
        const rows = Math.ceil(ids.length / 2), height = 48 + rows * 150
        const group = { id: `${id}:${kind}`, moduleId: id, kind, nodeIds: ids, x: center - 284, y, width: 568, height }
        groups.push(group)
        ids.forEach((child, index) => {
          graph.nodes[child] = { ...source.nodes[child], parentId: id, children: [] }
          graph.nodeIds.push(child)
          graph.canvasLayout[child] = { x: group.x + 24 + (index % 2) * 280, y: y + 40 + Math.floor(index / 2) * 150 }
        })
        y += height + 28
      }
    }
    const nested = children(id)
    const total = nested.reduce((sum, child) => sum + width(child), 0) + Math.max(0, nested.length - 1) * 64
    let x = center - total / 2
    for (const child of nested) { place(child, x, y + 32); x += width(child) + 64 }
  }
  let x = 0
  for (const id of graph.nodeIds.filter(id => !graph.nodes[id].parentId)) { place(id, x, 0); x += width(id) + 120 }
  return { graph, groups, owned }
}
