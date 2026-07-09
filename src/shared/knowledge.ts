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

export type AuditAction =
  | 'capture'
  | 'extract'
  | 'candidate_proposed'
  | 'candidate_approved'
  | 'candidate_rejected'
  | 'candidate_applied'
  | 'wiki_updated'
  | 'fact_superseded'
  | 'reindex'
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
  metadata?: Record<string, unknown>
  // Phase 3/4: retention classification (missing defaults to 'evidence').
  retentionClass?: RetentionClass
  retentionReason?: string
  // Phase 4: content addressing + blob compression.
  contentHash?: string
  contentLength?: number
  contentPreview?: string
  blobRef?: string
  originalLength?: number
  truncated?: boolean
  // Phase 5: archive / compact / audit lifecycle.
  // Missing compactionStatus reads as 'active' (backward compat).
  compactionStatus?: CompactionStatus
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
  metadata?: Record<string, unknown>
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
  status: CandidateStatus | 'active'
  provenance: KnowledgeProvenance
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
}

export interface AuditEvent {
  id: string
  action: AuditAction
  targetType: 'observation' | 'fact' | 'wiki' | 'graph' | 'index'
  targetId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  provenance: KnowledgeProvenance
}

export interface CandidateFact {
  id: string
  type: 'fact'
  status: CandidateStatus
  fact: MemoryFact
  reviewNotes?: string
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
}

export interface CandidateGraphEdge {
  id: string
  type: 'graph-edge'
  status: CandidateStatus
  edge: GraphEdge
  reviewNotes?: string
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
}

export interface KnowledgeSearchHit {
  id: string
  type: KnowledgeSearchDocumentType
  title: string
  content: string
  score: number
  bm25Score: number
  workspaceId: string
  workspaceName: string
  workspacePath: string
  source: KnowledgeSource
  tags: string[]
  fileRefs: string[]
  sourceObservationIds: string[]
  createdAt: string
  confidence?: number
  status?: CandidateStatus | 'active'
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
