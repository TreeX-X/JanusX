import type {
  AuditEvent,
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  GraphEdge,
  KnowledgeCard,
  KnowledgeContextRequest,
  KnowledgeContextResult,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeConflict,
  KnowledgeFeedbackInput,
  KnowledgeFeedbackSummary,
  MemoryFact,
  Observation,
  RetentionStats,
} from '../../../shared/knowledge'
import type {
  KnowledgeProcessNowInput,
  KnowledgeProcessNowResult,
  KnowledgeProcessingStats,
  ReviewCandidateInput,
  ReviewCandidateType,
  RevokeTruthInput,
} from '../../../shared/ipc/knowledge'
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
  /** Phase 4 Graph (§10.1): active truth facts + stored edges for the canvas. */
  truthFacts?: MemoryFact[]
  truthEdges?: GraphEdge[]
  loadedAt: string
  usingDemoData: boolean
  errors: string[]
}

async function invokeOrEmpty<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation()
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
    invokeOrEmpty(() => window.electron.knowledge.listObservations({ scope: 'global', limit: 40 }), []),
    invokeOrEmpty(() => window.electron.knowledge.listCandidates(), []),
    invokeOrEmpty(() => window.electron.knowledge.listWikiPatchCandidates(), []),
    invokeOrEmpty(() => window.electron.knowledge.listGraphCandidates(), []),
    invokeOrEmpty(() => window.electron.knowledge.listAudit({ limit: 30 }), []),
    invokeOrEmpty<RetentionStats | null>(() => window.electron.knowledge.retentionStats(), null),
    invokeOrEmpty(() => window.electron.knowledge.listTruth(), {
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
    workspaceIds.map((workspaceId) =>
      invokeOrEmpty(() => window.electron.knowledge.listConflicts(workspaceId), []),
    ),
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
    truthFacts: truth.facts,
    truthEdges: truth.graphEdges,
    loadedAt: new Date().toISOString(),
    usingDemoData: false,
    errors,
  }
}

export async function searchKnowledge(
  query: KnowledgeSearchQuery,
): Promise<KnowledgeSearchResult> {
  return window.electron.knowledge.search(query)
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
  return window.electron.knowledge.context(request)
}

export type KnowledgeReviewCandidateType = ReviewCandidateType
export type KnowledgeReviewCandidateInput = ReviewCandidateInput

export async function rejectKnowledgeCandidate(
  input: KnowledgeReviewCandidateInput,
): Promise<unknown> {
  return window.electron.knowledge.rejectCandidate(input)
}

export async function applyKnowledgeCandidate(
  input: KnowledgeReviewCandidateInput,
): Promise<unknown> {
  return window.electron.knowledge.applyCandidate(input)
}

export async function revokeKnowledgeTruth(input: RevokeTruthInput): Promise<void> {
  await window.electron.knowledge.revokeTruth(input)
}

/** Phase 4 status bar (§6): queue metrics; null when the bridge is unavailable. */
export async function getKnowledgeProcessingStats(): Promise<KnowledgeProcessingStats | null> {
  try {
    return await window.electron.knowledge.processingStats()
  } catch {
    return null
  }
}

/** Phase 4 status bar (§6): manual `knowledge:processNow` trigger. */
export async function processKnowledgeNow(
  input?: KnowledgeProcessNowInput,
): Promise<KnowledgeProcessNowResult> {
  return window.electron.knowledge.processNow(input)
}

export async function listKnowledgeConflicts(workspaceId: string): Promise<KnowledgeConflict[]> {
  return window.electron.knowledge.listConflicts(workspaceId)
}

export async function recordKnowledgeFeedback(input: KnowledgeFeedbackInput): Promise<void> {
  await window.electron.knowledge.recordFeedback(input)
}

export async function getKnowledgeFeedbackSummary(
  workspaceId?: string,
): Promise<KnowledgeFeedbackSummary> {
  return window.electron.knowledge.feedbackSummary(workspaceId)
}
