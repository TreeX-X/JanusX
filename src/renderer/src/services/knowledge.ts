import type {
  AuditEvent,
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  KnowledgeCard,
  KnowledgeContextRequest,
  KnowledgeContextResult,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeTruthSnapshot,
  KnowledgeConflict,
  KnowledgeFeedbackInput,
  KnowledgeFeedbackSummary,
  Observation,
  RetentionStats,
} from '../../../shared/knowledge'
import {
  sortKnowledgeCards,
  toKnowledgeCards,
  truthSnapshotToKnowledgeCards,
} from '../../../shared/knowledge-card'

export interface KnowledgeWorkbenchSnapshot {
  observations: Observation[]
  factCandidates: CandidateFact[]
  wikiPatches: CandidateWikiPatch[]
  graphCandidates: CandidateGraphEdge[]
  auditEvents: AuditEvent[]
  retentionStats: RetentionStats | null
  libraryCards: KnowledgeCard[]
  conflicts: KnowledgeConflict[]
  loadedAt: string
  usingDemoData: boolean
  errors: string[]
}

async function invokeOrEmpty<T>(channel: string, fallback: T, ...args: unknown[]): Promise<T> {
  try {
    return (await window.electron.invoke(channel, ...args)) as T
  } catch {
    return fallback
  }
}

export async function loadKnowledgeWorkbenchSnapshot(): Promise<KnowledgeWorkbenchSnapshot> {
  const errors: string[] = []
  const [
    observations,
    factCandidates,
    wikiPatches,
    graphCandidates,
    auditEvents,
    retentionStats,
    truth,
  ] = await Promise.all([
    invokeOrEmpty<Observation[]>('knowledge:observations:list', [], { scope: 'global', limit: 40 }),
    invokeOrEmpty<CandidateFact[]>('knowledge:candidates:list', []),
    invokeOrEmpty<CandidateWikiPatch[]>('knowledge:candidates:list-wiki-patches', []),
    invokeOrEmpty<CandidateGraphEdge[]>('knowledge:candidates:list-graph', []),
    invokeOrEmpty<AuditEvent[]>('knowledge:audit:list', [], { limit: 30 }),
    invokeOrEmpty<RetentionStats | null>('knowledge:retention:stats', null),
    invokeOrEmpty<KnowledgeTruthSnapshot>('knowledge:truth:list', {
      facts: [],
      wikiPages: [],
      graphEdges: [],
    }),
  ])

  const libraryCards = truthSnapshotToKnowledgeCards(truth)
  const workspaceIds = [...new Set([
    ...factCandidates.map((item) => item.fact.provenance.workspaceId),
    ...wikiPatches.map((item) => item.provenance.workspaceId),
    ...graphCandidates.map((item) => item.edge.workspaceId),
  ].filter(Boolean))]
  const conflicts = (await Promise.all(
    workspaceIds.map((workspaceId) => invokeOrEmpty<KnowledgeConflict[]>('knowledge:conflicts:list', [], workspaceId)),
  )).flat()

  if (!retentionStats) {
    errors.push('retention stats unavailable')
  }

  return {
    observations,
    factCandidates,
    wikiPatches,
    graphCandidates,
    auditEvents,
    retentionStats,
    libraryCards,
    conflicts,
    loadedAt: new Date().toISOString(),
    usingDemoData: false,
    errors,
  }
}

export async function searchKnowledge(
  query: KnowledgeSearchQuery,
): Promise<KnowledgeSearchResult> {
  return window.electron.invoke('knowledge:search', query) as Promise<KnowledgeSearchResult>
}

/** Search then map hits to unified KnowledgeCards (does not change KnowledgeSearchResult). */
export async function searchKnowledgeCards(
  query: KnowledgeSearchQuery,
): Promise<KnowledgeCard[]> {
  const result = await searchKnowledge(query)
  return sortKnowledgeCards(toKnowledgeCards(result.hits))
}

export async function getKnowledgeContext(
  request: KnowledgeContextRequest,
): Promise<KnowledgeContextResult> {
  return window.electron.invoke('knowledge:context', request) as Promise<KnowledgeContextResult>
}

export type KnowledgeReviewCandidateType = 'fact' | 'wiki-patch' | 'graph-edge'

export interface KnowledgeReviewCandidateInput {
  type: KnowledgeReviewCandidateType
  id: string
  reviewNotes?: string
}

export async function rejectKnowledgeCandidate(
  input: KnowledgeReviewCandidateInput,
): Promise<unknown> {
  return window.electron.invoke('knowledge:candidates:reject', input)
}

export async function applyKnowledgeCandidate(
  input: KnowledgeReviewCandidateInput,
): Promise<unknown> {
  return window.electron.invoke('knowledge:candidates:apply', input)
}

export async function revokeKnowledgeTruth(input: {
  kind: 'fact' | 'graph' | 'wiki'
  id: string
  workspaceId: string
}): Promise<void> {
  await window.electron.invoke('knowledge:truth:revoke', input)
}

export async function listKnowledgeConflicts(workspaceId: string): Promise<KnowledgeConflict[]> {
  return window.electron.invoke('knowledge:conflicts:list', workspaceId) as Promise<KnowledgeConflict[]>
}

export async function recordKnowledgeFeedback(input: KnowledgeFeedbackInput): Promise<void> {
  await window.electron.invoke('knowledge:feedback:record', input)
}

export async function getKnowledgeFeedbackSummary(
  workspaceId?: string,
): Promise<KnowledgeFeedbackSummary> {
  return window.electron.invoke('knowledge:feedback:summary', workspaceId) as Promise<KnowledgeFeedbackSummary>
}
