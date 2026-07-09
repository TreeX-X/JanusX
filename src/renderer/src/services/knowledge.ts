import type {
  AuditEvent,
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  Observation,
  RetentionStats,
} from '../../../shared/knowledge'

export interface KnowledgeWorkbenchSnapshot {
  observations: Observation[]
  factCandidates: CandidateFact[]
  wikiPatches: CandidateWikiPatch[]
  graphCandidates: CandidateGraphEdge[]
  auditEvents: AuditEvent[]
  retentionStats: RetentionStats | null
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
  ] = await Promise.all([
    invokeOrEmpty<Observation[]>('knowledge:observations:list', [], { scope: 'global', limit: 40 }),
    invokeOrEmpty<CandidateFact[]>('knowledge:candidates:list', []),
    invokeOrEmpty<CandidateWikiPatch[]>('knowledge:candidates:list-wiki-patches', []),
    invokeOrEmpty<CandidateGraphEdge[]>('knowledge:candidates:list-graph', []),
    invokeOrEmpty<AuditEvent[]>('knowledge:audit:list', [], { limit: 30 }),
    invokeOrEmpty<RetentionStats | null>('knowledge:retention:stats', null),
  ])

  const realRecordCount =
    observations.length +
    factCandidates.length +
    wikiPatches.length +
    graphCandidates.length +
    auditEvents.length

  if (!retentionStats) {
    errors.push('retention stats unavailable')
  }

  if (realRecordCount > 0) {
    return {
      observations,
      factCandidates,
      wikiPatches,
      graphCandidates,
      auditEvents,
      retentionStats,
      loadedAt: new Date().toISOString(),
      usingDemoData: false,
      errors,
    }
  }

  return {
    observations: demoObservations,
    factCandidates: demoFactCandidates,
    wikiPatches: demoWikiPatches,
    graphCandidates: demoGraphCandidates,
    auditEvents: demoAuditEvents,
    retentionStats: demoRetentionStats,
    loadedAt: new Date().toISOString(),
    usingDemoData: true,
    errors,
  }
}

export async function searchKnowledge(
  query: KnowledgeSearchQuery,
): Promise<KnowledgeSearchResult> {
  return window.electron.invoke('knowledge:search', query) as Promise<KnowledgeSearchResult>
}
