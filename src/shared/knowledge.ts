export type KnowledgeSource =
  | 'agent-stream'
  | 'checkpoint'
  | 'git-analyzer'
  | 'janus-chat'
  | 'manual'
  | 'tool'
  | 'system'

export type ObservationType =
  | 'conversation-turn'
  | 'tool-call'
  | 'tool-result'
  | 'checkpoint-event'
  | 'git-event'
  | 'analysis-result'
  | 'user-note'
  | 'system-event'

export type KnowledgeVisibility = 'workspace' | 'project' | 'global' | 'restricted'
export type ObservationQueryScope = 'global' | 'workspace'

export type CandidateStatus = 'proposed' | 'approved' | 'rejected' | 'applied'

/** Phase 1: how a candidate was derived (deterministic rule, LLM, or merged). */
export type Derivation = 'deterministic' | 'llm' | 'merged'

/** Phase 1: what a fact states. Stored on MemoryFact, no new entity types. */
export type FactKind = 'fact' | 'preference' | 'decision' | 'procedure'

/** Phase 1: evidence chain every derived candidate must carry. */
export interface CandidateEvidence {
  observationIds: string[]
  snippets?: string[]
}

export type RetentionClass = 'noise' | 'operational' | 'evidence' | 'derived'

export type WikiPageStatus = 'draft' | 'review' | 'published' | 'archived'

export type GraphRelationType =
  | 'mentions'
  | 'derived_from'
  | 'supersedes'
  | 'depends_on'
  | 'conflicts_with'
  | 'implemented_in'
  | 'owned_by'
  | 'used_by_agent'

/**
 * Phase 5 lifecycle status of an observation's content body.
 * Missing values default to 'active' for backward compatibility.
 */
export type CompactionStatus = 'active' | 'compacted' | 'summarized'

export type StructuredCloneValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StructuredCloneValue[]
  | { [key: string]: StructuredCloneValue }

export type AuditAction =
  | 'capture'
  | 'extract'
  | 'candidate_proposed'
  | 'candidate_approved'
  | 'candidate_rejected'
  | 'candidate_applied'
  | 'wiki_updated'
  | 'fact_superseded'
  | 'truth_revoked'
  | 'knowledge_conflict'
  | 'knowledge_feedback'
  | 'reindex'
  // Phase 1: processing queue run failures.
  | 'processing_failed'
  // Phase 1 convergence: persisted records that fail strict schema validation.
  | 'schema_violation'
  // Phase 5: lifecycle audit actions for observations.
  | 'observation_pruned'
  | 'observation_auto_pruned'
  | 'observation_archived'
  | 'observation_compacted'

export interface KnowledgeProvenance {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  source: KnowledgeSource
  sourceObservationIds: string[]
  fileRefs: string[]
  actor: string
  createdAt: string
  promptHash?: string
  model?: string
}

export interface Observation {
  id: string
  workspaceId: string
  workspaceName: string
  workspacePath: string
  source: KnowledgeSource
  type: ObservationType
  content: string
  summary?: string
  fileRefs: string[]
  tags: string[]
  visibility: KnowledgeVisibility
  actor: string
  createdAt: string
  correlationId?: string
  /** Phase 1 convergence: owning conversation/session (agent turn, chat conversation). Empty when sourceless. */
  sessionId?: string
  /** Phase 1 convergence: producing agent identity (engine name, analyzer id). Empty when unknown. */
  agentId?: string
  metadata?: Record<string, StructuredCloneValue>
  // Phase 1 convergence: always written by capture; missing on read is a schema violation.
  retentionClass: RetentionClass
  retentionReason?: string
  // Phase 4: content addressing + blob compression.
  contentHash: string
  // Phase 1 convergence: exact-dedupe key sha256(workspaceId + type + contentHash), always written by capture.
  dedupeKey: string
  contentLength: number
  contentPreview?: string
  blobRef?: string
  originalLength?: number
  truncated?: boolean
  // Phase 5: archive / compact / audit lifecycle.
  // Phase 1 convergence: capture writes 'active'; missing on read is a schema violation.
  compactionStatus: CompactionStatus
  compactedAt?: string
}

export interface CaptureObservationInput {
  workspaceId?: string
  workspaceName?: string
  workspacePath: string
  source: KnowledgeSource
  type: ObservationType
  content: string
  summary?: string
  fileRefs?: string[]
  tags?: string[]
  visibility?: KnowledgeVisibility
  actor?: string
  correlationId?: string
  sessionId?: string
  agentId?: string
  metadata?: Record<string, StructuredCloneValue>
}

export interface ObservationQuery {
  scope?: ObservationQueryScope
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
  limit?: number
  source?: KnowledgeSource
  type?: ObservationType
}

export interface ObservationPruneQuery extends ObservationQuery {
  olderThan?: string
  confirm?: boolean
  retentionClass?: RetentionClass
}

export interface ObservationPruneResult {
  dryRun: boolean
  matched: number
  removed: number
  kept: number
}

/** Phase 5: result of archiving aged monthly shards into gzipped archive files. */
export interface ObservationArchiveResult {
  archivedShards: Array<{ shard: string; recordCount: number; archivedTo: string }>
  totalRecords: number
}

/** Phase 5: result of compacting aged evidence observations (mark + summarize only in MVP). */
export interface ObservationCompactResult {
  compacted: number
  kept: number
  dryRun: boolean
}

export interface RetentionStats {
  noise: number
  operational: number
  evidence: number
  derived: number
  total: number
}

export interface MemoryFact {
  id: string
  content: string
  concepts: string[]
  files: string[]
  tags: string[]
  confidence: number
  version: number
  supersedes?: string
  status: CandidateStatus | 'active' | 'archived'
  provenance: KnowledgeProvenance
  /** Phase 1: deterministic/LLM classification of what the fact states. */
  kind: FactKind
}

export interface WikiPage {
  slug: string
  title: string
  markdown: string
  tags: string[]
  status: WikiPageStatus
  sourceFactIds: string[]
  updatedAt: string
  version: number
  workspaceId: string
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  type: GraphRelationType
  confidence: number
  sourceFactIds: string[]
  workspaceId: string
  createdAt: string
  status?: 'active' | 'archived'
}

export type KnowledgeFeedbackAction = 'open' | 'copy' | 'apply' | 'reject' | 'dismiss'
export type KnowledgeFeedbackOutcome = 'success' | 'empty' | 'error'
export interface KnowledgeFeedbackInput {
  action: KnowledgeFeedbackAction
  resultKind: KnowledgeContextKind | 'none'
  workspaceId: string
  outcome: KnowledgeFeedbackOutcome
}
export interface KnowledgeFeedbackSummary {
  total: number
  byAction: Record<KnowledgeFeedbackAction, number>
  byOutcome: Record<KnowledgeFeedbackOutcome, number>
  byKind: Record<KnowledgeContextKind | 'none', number>
}

export interface KnowledgeConflict {
  id: string
  workspaceId: string
  kind: KnowledgeContextKind
  targetId: string
  candidateId: string
  reason: 'duplicate-id' | 'content-mismatch'
  provenance: KnowledgeProvenance
}

export interface KnowledgeTruthSnapshot {
  facts: MemoryFact[]
  wikiPages: WikiPage[]
  graphEdges: GraphEdge[]
}

export type KnowledgeContextKind = 'fact' | 'wiki' | 'graph'

export interface KnowledgeContextRequest {
  query: string
  workspaceId?: string
  workspacePath?: string
  /** Explicitly allow recall across every workspace. */
  allowGlobal?: boolean
  maxItems?: number
  maxChars?: number
  /** Phase 3: filter evidence by producing agent (observations only; truth is shared). */
  agentId?: string
  /** Phase 3: filter evidence by owning session (observations only; truth is shared). */
  sessionId?: string
  /** Phase 3: only records with createdAt >= since (ISO string). */
  since?: string
  /** Phase 3: only records with createdAt <= until (ISO string). */
  until?: string
}

export interface KnowledgeContextSourceRefs {
  observationIds: string[]
  factIds: string[]
  fileRefs: string[]
}

export interface KnowledgeContextProvenance extends KnowledgeContextSourceRefs {
  source?: KnowledgeSource
  actor?: string
  createdAt: string
}

export interface KnowledgeContextItem {
  id: string
  kind: KnowledgeContextKind
  title: string
  content: string
  score: number
  workspaceId: string
  workspacePath?: string
  provenance: KnowledgeContextProvenance
}

export interface KnowledgeContextResult {
  items: KnowledgeContextItem[]
  compactContext: string
  truncated: boolean
  eligibleCount: number
  maxItems: number
  maxChars: number
  degraded?: { reason: 'empty-query' | 'missing-workspace' }
}

export type KnowledgeRecallTraceStatus = 'recalled' | 'empty' | 'degraded' | 'error'

export interface KnowledgeRecallTraceTopHit {
  id: string
  kind: KnowledgeContextKind
  title: string
  score: number
  provenance: KnowledgeContextSourceRefs
}

export interface KnowledgeRecallTrace {
  requestId: string
  status: KnowledgeRecallTraceStatus
  query: string
  recalledCount: number
  eligibleCount: number
  truncated: boolean
  maxItems: number
  maxChars: number
  topHit?: KnowledgeRecallTraceTopHit
  reason?: string
}

export interface AuditEvent {
  id: string
  action: AuditAction
  targetType: 'observation' | 'fact' | 'wiki' | 'graph' | 'index'
  targetId: string
  before?: Record<string, StructuredCloneValue> | null
  after?: Record<string, StructuredCloneValue> | null
  provenance: KnowledgeProvenance
}

export interface CandidateFact {
  id: string
  type: 'fact'
  status: CandidateStatus
  fact: MemoryFact
  reviewNotes?: string
  /** Phase 1: required derivation + evidence chain (no default-when-missing reads). */
  derivation: Derivation
  evidence: CandidateEvidence
  /** Phase 1: conflicting truth/candidate ids (candidate-stage conflict check). */
  conflicts?: string[]
  /** Phase 2: source candidate ids when derivation === 'merged'. */
  mergedFrom?: string[]
}

export interface CandidateWikiPatch {
  id: string
  type: 'wiki-patch'
  status: CandidateStatus
  pageSlug: string
  title: string
  patchMarkdown: string
  rationale: string
  confidence: number
  provenance: KnowledgeProvenance
  reviewNotes?: string
  /** Phase 1: required derivation + evidence chain (no default-when-missing reads). */
  derivation: Derivation
  evidence: CandidateEvidence
  /** Settled truth fact ids this patch summarizes; validated against known truth at extract. */
  sourceFactIds: string[]
  /** Phase 1: conflicting truth/candidate ids (candidate-stage conflict check). */
  conflicts?: string[]
  /** Phase 2: source candidate ids when derivation === 'merged'. */
  mergedFrom?: string[]
}

export interface CandidateGraphEdge {
  id: string
  type: 'graph-edge'
  status: CandidateStatus
  edge: GraphEdge
  reviewNotes?: string
  /** Phase 1: required derivation + evidence chain (no default-when-missing reads). */
  derivation: Derivation
  evidence: CandidateEvidence
  /** Phase 1: conflicting truth/candidate ids (candidate-stage conflict check). */
  conflicts?: string[]
  /** Phase 2: source candidate ids when derivation === 'merged'. */
  mergedFrom?: string[]
}

export interface KnowledgeStorageLayout {
  version: 1
  rootDirName: 'global'
  directories: Array<{
    key: string
    relativePath: string
    purpose: string
  }>
  files: Array<{
    key: string
    relativePath: string
    format: 'json' | 'jsonl' | 'markdown'
    purpose: string
  }>
}

export interface KnowledgeWritePolicy {
  version: 1
  principles: string[]
  directWriteCollections: string[]
  candidateOnlyCollections: string[]
  auditRequiredActions: AuditAction[]
  requiredProvenanceFields: Array<keyof KnowledgeProvenance>
}

export interface KnowledgeSchemaContract {
  version: 1
  status: 'implemented'
  entities: {
    observation: Array<keyof Observation>
    memoryFact: Array<keyof MemoryFact>
    wikiPage: Array<keyof WikiPage>
    graphEdge: Array<keyof GraphEdge>
    auditEvent: Array<keyof AuditEvent>
    candidateWikiPatch: Array<keyof CandidateWikiPatch>
  }
  rules: string[]
}

export interface KnowledgeContractsSnapshot {
  schema: KnowledgeSchemaContract
  storage: KnowledgeStorageLayout
  writePolicy: KnowledgeWritePolicy
}

export type KnowledgeSearchDocumentType =
  | 'observation'
  | 'fact-candidate'
  | 'wiki-patch'
  | 'graph-candidate'
  | 'memory-fact'
  | 'wiki-page'
  | 'graph-edge'

export interface KnowledgeSearchQuery {
  query: string
  limit?: number
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
  tags?: string[]
  files?: string[]
  source?: KnowledgeSource
  types?: KnowledgeSearchDocumentType[]
  /** Phase 3: filter evidence by producing agent (observations only; truth is shared). */
  agentId?: string
  /** Phase 3: filter evidence by owning session (observations only; truth is shared). */
  sessionId?: string
  /** Phase 3: only records with createdAt >= since (ISO string). */
  since?: string
  /** Phase 3: only records with createdAt <= until (ISO string). */
  until?: string
}

/** BM25 score parts (§8 stage one): why a document matched, in rank order. */
export interface KnowledgeScoreExplanation {
  bm25: number
  exactTitle: number
  titlePhrase: number
  titleTerm: number
  slugMatch: number
  bodyPhrase: number
  confidenceBoost: number
  freshnessBoost: number
}

export interface KnowledgeSearchHit {
  id: string
  type: KnowledgeSearchDocumentType
  title: string
  content: string
  score: number
  bm25Score: number
  scoreExplanation?: KnowledgeScoreExplanation
  workspaceId: string
  workspaceName: string
  workspacePath: string
  source: KnowledgeSource
  tags: string[]
  fileRefs: string[]
  sourceObservationIds: string[]
  createdAt: string
  confidence?: number
  status?: CandidateStatus | 'active' | 'archived'
  derivation?: Derivation
  agentId?: string
  sessionId?: string
}

export interface KnowledgeSearchIndexStats {
  documentCount: number
  termCount: number
  averageDocumentLength: number
}

export interface KnowledgeSearchResult {
  query: KnowledgeSearchQuery
  hits: KnowledgeSearchHit[]
  compactContext: string
  indexStats: KnowledgeSearchIndexStats
  degraded?: { reason: string; detail?: string }
}

/** Unified card view-model for Island / side panel / MCP consumers. */
export type KnowledgeCardKind = 'fact' | 'wiki' | 'observation' | 'graph'

export interface KnowledgeCardSourceRefs {
  observationIds: string[]
  fileRefs: string[]
}

export interface KnowledgeCard {
  id: string
  kind: KnowledgeCardKind
  title: string
  summary: string
  score: number
  tags: string[]
  workspaceId?: string
  workspacePath?: string
  sourceRefs: KnowledgeCardSourceRefs
  createdAt?: string
  status?: CandidateStatus | 'active' | 'archived'
  /** Original search document type before kind mapping. */
  rawType?: KnowledgeSearchDocumentType
  /** Why the document matched (search-result cards only). */
  scoreExplanation?: KnowledgeScoreExplanation
}
