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
  UserMemoryOverview,
  WikiPage,
  WikiNoteStatus,
} from '../knowledge'
import type { KnowledgeSettings } from '../knowledge-settings'

export interface PersonalProfileOverrides {
  identity?: string
  formatPrefs?: string[]
  toolPrefs?: string[]
}

export interface PersonalProfileEditContext {
  overrides: PersonalProfileOverrides
  hash: string
}

export interface ObservationRevocationsPage {
  total: number
  offset: number
  limit: number
  items: Array<{
    key: string
    revokedAt: string
    observationCount: number
    factCount: number
    sourceStatus: 'available' | 'changed' | 'missing' | 'ambiguous'
    source?: { id: string; workspaceId: string; content: string; truncated: boolean }
  }>
}

export const KNOWLEDGE_CHANNELS = {
  automationStatus: 'knowledge:automation:status',
  automationRun: 'knowledge:automation:run',
  automationRetry: 'knowledge:automation:retry',
  jevCredential: 'knowledge:jev:credential',
  jevCredentialStatus: 'knowledge:jev:credential-status',
  jevCredentialReveal: 'knowledge:jev:credential-reveal',
  localModelStop: 'knowledge:local-model:stop',
  localModelConfigure: 'knowledge:local-model:configure',
  localResourcesInstall: 'knowledge:local-model:install',
  localResourcesStatus: 'knowledge:local-model:resources-status',
  wikiHistory: 'knowledge:wiki:history',
  wikiRevision: 'knowledge:wiki:revision',
  pinWikiRevision: 'knowledge:wiki:pin-revision',
  layaControl: 'knowledge:laya:control',
  candidateAction: 'knowledge:candidate:action',
  noteWikiPages: 'knowledge:note-wiki:pages',
  prepareNoteWiki: 'knowledge:note-wiki:prepare',
  proposeNoteWiki: 'knowledge:note-wiki:propose',
  noteWikiStatuses: 'knowledge:note-wiki:statuses',
  contracts: 'knowledge:contracts:get',
  bootstrap: 'knowledge:bootstrap',
  observe: 'knowledge:observe',
  listObservations: 'knowledge:observations:list',
  pruneObservations: 'knowledge:observations:prune',
  observationRevocationContext: 'knowledge:observations:revocation-context',
  revokeObservation: 'knowledge:observations:revoke',
  observationRevocations: 'knowledge:observations:revocations',
  autoPruneObservations: 'knowledge:observations:auto-prune',
  resolveObservationContent: 'knowledge:observations:resolve-content',
  retentionStats: 'knowledge:retention:stats',
  listAudit: 'knowledge:audit:list',
  auditStats: 'knowledge:audit:stats',
  // Phase 5: `knowledge:extract` direct IPC removed — LLM enhancement runs only
  // via the processing queue (`runLlmStage` → `knowledgeExtractService.extract`).
  listCandidates: 'knowledge:candidates:list',
  listGraphCandidates: 'knowledge:candidates:list-graph',
  listWikiPatchCandidates: 'knowledge:candidates:list-wiki-patches',
  rejectCandidate: 'knowledge:candidates:reject',
  applyCandidate: 'knowledge:candidates:apply',
  factReviewContext: 'knowledge:candidates:fact-review-context',
  search: 'knowledge:search',
  listTruth: 'knowledge:truth:list',
  revokeTruth: 'knowledge:truth:revoke',
  listConflicts: 'knowledge:conflicts:list',
  recordFeedback: 'knowledge:feedback:record',
  feedbackSummary: 'knowledge:feedback:summary',
  context: 'knowledge:context',
  diagnostics: 'knowledge:diagnostics',
  processNow: 'knowledge:process-now',
  processingStats: 'knowledge:processing-stats',
  externalMcpStatus: 'knowledge:external-mcp:status',
  registerExternalMcp: 'knowledge:external-mcp:register',
  probeExternalMcp: 'knowledge:external-mcp:probe',
  userMemoryOverview: 'knowledge:user-memory:overview',
  personalProfileEditContext: 'knowledge:user-memory:profile-context',
  savePersonalProfile: 'knowledge:user-memory:profile-save',
  importLegacyPersonalMemory: 'knowledge:user-memory:import-legacy',
  migrateLegacyEpisodes: 'knowledge:user-memory:migrate-episodes',
  forgetPersonalMemory: 'knowledge:user-memory:forget',
  proposePersonalMemoryCorrection: 'knowledge:user-memory:correct',
  getPersonalSettings: 'settings:personal-memory:get',
  updatePersonalSettings: 'settings:personal-memory:update',
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

/**
 * Phase 5: service-level input for `knowledgeExtractService.extract`.
 * No longer an IPC payload — the queue-owned `runLlmStage` is the only caller.
 */
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
  /** Phase 2: deterministic candidates upgraded to derivation 'merged' in place (no separate append). */
  mergedFactCandidateIds?: string[]
  /** Phase 2: observation ids dropped by the per-batch character budget (oldest first). */
  droppedObservationIds?: string[]
}

export type ReviewCandidateType = 'fact' | 'wiki-patch' | 'graph-edge'

export interface ReviewCandidateInput {
  type: ReviewCandidateType
  id: string
  candidateHash: string
  replacement?: { id: string; hash: string }
  reviewNotes?: string
  /** Audit actor override for explicit review. Legacy auto-policy is rejected. Defaults to 'knowledge-review'. */
  actor?: string
}

export interface FactReviewContext {
  factKey?: string
  targets: Array<{ id: string; hash: string; content: string; version: number }>
  competing: Array<{ id: string; content: string }>
  blocked?: 'id-collision' | 'invalid-target' | 'multiple-targets'
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

/** Phase 0 diagnostics: pipeline health snapshot for the Workbench status bar. */
export interface KnowledgeDiagnosticsQuery {
  workspaceId?: string
  recentLimit?: number
}

export interface KnowledgeWorkspaceDiagnostics {
  workspaceId: string
  workspaceName: string
  observations: number
  evidence: number
  /** Observations whose workspaceId had to be guessed from the directory basename. */
  fallbackWorkspaceIds: number
  /** Evidence observations after the processing cursor (falls back to all evidence when the cursor is unknown). */
  unprocessedEstimate: number
  lastObservationAt?: string
}

/** Phase 5 (§6): proposed 候选按 derivation 计数（与 ProcessingStats 同口径）。 */
export interface KnowledgeProposalsByDerivation {
  deterministic: number
  llm: number
  merged: number
}

export interface KnowledgeDiagnostics {
  generatedAt: string
  knowledgeRoot: string
  recentObservations: Observation[]
  workspaces: KnowledgeWorkspaceDiagnostics[]
  candidates: { facts: number; wikiPatches: number; graphEdges: number; byDerivation: KnowledgeProposalsByDerivation }
  truth: { facts: number; wikiPages: number; graphEdges: number }
  /** Phase 5 (§6): recall 索引最近一次重建时间；从未构建为 null。 */
  indexUpdatedAt: string | null
  captureFailures: number
  captureRecovery?: { batches: number; events: number; lastError?: string }
}

/** Phase 1-1: manual trigger input for the knowledge processing queue. */
export interface KnowledgeProcessNowInput {
  workspaceId?: string
}

/** Phase 1-1: result of a manual queue run. Cursor advances only on handler success. */
export interface KnowledgeProcessNowResult {
  processed: number
  failed: number
  pending: number
  advancedWorkspaces: string[]
  handlerMissing: boolean
}

export interface KnowledgeProcessingWorkspaceStats {
  workspaceId: string
  pending: number
  lastObservationAt?: string
}

/** Phase 5: last queue run summary (mirrors the queue's QueueRunSummary). */
export interface KnowledgeProcessingLastRun {
  at: string
  processed: number
  failed: number
}

/** Phase 1-1: queue metrics for the Workbench status bar. */
export interface KnowledgeProcessingStats {  generatedAt: string
  refinement?: import('../memory-decision').RefinementTaskStats
  pendingTotal: number
  workspaces: KnowledgeProcessingWorkspaceStats[]
  failures: number
  lastRunAt: string | null
  lastRun: KnowledgeProcessingLastRun | null
  handlerConfigured: boolean
  /** Phase 2/5: LLM stage wiring + process-lifetime outcome counters. */
  llmConfigured: boolean
  llmSucceeded: number
  llmFailed: number
  llmSkipped: number
  /** Phase 5 (§6): proposed 候选按 derivation 计数 + 总数。 */
  proposalsByDerivation: KnowledgeProposalsByDerivation
  proposalsTotal: number
  /** Phase 5 (§6): recall 索引最近一次重建时间；从未构建为 null。 */
  indexUpdatedAt: string | null
  /** Phase 5 (§6): retention 维护最近一次成功时间；从未成功为 null。 */
  lastMaintenanceAt: string | null
}

export type ExternalMcpClientId = 'claude-code' | 'codex' | 'opencode' | 'janus' | 'pi' | 'dsh'

export interface ExternalMcpClientStatus {
  id: ExternalMcpClientId
  label: string
  configPath: string
  registered: boolean
  support?: 'automatic' | 'unverified'
  current?: boolean
  format?: string
  error?: string
}

export interface ExternalMcpStatus {
  entry: string
  entryExists: boolean
  launch?: { command: string; args: string[]; env?: Record<string, string> }
  isPackaged: boolean
  clients: ExternalMcpClientStatus[]
}

export interface ExternalMcpProbeResult {
  ok: boolean
  stage: 'start' | 'handshake' | 'tools' | 'query'
  tools: string[]
  error?: string
}

export interface ExternalMcpRegisterResult {
  ok: boolean
  client: ExternalMcpClientId
  configPath: string
  backedUpPath?: string
  error?: string
}

export interface KnowledgeAPI {
  automationStatus: () => Promise<import('../knowledge-automation').KnowledgeAutomationStatus>
  automationRun: (input?: { backfill?: boolean }) => Promise<import('../knowledge-automation').KnowledgeAutomationStatus>
  automationRetry: (id: string) => Promise<void>
  setJevCredential: (key: string) => Promise<void>
  revealJevCredential: () => Promise<string | null>
  jevCredentialStatus: () => Promise<{ configured: boolean }>
  stopLocalModel: () => Promise<void>
  installLocalResources: () => Promise<import('../knowledge-automation').KnowledgeLocalResources>
  localResourcesStatus: () => Promise<import('../knowledge-automation').KnowledgeLocalResources>
  configureLocalModel: (input: import('../knowledge-automation').KnowledgeLocalSettings) => Promise<{ settings: KnowledgeSettings; report: import('../knowledge-automation').KnowledgeLocalEnvironment }>
  wikiHistory: (input: import('../wiki-history').WikiHistoryQuery) => Promise<import('../wiki-history').WikiHistoryPage>
  wikiRevision: (input: import('../wiki-history').WikiRevisionQuery) => Promise<import('../wiki-history').WikiRevision>
  pinWikiRevision: (input: import('../wiki-history').WikiRevisionPinInput) => Promise<void>
  noteWikiPages: (input: { rootPath: string; uri: string }) => Promise<NoteWikiPage[]>
  prepareNoteWiki: (input: PrepareNoteWikiInput) => Promise<NoteWikiDraft>
  proposeNoteWiki: (input: { draftId: string; title: string; markdown: string; rationale: string }) => Promise<CandidateWikiPatch>
  noteWikiStatuses: (input: { candidateId?: string; workspaceId?: string; slug?: string }) => Promise<WikiNoteStatus[]>
  contracts: () => Promise<KnowledgeContractsSnapshot>
  bootstrap: (workspacePath?: string) => Promise<KnowledgeBootstrapResult>
  observe: (input: CaptureObservationInput) => Promise<Observation>
  listObservations: (query: ObservationQuery) => Promise<Observation[]>
  pruneObservations: (query: ObservationPruneQuery) => Promise<ObservationPruneResult>
  observationRevocationContext: (input: { id: string; workspaceId: string }) => Promise<{ sourceHash: string; revoked: boolean; content: string }>
  revokeObservation: (input: { id: string; workspaceId: string; sourceHash: string }) => Promise<void>
  observationRevocations: (input: { offset?: number; limit?: number }) => Promise<ObservationRevocationsPage>
  autoPruneObservations: (nowMs?: number) => Promise<ObservationPruneResult>
  resolveObservationContent: (observation: Observation) => Promise<string>
  retentionStats: () => Promise<RetentionStats>
  listAudit: (query?: AuditQuery) => Promise<AuditEvent[]>
  auditStats: () => Promise<AuditStats>
  listCandidates: () => Promise<CandidateFact[]>
  listGraphCandidates: () => Promise<CandidateGraphEdge[]>
  listWikiPatchCandidates: () => Promise<CandidateWikiPatch[]>
  rejectCandidate: (input: ReviewCandidateInput) => Promise<ReviewResult>
  applyCandidate: (input: ReviewCandidateInput) => Promise<ReviewResult>
  factReviewContext: (input: ReviewCandidateInput) => Promise<FactReviewContext>
  search: (query: KnowledgeSearchQuery) => Promise<KnowledgeSearchResult>
  listTruth: () => Promise<KnowledgeTruthSnapshot>
  revokeTruth: (input: RevokeTruthInput) => Promise<void>
  listConflicts: (workspaceId: string) => Promise<KnowledgeConflict[]>
  recordFeedback: (input: KnowledgeFeedbackInput) => Promise<void>
  feedbackSummary: (workspaceId?: string) => Promise<KnowledgeFeedbackSummary>
  context: (request: KnowledgeContextRequest) => Promise<KnowledgeContextResult>
  diagnostics: (query?: KnowledgeDiagnosticsQuery) => Promise<KnowledgeDiagnostics>
  processNow: (input?: KnowledgeProcessNowInput) => Promise<KnowledgeProcessNowResult>
  processingStats: () => Promise<KnowledgeProcessingStats>
  externalMcpStatus: () => Promise<ExternalMcpStatus>
  probeExternalMcp: () => Promise<ExternalMcpProbeResult>
  registerExternalMcp: (client: ExternalMcpClientId) => Promise<ExternalMcpRegisterResult>
  userMemoryOverview: () => Promise<UserMemoryOverview>
  personalProfileEditContext: () => Promise<PersonalProfileEditContext>
  savePersonalProfile: (input: { expectedHash: string; overrides: PersonalProfileOverrides }) => Promise<void>
  importLegacyPersonalMemory: () => Promise<{ created: number; remaining: number }>
  migrateLegacyEpisodes: (input?: { expectedHash?: string }) => Promise<{ hash: string; files: number; episodes: number; migrated: number }>
  layaControl: (action: import('../laya').LayaAction) => Promise<import('../laya').LayaStatus>
  candidateAction: (input: { candidateId: string; candidateHash: string; action: 'score' | 'refine' }) => Promise<void>
  forgetPersonalMemory: (input: { targetId: string; targetHash: string; kind?: 'fact' | 'episode' | 'override' }) => Promise<void>
  proposePersonalMemoryCorrection: (input: { targetId: string; targetHash: string; content: string }) => Promise<{ candidateId: string; status: CandidateFact['status'] }>
  getPersonalSettings: () => Promise<import('../personal-memory-settings').PersonalMemorySettings>
  updatePersonalSettings: (settings: Partial<import('../personal-memory-settings').PersonalMemorySettings>) => Promise<import('../personal-memory-settings').PersonalMemorySettings>
  getSettings: () => Promise<KnowledgeSettings>
  updateSettings: (settings: Partial<KnowledgeSettings>) => Promise<KnowledgeSettings>
}

export interface PrepareNoteWikiInput {
  rootPath: string
  uris: string[]
  pageSlug: string
  reviewMode: 'incremental' | 'full-page'
  expectedVersion: number
}
export interface NoteWikiDraft {
  draftId: string
  page?: WikiPage
  sources: Array<{ uri: string; sourceHash: string; raw: string }>
}
export interface NoteWikiPage { page: WikiPage; sources: WikiNoteStatus[] }
