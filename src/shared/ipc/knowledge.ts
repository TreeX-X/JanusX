import type {
  AuditAction,
  AuditEvent,
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  CaptureObservationInput,
  GraphEdge,
  KnowledgeConflict,
  KnowledgeContextRequest,
  KnowledgeContextResult,
  KnowledgeContractsSnapshot,
  KnowledgeFeedbackInput,
  KnowledgeFeedbackSummary,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeSource,
  KnowledgeTruthSnapshot,
  MemoryFact,
  Observation,
  ObservationPruneQuery,
  ObservationPruneResult,
  ObservationQuery,
  RetentionStats,
  WikiPage,
} from '../knowledge'
import type { KnowledgeSettings } from '../knowledge-settings'

export const KNOWLEDGE_CHANNELS = {
  contracts: 'knowledge:contracts:get',
  bootstrap: 'knowledge:bootstrap',
  observe: 'knowledge:observe',
  listObservations: 'knowledge:observations:list',
  pruneObservations: 'knowledge:observations:prune',
  resolveObservationContent: 'knowledge:observations:resolve-content',
  retentionStats: 'knowledge:retention:stats',
  listAudit: 'knowledge:audit:list',
  auditStats: 'knowledge:audit:stats',
  extract: 'knowledge:extract',
  listCandidates: 'knowledge:candidates:list',
  listGraphCandidates: 'knowledge:candidates:list-graph',
  listWikiPatchCandidates: 'knowledge:candidates:list-wiki-patches',
  rejectCandidate: 'knowledge:candidates:reject',
  applyCandidate: 'knowledge:candidates:apply',
  search: 'knowledge:search',
  listTruth: 'knowledge:truth:list',
  revokeTruth: 'knowledge:truth:revoke',
  listConflicts: 'knowledge:conflicts:list',
  recordFeedback: 'knowledge:feedback:record',
  feedbackSummary: 'knowledge:feedback:summary',
  context: 'knowledge:context',
  getSettings: 'settings:knowledge:get',
  updateSettings: 'settings:knowledge:update',
} as const

export interface KnowledgeBootstrapResult {
  workspacePath?: string
  knowledgeRoot: string
  createdDirectories: string[]
  createdFiles: string[]
  contracts: KnowledgeContractsSnapshot
}

export interface AuditQuery {
  action?: AuditAction
  targetType?: AuditEvent['targetType']
  targetId?: string
  limit?: number
}

export interface AuditStats {
  total: number
  byAction: Record<string, number>
}

export interface ExtractInput {
  observations?: Observation[]
  query?: ObservationQuery
  limit?: number
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
  source?: KnowledgeSource
  actor?: string
  correlationId?: string
}

export interface ExtractOutput {
  facts: CandidateFact[]
  wikiPatches: CandidateWikiPatch[]
  graphEdges: CandidateGraphEdge[]
  degraded?: { reason: string; detail?: string }
  auditEventId?: string
}

export type ReviewCandidateType = 'fact' | 'wiki-patch' | 'graph-edge'

export interface ReviewCandidateInput {
  type: ReviewCandidateType
  id: string
  reviewNotes?: string
}

export interface ReviewResult {
  candidate: CandidateFact | CandidateWikiPatch | CandidateGraphEdge
  auditEvents: AuditEvent[]
  applied?: {
    fact?: MemoryFact
    edge?: GraphEdge
    page?: WikiPage
  }
}

export type TruthKind = 'fact' | 'graph' | 'wiki'

export interface RevokeTruthInput {
  kind: TruthKind
  id: string
  workspaceId: string
}

export interface KnowledgeAPI {
  contracts: () => Promise<KnowledgeContractsSnapshot>
  bootstrap: (workspacePath?: string) => Promise<KnowledgeBootstrapResult>
  observe: (input: CaptureObservationInput) => Promise<Observation>
  listObservations: (query: ObservationQuery) => Promise<Observation[]>
  pruneObservations: (query: ObservationPruneQuery) => Promise<ObservationPruneResult>
  resolveObservationContent: (observation: Observation) => Promise<string>
  retentionStats: () => Promise<RetentionStats>
  listAudit: (query?: AuditQuery) => Promise<AuditEvent[]>
  auditStats: () => Promise<AuditStats>
  extract: (input?: ExtractInput) => Promise<ExtractOutput>
  listCandidates: () => Promise<CandidateFact[]>
  listGraphCandidates: () => Promise<CandidateGraphEdge[]>
  listWikiPatchCandidates: () => Promise<CandidateWikiPatch[]>
  rejectCandidate: (input: ReviewCandidateInput) => Promise<ReviewResult>
  applyCandidate: (input: ReviewCandidateInput) => Promise<ReviewResult>
  search: (query: KnowledgeSearchQuery) => Promise<KnowledgeSearchResult>
  listTruth: () => Promise<KnowledgeTruthSnapshot>
  revokeTruth: (input: RevokeTruthInput) => Promise<void>
  listConflicts: (workspaceId: string) => Promise<KnowledgeConflict[]>
  recordFeedback: (input: KnowledgeFeedbackInput) => Promise<void>
  feedbackSummary: (workspaceId?: string) => Promise<KnowledgeFeedbackSummary>
  context: (request: KnowledgeContextRequest) => Promise<KnowledgeContextResult>
  getSettings: () => Promise<KnowledgeSettings>
  updateSettings: (settings: Partial<KnowledgeSettings>) => Promise<KnowledgeSettings>
}
