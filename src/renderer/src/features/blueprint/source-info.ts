import type { Blueprint } from '@/services/blueprint'
import type { ArchitectureProjection } from './architecture-view'

// Note: diagnostics stay reachable without occupying the canvas — see .agents/notes/blueprint/navigation/requirements/module-browsing.md
export function blueprintSourceInfo(source: Blueprint, projection: ArchitectureProjection) {
  const snapshots = [...new Map([source.noteSnapshot, ...(source.composition?.checkouts.map(row => row.snapshot) ?? [])]
    .filter(snapshot => !!snapshot).map(snapshot => [snapshot.repoId + ':' + snapshot.coverage.checkoutRoot, snapshot])).values()]
  const issues: { category: 'document' | 'scan' | 'module'; message: string; path?: string; code?: string; nodeId?: string }[] = []
  for (const note of source.invalidNotes ?? []) {
    issues.push({ category: 'document', path: note.relPath, message: note.diagnostics.map(item => item.message).join('; ') })
  }
  for (const snapshot of snapshots) {
    for (const item of [...snapshot.diagnostics, ...snapshot.coverage.diagnostics]) {
      issues.push({ category: 'document', code: item.code, message: item.message, path: item.path ?? snapshot.coverage.checkoutRoot })
    }
    if (snapshot.coverage.status !== 'complete') issues.push({ category: 'scan', path: snapshot.coverage.checkoutRoot, message: '' })
  }
  for (const item of [...(source.composition?.diagnostics ?? []), ...projection.diagnostics]) {
    issues.push({ category: 'module', code: item.code, message: item.message, path: item.sourceUri, nodeId: item.nodeId })
  }
  const uniqueIssues = [...new Map(issues.map(item => [JSON.stringify([item.code, item.path, item.nodeId, item.message]), item])).values()]
  const graph = projection.graph.nodeIds.length ? projection.graph : source
  const hasAttention = uniqueIssues.length > 0
    || !!source.composition?.checkouts.some(row => row.status !== 'bound' || row.diagnostic)
    || !!graph.composition?.interfaces.some(port => ['dangling', 'unbound', 'stale'].includes(port.status))
  return { snapshots, issues: uniqueIssues, graph, hasAttention }
}
