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

const DEMO_CREATED_AT = '2026-07-07T09:00:00.000Z'

const demoProvenance = {
  workspaceId: 'demo-workspace',
  workspaceName: 'JanusX',
  workspacePath: 'C:\\Users\\Tree\\Desktop\\git\\JanusX',
  source: 'agent-stream' as const,
  sourceObservationIds: ['demo-obs-1', 'demo-obs-2'],
  fileRefs: ['src/main/knowledge/extract-service.ts', 'src/shared/knowledge.ts'],
  actor: 'knowledge-extract',
  createdAt: DEMO_CREATED_AT,
  model: 'default-llm',
  promptHash: 'demo-prompt-hash',
}

const demoObservations: Observation[] = [
  {
    id: 'demo-obs-1',
    workspaceId: 'demo-workspace',
    workspaceName: 'JanusX',
    workspacePath: demoProvenance.workspacePath,
    source: 'agent-stream',
    type: 'conversation-turn',
    content: 'Phase 6 completed candidate extraction with CandidateFact, CandidateWikiPatch and CandidateGraphEdge queues.',
    summary: '候选知识提炼已完成，后续进入受控召回与 Workbench 审核。',
    fileRefs: demoProvenance.fileRefs,
    tags: ['#workspace/janusx', '#type/evidence', '#source/agent-stream'],
    visibility: 'workspace',
    actor: 'agent-turn-recorder',
    createdAt: DEMO_CREATED_AT,
    retentionClass: 'evidence',
    retentionReason: 'conversation-turn',
  },
  {
    id: 'demo-obs-2',
    workspaceId: 'demo-workspace',
    workspaceName: 'JanusX',
    workspacePath: demoProvenance.workspacePath,
    source: 'git-analyzer',
    type: 'analysis-result',
    content: 'KnowledgeSearchService should start with BM25 and controlled filters before vector/RRF work.',
    summary: '下一阶段优先实现 BM25、过滤器与 source refs。',
    fileRefs: ['docs/05-大语言模型与知识库/AgentMemory记忆系统与JanusX知识引擎方案.html'],
    tags: ['#roadmap', '#phase/7', '#retrieval'],
    visibility: 'workspace',
    actor: 'janus-analyzer',
    createdAt: '2026-07-07T09:08:00.000Z',
    retentionClass: 'evidence',
    retentionReason: 'analysis-result',
  },
]

const demoFactCandidates: CandidateFact[] = [
  {
    id: 'demo-fact-1',
    type: 'fact',
    status: 'proposed',
    fact: {
      id: 'demo-memory-fact-1',
      content: 'JanusX Knowledge Engine keeps observations as the immutable evidence layer and writes LLM output only to candidate queues.',
      concepts: ['Knowledge Engine', 'Observation', 'Candidate Queue'],
      files: demoProvenance.fileRefs,
      tags: ['#architecture', '#candidate-only', '#evidence'],
      confidence: 0.92,
      version: 1,
      status: 'proposed',
      provenance: demoProvenance,
    },
  },
  {
    id: 'demo-fact-2',
    type: 'fact',
    status: 'proposed',
    fact: {
      id: 'demo-memory-fact-2',
      content: 'Phase 7 should implement BM25 recall with workspace, tag, file and source filters before graph or vector ranking.',
      concepts: ['BM25', 'KnowledgeSearchService', 'Controlled Recall'],
      files: ['src/main/knowledge/search-service.ts'],
      tags: ['#phase/7', '#retrieval', '#bm25'],
      confidence: 0.88,
      version: 1,
      status: 'proposed',
      provenance: {
        ...demoProvenance,
        sourceObservationIds: ['demo-obs-2'],
        fileRefs: ['docs/05-大语言模型与知识库/AgentMemory记忆系统与JanusX知识引擎方案.html'],
      },
    },
  },
]

const demoWikiPatches: CandidateWikiPatch[] = [
  {
    id: 'demo-wiki-1',
    type: 'wiki-patch',
    status: 'proposed',
    pageSlug: 'knowledge-engine/phase-7-controlled-recall',
    title: 'Phase 7 · BM25 受控召回',
    patchMarkdown:
      '## Phase 7 · BM25 受控召回\n\n- 先建立倒排索引与 BM25 打分。\n- 查询必须支持 workspace、tag、file、source 过滤。\n- 每个结果返回 sourceObservationIds 与 fileRefs。\n- 暂不引入 vector、RRF、query expansion。',
    rationale: '方案书明确要求先完成稳定召回，再进入混合排序。',
    confidence: 0.9,
    provenance: demoProvenance,
  },
]

const demoGraphCandidates: CandidateGraphEdge[] = [
  {
    id: 'demo-edge-1',
    type: 'graph-edge',
    status: 'proposed',
    edge: {
      id: 'demo-graph-edge-1',
      from: 'Observation',
      to: 'CandidateFact',
      type: 'derived_from',
      confidence: 0.91,
      sourceFactIds: ['demo-memory-fact-1'],
      workspaceId: 'demo-workspace',
      createdAt: DEMO_CREATED_AT,
    },
  },
  {
    id: 'demo-edge-2',
    type: 'graph-edge',
    status: 'proposed',
    edge: {
      id: 'demo-graph-edge-2',
      from: 'KnowledgeSearchService',
      to: 'BM25',
      type: 'depends_on',
      confidence: 0.86,
      sourceFactIds: ['demo-memory-fact-2'],
      workspaceId: 'demo-workspace',
      createdAt: DEMO_CREATED_AT,
    },
  },
]

const demoAuditEvents: AuditEvent[] = [
  {
    id: 'demo-audit-1',
    action: 'candidate_proposed',
    targetType: 'fact',
    targetId: 'demo-fact-1',
    after: {
      factIds: ['demo-fact-1', 'demo-fact-2'],
      wikiPatchIds: ['demo-wiki-1'],
      graphEdgeIds: ['demo-edge-1', 'demo-edge-2'],
    },
    provenance: demoProvenance,
  },
]

const demoRetentionStats: RetentionStats = {
  noise: 4,
  operational: 18,
  evidence: 42,
  derived: 6,
  total: 70,
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
