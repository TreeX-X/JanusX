import type { Blueprint } from '@/services/blueprint'
import type { ArchitectureProjection } from './architecture-view'

// Note: current-workspace sources and diagnostics; see .agents/notes/blueprint/navigation/requirements/module-browsing.md
type SourceIssue = {
  category: 'document' | 'scan' | 'module'
  message: string
  path?: string
  code?: string
  nodeId?: string
  sourceTitle?: string
}

export function blueprintSourceInfo(source: Blueprint, projection: ArchitectureProjection) {
  const snapshot = source.noteSnapshot
  const snapshots = snapshot ? [snapshot] : []
  const repoId = snapshot?.repoId ?? source.nodes[source.rootNodeId]?.sourceUri?.split('/')[2]
  const externalUri = (uri?: string): boolean => !!repoId && !!uri?.startsWith('note://') && uri.split('/')[2] !== repoId
  const externalNode = (id?: string): boolean => !!id && (source.composition?.nodes[id]?.layer === 'evidence' || externalUri(source.nodes[id]?.sourceUri))
  const issues: SourceIssue[] = []
  const nodeByUri = new Map(source.nodeIds.filter(id => !externalNode(id)).flatMap(id => source.nodes[id]?.sourceUri ? [[source.nodes[id].sourceUri!, id] as const] : []))
  for (const note of source.invalidNotes ?? []) {
    if (source.composition?.checkouts.some(row => note.relPath.startsWith(row.checkoutId + ': '))) continue
    issues.push({ category: 'document', path: note.relPath, message: note.diagnostics.map(item => item.message).join('; ') })
  }
  if (snapshot) {
    const titles = new Map(snapshot.entries.flatMap(entry => entry.uri && entry.doc?.title ? [[entry.uri, entry.doc.title] as const] : []))
    const externalDiagnostics = new Set<string>()
    for (const edge of [...snapshot.relations, ...snapshot.mentions]) {
      if (!externalUri(edge.targetUri)) continue
      for (const diagnostic of edge.resolution.diagnostics) {
        externalDiagnostics.add(JSON.stringify([diagnostic.code, edge.sourceUri, diagnostic.message]))
      }
    }
    for (const item of [...snapshot.diagnostics, ...snapshot.coverage.diagnostics]) {
      if (externalUri(item.path) || externalDiagnostics.has(JSON.stringify([item.code, item.path, item.message]))) continue
      issues.push({ category: 'document', code: item.code, message: item.message, path: item.path ?? snapshot.coverage.checkoutRoot,
        nodeId: item.path ? nodeByUri.get(item.path) : undefined, sourceTitle: item.path ? titles.get(item.path) : undefined })
    }
    if (snapshot.coverage.status !== 'complete') issues.push({ category: 'scan', path: snapshot.coverage.checkoutRoot, message: '' })
  }
  for (const item of [...(source.composition?.diagnostics ?? []), ...projection.diagnostics]) {
    if (item.checkoutId || externalNode(item.nodeId) || externalUri(item.sourceUri)) continue
    if (item.code === 'UNBOUND_MODULE' && item.nodeId && source.nodes[item.nodeId]?.note?.metadata?.repositories?.primary !== repoId) continue
    if (['UNBOUND_CHECKOUT', 'DIRTY_CHECKOUT', 'STALE_EVIDENCE'].includes(item.code)) continue
    issues.push({ category: 'module', code: item.code, message: item.message, path: item.sourceUri, nodeId: item.nodeId })
  }
  const uniqueIssues = [...new Map(issues.map(item => [JSON.stringify([item.category, item.code, item.path, item.nodeId, item.message]), item])).values()]
  const projected = projection.graph.nodeIds.length ? projection.graph : source
  const interfaces = projected.composition?.interfaces.filter(port => !externalNode(port.nodeId) && !externalUri(port.provider)) ?? []
  const graph = projected.composition ? { ...projected, composition: { ...projected.composition, interfaces } } : projected
  const hasAttention = uniqueIssues.length > 0 || interfaces.some(port => ['dangling', 'stale', 'unbound'].includes(port.status))
  return { snapshots, issues: uniqueIssues, graph, hasAttention }
}
