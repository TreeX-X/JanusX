import type { AuditRecord } from '../../../../shared/ipc/knowledge'

export const auditActions = ['capture', 'extract', 'candidate_proposed', 'candidate_approved', 'candidate_rejected', 'candidate_applied', 'wiki_updated', 'fact_superseded', 'truth_revoked', 'knowledge_conflict', 'knowledge_feedback', 'reindex', 'processing_failed', 'schema_violation', 'observation_pruned', 'observation_auto_pruned', 'observation_archived', 'observation_compacted', 'user_profile_updated', 'user_episode_captured', 'user_episode_harvested', 'habit_candidate_proposed'] as const
export const auditTypes = ['observation', 'fact', 'wiki', 'graph', 'index'] as const
export const auditFields = ['content', 'title', 'status', 'version', 'count', 'fact', 'markdown', 'reviewNotes', 'reason', 'candidateIds', 'sourceObservationIds', 'appliedId', 'replacementId', 'model', 'provider', 'taskId'] as const
export function snapshotCount(event: AuditRecord): number | undefined {
  return typeof event.after?.count === 'number' ? event.after.count : undefined
}
export function auditCanResolve(event: AuditRecord) {
  const workspace = event.provenance?.workspaceId
  if (!workspace || workspace === 'global' || event.targetId === workspace || snapshotCount(event) !== undefined || /^habits:/.test(event.targetId)) return false
  if (['candidate_approved', 'candidate_rejected', 'candidate_applied'].includes(event.action)) return ['fact', 'wiki', 'graph'].includes(event.targetType)
  return event.targetType === 'fact' && ['fact_superseded', 'truth_revoked'].includes(event.action)
    || event.targetType === 'wiki' && ['wiki_updated', 'truth_revoked'].includes(event.action)
    || event.targetType === 'graph' && event.action === 'truth_revoked'
    || event.targetType === 'observation' && ['capture', 'user_episode_captured'].includes(event.action)
}

/** Read the exact current object in the event workspace; historical values stay in the event. */
export async function resolveAuditObject(event: AuditRecord): Promise<unknown | null> {
  if (!auditCanResolve(event)) return null
  const api = window.electron.knowledge
  const workspaceId = event.provenance.workspaceId
  if (event.targetType === 'observation') {
    const source = await api.observationRevocationContext({ id: event.targetId, workspaceId })
    return source.revoked ? null : { content: source.content }
  }
  if (event.action.startsWith('candidate_')) {
    if (event.targetType === 'fact') {
      const candidate = (await api.listCandidates()).find(item => item.id === event.targetId && item.fact.provenance.workspaceId === workspaceId)
      if (candidate) return { status: candidate.status, content: candidate.fact.content }
    } else if (event.targetType === 'wiki') {
      const candidate = (await api.listWikiPatchCandidates()).find(item => item.id === event.targetId && item.provenance.workspaceId === workspaceId)
      if (candidate) return { status: candidate.status, title: candidate.title, markdown: candidate.patchMarkdown }
    } else {
      const candidate = (await api.listGraphCandidates()).find(item => item.id === event.targetId && item.edge.workspaceId === workspaceId)
      if (candidate) return candidate.edge
    }
    // Only an explicit applied identity may resolve a missing candidate to truth.
    if (typeof event.after?.appliedId !== 'string') return null
  }
  const id = event.action.startsWith('candidate_') ? event.after!.appliedId : event.targetId
  const truth = await api.listTruth()
  if (event.targetType === 'fact') return truth.facts.find(item => item.id === id && item.provenance.workspaceId === workspaceId && item.status === 'active') ?? null
  if (event.targetType === 'wiki') return truth.wikiPages.find(item => item.slug === id && item.workspaceId === workspaceId) ?? null
  return truth.graphEdges.find(item => item.id === id && item.workspaceId === workspaceId) ?? null
}

export function auditValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item, 2) ?? ''
}
