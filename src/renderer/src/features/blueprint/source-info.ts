import type { Blueprint } from '@/services/blueprint'
import type { ArchitectureProjection } from './architecture-view'

// Note: diagnostics stay reachable without occupying the canvas — see .agents/notes/blueprint/navigation/requirements/module-browsing.md
type SourceIssue = {
  category: 'document' | 'scan' | 'module' | 'external'
  message: string
  path?: string
  code?: string
  nodeId?: string
  sourceTitle?: string
  targetRepo?: string
  targetRepoName?: string
  targets?: string[]
}

export function blueprintSourceInfo(source: Blueprint, projection: ArchitectureProjection) {
  const snapshots = [...new Map([source.noteSnapshot, ...(source.composition?.checkouts.map(row => row.snapshot) ?? [])]
    .filter(snapshot => !!snapshot).map(snapshot => [snapshot.repoId + ':' + snapshot.coverage.checkoutRoot, snapshot])).values()]
  const issues: SourceIssue[] = []
  const nodeByUri = new Map(source.nodeIds.flatMap(id => source.nodes[id]?.sourceUri ? [[source.nodes[id].sourceUri!, id] as const] : []))
  for (const note of source.invalidNotes ?? []) {
    issues.push({ category: 'document', path: note.relPath, message: note.diagnostics.map(item => item.message).join('; ') })
  }
  for (const snapshot of snapshots) {
    const titles = new Map(snapshot.entries.flatMap(entry => entry.uri && entry.doc?.title ? [[entry.uri, entry.doc.title] as const] : []))
    const external = new Map<string, SourceIssue>()
    const handled = new Set<string>()
    for (const edge of [...snapshot.relations, ...snapshot.mentions]) {
      if (edge.resolution.reason !== 'unbound-repository' || !edge.targetUri) continue
      const targetRepo = edge.targetUri.split('/')[2]
      const key = edge.sourceUri + '\0' + targetRepo
      for (const diagnostic of edge.resolution.diagnostics) handled.add(JSON.stringify([diagnostic.code, edge.sourceUri, diagnostic.message]))
      const matching = source.composition?.checkouts.filter(row => row.repoId === targetRepo) ?? []
      const selected = matching.filter(row => row.selected)
      const checkout = selected.length === 1 ? selected[0] : selected.length === 0 && matching.length === 1 ? matching[0] : undefined
      if (checkout?.status === 'bound' && checkout.nodeIds.some(id => source.nodes[id]?.sourceUri === edge.targetUri)) continue
      const issue = external.get(key) ?? {
        category: 'external' as const, path: edge.sourceUri, nodeId: nodeByUri.get(edge.sourceUri),
        sourceTitle: titles.get(edge.sourceUri), targetRepo, targetRepoName: checkout?.name,
        code: edge.resolution.diagnostics[0]?.code, message: edge.resolution.diagnostics[0]?.message ?? '', targets: [],
      }
      if (!issue.targets!.includes(edge.targetUri)) issue.targets!.push(edge.targetUri)
      external.set(key, issue)
    }
    issues.push(...external.values())
    for (const item of [...snapshot.diagnostics, ...snapshot.coverage.diagnostics]) {
      if (handled.has(JSON.stringify([item.code, item.path, item.message]))) continue
      issues.push({ category: 'document', code: item.code, message: item.message, path: item.path ?? snapshot.coverage.checkoutRoot,
        nodeId: item.path ? nodeByUri.get(item.path) : undefined, sourceTitle: item.path ? titles.get(item.path) : undefined })
    }
    if (snapshot.coverage.status !== 'complete') issues.push({ category: 'scan', path: snapshot.coverage.checkoutRoot, message: '' })
  }
  for (const item of [...(source.composition?.diagnostics ?? []), ...projection.diagnostics]) {
    issues.push({ category: 'module', code: item.code, message: item.message, path: item.sourceUri, nodeId: item.nodeId })
  }
  const uniqueIssues = [...new Map(issues.map(item => [JSON.stringify([item.category, item.code, item.path, item.nodeId, item.message, item.targetRepo]), item])).values()]
  const graph = projection.graph.nodeIds.length ? projection.graph : source
  const hasAttention = uniqueIssues.length > 0
    || !!source.composition?.checkouts.some(row => row.status !== 'bound' || row.diagnostic)
    || !!graph.composition?.interfaces.some(port => ['dangling', 'unbound', 'stale'].includes(port.status))
  return { snapshots, issues: uniqueIssues, graph, hasAttention }
}
