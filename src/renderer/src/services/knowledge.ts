import type {
  AuditEvent,
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  Derivation,
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
import type { KnowledgeProcessingMode } from '../../../shared/knowledge-settings'
import type {
  KnowledgeProcessNowInput,
  KnowledgeProcessNowResult,
  KnowledgeProcessingStats,
  ExternalMcpClientId,
  ExternalMcpRegisterResult,
  ExternalMcpStatus,
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
  /** §5 llm-preferred: Inbox ordering mode; absent means 'auto' (append order). */
  mode?: KnowledgeProcessingMode
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
    settings,
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
    invokeOrEmpty(() => window.electron.knowledge.getSettings(), null),
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
    mode: settings?.mode ?? 'auto',
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

export type InboxCandidate = CandidateFact | CandidateWikiPatch | CandidateGraphEdge

/** §5 llm-preferred: Inbox-only ranking — merged first, then llm, then deterministic. */
const INBOX_DERIVATION_RANK: Record<Derivation, number> = { merged: 0, llm: 1, deterministic: 2 }

function inboxCandidateConfidence(candidate: InboxCandidate): number {
  if (candidate.type === 'fact') return candidate.fact.confidence
  if (candidate.type === 'wiki-patch') return candidate.confidence
  return candidate.edge.confidence
}

/**
 * §5 Inbox ordering. Non-llm-preferred modes keep append order (no copy);
 * llm-preferred stably ranks by derivation, breaking ties by confidence.
 * Records missing derivation sort last (schema violations are audited at read).
 */
export function sortInboxCandidates<T extends InboxCandidate>(
  candidates: T[],
  mode?: KnowledgeProcessingMode,
): T[] {
  if (mode !== 'llm-preferred') return candidates
  return [...candidates].sort((a, b) => {
    const rankA = INBOX_DERIVATION_RANK[a.derivation] ?? 3
    const rankB = INBOX_DERIVATION_RANK[b.derivation] ?? 3
    if (rankA !== rankB) return rankA - rankB
    return inboxCandidateConfidence(b) - inboxCandidateConfidence(a)
  })
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

/** External MCP registration: status is null when the bridge is unavailable. */
export async function getExternalMcpStatus(): Promise<ExternalMcpStatus | null> {
  try {
    return await window.electron.knowledge.externalMcpStatus()
  } catch {
    return null
  }
}

/** External MCP registration: writes the janusx-knowledge entry into a client config. */
export async function registerExternalMcp(client: ExternalMcpClientId): Promise<ExternalMcpRegisterResult> {
  return window.electron.knowledge.registerExternalMcp(client)
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
