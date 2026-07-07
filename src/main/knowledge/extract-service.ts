/**
 * @file KnowledgeExtractService —— Phase 6 候选知识提炼
 * @description
 *  - 输入：retentionClass='evidence' 的 Observation 批次。
 *  - 调用 LLM（对齐 analyzer.ts:409-433 的 callLLM 模式）以 `generateObject` + zod schema
 *    结构化抽取 CandidateFact / CandidateWikiPatch / CandidateGraphEdge。
 *  - 候选只 append 到 `facts/candidates.jsonl` / `wiki/patches.jsonl` / `graph/candidates.jsonl`，
 *    绝不直接写入 `facts/facts.jsonl` / `graph/edges.jsonl` / 正式 wiki 页面。
 *  - 每批抽取写一条 `candidate_proposed` AuditEvent（after 含本批候选 id 列表与 sourceObservationIds）。
 *  - 无默认 LLM 时安全降级（返回空候选数组 + 原因，不抛错），对齐 analyzer.ts:552-562。
 */
import { randomUUID } from 'crypto'
import { appendFile, mkdir, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { z } from 'zod'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  GraphRelationType,
  KnowledgeProvenance,
  KnowledgeSource,
  MemoryFact,
  Observation,
  ObservationQuery,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeObservationService } from './observation-service'
import { knowledgeAuditService } from './audit-service'
import { llmService } from '../llm/LlmService'

const FACT_CANDIDATES_FILE = join('facts', 'candidates.jsonl')
const GRAPH_CANDIDATES_FILE = join('graph', 'candidates.jsonl')
const WIKI_PATCHES_FILE = join('wiki', 'patches.jsonl')

const DEFAULT_BATCH_LIMIT = 20
const MAX_BATCH_LIMIT = 50

const GRAPH_RELATION_TYPES = [
  'mentions',
  'derived_from',
  'supersedes',
  'depends_on',
  'conflicts_with',
  'implemented_in',
  'owned_by',
  'used_by_agent',
] as const satisfies GraphRelationType[]

const extractSchema = z.object({
  facts: z
    .array(
      z.object({
        content: z.string(),
        concepts: z.array(z.string()).default([]),
        files: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  wikiPatches: z
    .array(
      z.object({
        pageSlug: z.string(),
        title: z.string(),
        patchMarkdown: z.string(),
        rationale: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  graphEdges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(GRAPH_RELATION_TYPES),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
})
type ExtractResult = z.infer<typeof extractSchema>

export interface ExtractInput {
  /** 直接喂入的 evidence observation 批次；若未提供则按 query 从 observation-service 拉取。 */
  observations?: Observation[]
  /** 从 observation-service.list 拉取 observations 用的查询。 */
  query?: ObservationQuery
  /** query 模式下最大返回条数（默认 20，上限 50）。 */
  limit?: number
  /** 覆盖 provenance.workspaceId（缺省从首条 observation 推导）。 */
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
  /** provenance.source（默认 'system'）。 */
  source?: KnowledgeSource
  actor?: string
  correlationId?: string
}

export interface ExtractOutput {
  facts: CandidateFact[]
  wikiPatches: CandidateWikiPatch[]
  graphEdges: CandidateGraphEdge[]
  /** 降级成功时给出原因（未抛错）。 */
  degraded?: { reason: string; detail?: string }
  /** 写入的 audit event id（无候选或降级时缺省）。 */
  auditEventId?: string
}

/**
 * 从 observation 推导出 batch 共享 provenance 的 workspace 三元组。
 * 缺省值兼容过往 observationService 的 'global' 兜底语义。
 */
function deriveWorkspace(
  observations: Observation[],
  overrides: { workspaceId?: string; workspaceName?: string; workspacePath?: string },
): { workspaceId: string; workspaceName: string; workspacePath: string } {
  const first = observations[0]
  return {
    workspaceId:
      overrides.workspaceId?.trim() ||
      first?.workspaceId ||
      'global',
    workspaceName:
      overrides.workspaceName?.trim() ||
      first?.workspaceName ||
      'global',
    workspacePath:
      overrides.workspacePath?.trim() ||
      first?.workspacePath ||
      '',
  }
}

function buildSystemPrompt(): string {
  return [
    '【知识引擎候选提炼】',
    '你的职责是从给定的观察记录中只产出"候选"知识，绝不直接断言真相。',
    '规则：',
    '- 仅产出你能在观察中找到直接证据的事实、wiki 补丁、图边。',
    '- 置信度保守取值；信息不足时 confidence 取低值。',
    '- 不要编造证据；不要引用未给出的观察 ID。',
    '- 输出严格遵循 schema；无依据的项留空数组，不要硬凑。',
    '- wikiPatches 的 pageSlug 须为小写短横线标识；patchMarkdown 是增量补充段落而非完整页面。',
  ].join('\n')
}

function buildUserMessage(observations: Observation[]): string {
  const blocks = observations.map((observation, index) => {
    const header = [
      `# 观察 ${index + 1}`,
      `id: ${observation.id}`,
      `type: ${observation.type}`,
      `source: ${observation.source}`,
      `workspace: ${observation.workspaceName} (${observation.workspaceId})`,
      `createdAt: ${observation.createdAt}`,
    ].join('\n')
    const body = observation.content.trim()
    return `${header}\n\n${body}`
  })
  return [
    '【观察批次】',
    ...blocks,
    '',
    '请基于上述观察按 schema 产出候选知识。',
  ].join('\n\n')
}

async function ensureCandidateFile(relativePath: string): Promise<string> {
  const absolutePath = join(knowledgeRootPath(), relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  try {
    await readFile(absolutePath, 'utf8')
  } catch {
    await appendFile(absolutePath, '', 'utf8')
  }
  return absolutePath
}

async function appendJsonl(relativePath: string, record: unknown): Promise<void> {
  const absolutePath = await ensureCandidateFile(relativePath)
  await appendFile(absolutePath, `${JSON.stringify(record)}\n`, 'utf8')
}

function mapFactCandidate(
  raw: ExtractResult['facts'][number],
  provenance: KnowledgeProvenance,
): CandidateFact {
  const factId = randomUUID()
  const candidateId = randomUUID()
  const fact: MemoryFact = {
    id: factId,
    content: raw.content,
    concepts: raw.concepts,
    files: raw.files,
    tags: raw.tags,
    confidence: raw.confidence,
    version: 1,
    status: 'proposed',
    provenance,
  }
  return {
    id: candidateId,
    type: 'fact',
    status: 'proposed',
    fact,
  }
}

function mapWikiPatchCandidate(
  raw: ExtractResult['wikiPatches'][number],
  provenance: KnowledgeProvenance,
): CandidateWikiPatch {
  return {
    id: randomUUID(),
    type: 'wiki-patch',
    status: 'proposed',
    pageSlug: raw.pageSlug,
    title: raw.title,
    patchMarkdown: raw.patchMarkdown,
    rationale: raw.rationale,
    confidence: raw.confidence,
    provenance,
  }
}

function mapGraphEdgeCandidate(
  raw: ExtractResult['graphEdges'][number],
  provenance: KnowledgeProvenance,
): CandidateGraphEdge {
  const edgeId = randomUUID()
  const candidateId = randomUUID()
  return {
    id: candidateId,
    type: 'graph-edge',
    status: 'proposed',
    edge: {
      id: edgeId,
      from: raw.from,
      to: raw.to,
      type: raw.type,
      confidence: raw.confidence,
      sourceFactIds: [],
      workspaceId: provenance.workspaceId,
      createdAt: provenance.createdAt,
    },
    reviewNotes: undefined,
  }
}

function normalizeList(value: string[] | undefined): string[] {
  return (value ?? []).filter((item) => typeof item === 'string' && item.trim().length > 0)
}

function clampBatchLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_BATCH_LIMIT
  return Math.max(1, Math.min(MAX_BATCH_LIMIT, Math.trunc(limit as number)))
}

/** 内部用的 evidence 过滤（不动 observation-service 的现有签名）。 */
function filterEvidence(observations: Observation[]): Observation[] {
  return observations.filter((observation) =>
    (observation.retentionClass ?? 'evidence') === 'evidence',
  )
}

export class KnowledgeExtractService {
  async extract(input: ExtractInput): Promise<ExtractOutput> {
    // 1. 取证据 observation 批次
    let rawObservations: Observation[]
    if (input.observations && input.observations.length > 0) {
      rawObservations = input.observations
    } else {
      const query = input.query ?? { limit: clampBatchLimit(input.limit) }
      rawObservations = await knowledgeObservationService.list(query)
    }

    const evidence = filterEvidence(rawObservations)
    const empty: ExtractOutput = {
      facts: [],
      wikiPatches: [],
      graphEdges: [],
    }
    if (evidence.length === 0) {
      return { ...empty, degraded: { reason: 'no-evidence' } }
    }

    // 2. 解析 blobbed 内容，喂给 LLM
    const resolved: Observation[] = []
    for (const observation of evidence) {
      if (observation.blobRef) {
        try {
          const fullContent = await knowledgeObservationService.resolveContent(observation)
          resolved.push({ ...observation, content: fullContent })
        } catch {
          // 退化用 preview / truncated content
          resolved.push(observation)
        }
      } else {
        resolved.push(observation)
      }
    }

    // 3. 无默认 LLM → 安全降级（不抛错，对齐 analyzer.ts:552-562）
    const def = await llmService.getDefaultModel().catch(() => null)
    if (!def) {
      return { ...empty, degraded: { reason: 'no-default-llm' } }
    }

    // 4. 调用 generateObject（对齐 analyzer.ts:409-433）
    const model = await llmService.getLanguageModel(def.provider.id, def.modelId)
    const ai = await llmService.getAiModule()
    const generateObject = ai.generateObject as (
      opts: unknown,
    ) => Promise<{ object: ExtractResult }>

    let result: ExtractResult
    try {
      const response = await generateObject({
        model,
        name: 'knowledgeExtract',
        mode: 'json',
        schema: extractSchema,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserMessage(resolved) }],
        temperature: 0.2,
      })
      result = extractSchema.parse(response.object)
    } catch (error) {
      return {
        ...empty,
        degraded: {
          reason: 'generate-object-failed',
          detail: error instanceof Error ? error.message : String(error),
        },
      }
    }

    // 5. 构造共享 provenance
    const workspace = deriveWorkspace(resolved, input)
    const createdAt = new Date().toISOString()
    const sourceObservationIds = resolved.map((observation) => observation.id)
    const fileRefs = Array.from(
      new Set(resolved.flatMap((observation) => normalizeList(observation.fileRefs))),
    )
    const provenance: KnowledgeProvenance = {
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.workspaceName,
      workspacePath: workspace.workspacePath,
      source: input.source ?? 'system',
      sourceObservationIds,
      fileRefs,
      actor: input.actor?.trim() || 'knowledge-extract',
      createdAt,
    }

    // 6. 映射并落盘候选
    const factCandidates = result.facts.map((raw) => mapFactCandidate(raw, provenance))
    const wikiPatchCandidates = result.wikiPatches.map((raw) => mapWikiPatchCandidate(raw, provenance))
    const graphEdgeCandidates = result.graphEdges.map((raw) => mapGraphEdgeCandidate(raw, provenance))

    for (const candidate of factCandidates) {
      await appendJsonl(FACT_CANDIDATES_FILE, candidate)
    }
    for (const patch of wikiPatchCandidates) {
      await appendJsonl(WIKI_PATCHES_FILE, patch)
    }
    for (const edge of graphEdgeCandidates) {
      await appendJsonl(GRAPH_CANDIDATES_FILE, edge)
    }

    // 7. 写一条批次级 candidate_proposed audit
    let auditEventId: string | undefined
    const totalCandidates =
      factCandidates.length + wikiPatchCandidates.length + graphEdgeCandidates.length
    if (totalCandidates > 0) {
      const audit = await knowledgeAuditService.record({
        action: 'candidate_proposed',
        targetType: 'fact',
        targetId: workspace.workspaceId,
        before: null,
        after: {
          factCandidateIds: factCandidates.map((candidate) => candidate.id),
          wikiPatchCandidateIds: wikiPatchCandidates.map((patch) => patch.id),
          graphEdgeCandidateIds: graphEdgeCandidates.map((edge) => edge.id),
          sourceObservationIds,
        },
        provenance,
      })
      auditEventId = audit.id
    }

    return {
      facts: factCandidates,
      wikiPatches: wikiPatchCandidates,
      graphEdges: graphEdgeCandidates,
      auditEventId,
    }
  }

  /** 读取 facts/candidates.jsonl（追加写）。 */
  async listFactCandidates(): Promise<CandidateFact[]> {
    return this.readJsonl<CandidateFact>(FACT_CANDIDATES_FILE)
  }

  /** 读取 graph/candidates.jsonl（追加写）。 */
  async listGraphCandidates(): Promise<CandidateGraphEdge[]> {
    return this.readJsonl<CandidateGraphEdge>(GRAPH_CANDIDATES_FILE)
  }

  /** 读取 wiki/patches.jsonl（追加写）。 */
  async listWikiPatchCandidates(): Promise<CandidateWikiPatch[]> {
    return this.readJsonl<CandidateWikiPatch>(WIKI_PATCHES_FILE)
  }

  private async readJsonl<T>(relativePath: string): Promise<T[]> {
    const absolutePath = await ensureCandidateFile(relativePath)
    let content: string
    try {
      content = await readFile(absolutePath, 'utf8')
    } catch {
      return []
    }
    const results: T[] = []
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        results.push(JSON.parse(trimmed) as T)
      } catch {
        // 跳过畸形行
      }
    }
    return results
  }
}

export const knowledgeExtractService = new KnowledgeExtractService()