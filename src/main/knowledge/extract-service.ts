/**
 * @file KnowledgeExtractService —— Phase 6 候选知识提炼，Phase 2 LLM 增强
 * @description
 *  - 输入：retentionClass='evidence' 的 Observation 批次（队列按 workspace 交付，每批 ≤ 50）。
 *  - 调用 LLM（对齐 analyzer.ts:409-433 的 callLLM 模式）以 `generateObject` + zod schema
 *    结构化抽取 CandidateFact / CandidateWikiPatch / CandidateGraphEdge。
 *  - Phase 2：输出 schema 带 `kind` + `supersedes`；单次调用 60s 超时、失败重试 ≤ 2 次
 *    带退避；单批字符预算；与同批确定性候选按内容 Jaccard ≥ 0.7 合并为
 *    `derivation='merged'`；LLM 候选同样做候选阶段冲突标记。
 *  - 候选只 append 到 `facts/candidates.jsonl` / `wiki/patches.jsonl` / `graph/candidates.jsonl`，
 *    绝不直接写入 `facts/facts.jsonl` / `graph/edges.jsonl` / 正式 wiki 页面。
 *    唯一的例外是合并改写：命中的确定性候选在 review 锁下原位升级为 merged，
 *    不产生第二条 Inbox 条目。
 *  - 每批抽取写一条 `candidate_proposed` AuditEvent（after 含本批候选 id 列表与 sourceObservationIds）。
 *  - 无默认 LLM 时安全降级（返回空候选数组 + 原因，不抛错），对齐 analyzer.ts:552-562。
 *    模型失败/超时/非法输出同样降级返回，由 llm-stage 转为队列 `llm` 阶段失败账本。
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
  MemoryFact,
  Observation,
} from '../../shared/knowledge'
import type { KnowledgeProcessingMode } from '../../shared/knowledge-settings'
import type { ExtractInput, ExtractOutput } from '../../shared/ipc/knowledge'
export type { ExtractInput, ExtractOutput } from '../../shared/ipc/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeObservationService } from './observation-service'
import { knowledgeAuditService } from './audit-service'
import { knowledgeTruthService } from './truth-service'
import { withFactCandidatesLock } from './review-service'
import { findConflicts, toConflictTargets, tokenJaccard } from './deterministic-extractor'
import { configService } from '../config/service'
import { llmService } from '../llm/LlmService'
import { generateObject } from '../llm/ai-runtime'
import { writeFileAtomic } from '../lib/atomic-file'

const FACT_CANDIDATES_FILE = join('facts', 'candidates.jsonl')
const GRAPH_CANDIDATES_FILE = join('graph', 'candidates.jsonl')
const WIKI_PATCHES_FILE = join('wiki', 'patches.jsonl')

const DEFAULT_BATCH_LIMIT = 20
const MAX_BATCH_LIMIT = 50

// Phase 2 LLM 调用边界：单次超时、重试、输入预算、合并阈值。
const LLM_TIMEOUT_MS = 60_000
const LLM_MAX_RETRIES = 2
const LLM_RETRY_BASE_DELAY_MS = 1_000
// 字符数作 token 预算的代理：单条截断 + 整批上限（ oldest 先出）。
const LLM_OBSERVATION_MAX_CHARS = 6_000
const LLM_BATCH_MAX_CHARS = 60_000
const MERGE_JACCARD_THRESHOLD = 0.7
const TRUTH_CONTEXT_MAX_FACTS = 30
const TRUTH_CONTEXT_MAX_CHARS = 400

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

const FACT_KINDS = ['fact', 'preference', 'decision', 'procedure'] as const

const extractSchema = z.object({
  facts: z
    .array(
      z.object({
        content: z.string(),
        concepts: z.array(z.string()).default([]),
        files: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1),
        // Phase 2: kind/supersedes 由模型判定；容错 catch 保证单个 sloppy
        // 字段不炸掉整批（非法 kind → fact，未知 supersedes 在映射阶段丢弃）。
        kind: z.enum(FACT_KINDS).catch('fact'),
        supersedes: z.string().optional().catch(undefined),
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
        // 模型给出的相关已有知识 id；映射阶段按 knownTruthIds 过滤，未知 id 丢弃。
        sourceFactIds: z.array(z.string()).catch([]),
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
    '- 每个 fact 必须判定 kind：fact（客观事实）/ preference（偏好习惯）/ decision（已做出的决策）/ procedure（可重复的步骤、命令或排障过程）。',
    '- 仅当新事实明确替代【已有知识】中的某一条时，才在该 fact 的 supersedes 中填入那条的方括号 id；不确定时省略。内容不同但各说各话的并存知识不要填 supersedes（冲突由系统自动标记）。',
    '- wiki 补丁若总结或引用了【已有知识】中的条目，在 sourceFactIds 中填入那些条目的方括号 id（只填给出的 id）；无关时留空数组。',
  ].join('\n')
}

function truncateForPrompt(text: string, maxChars: number): string {
  const trimmed = text.trim()
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`
}

function buildUserMessage(observations: Observation[], truths: MemoryFact[]): string {
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
  const truthLines = truths
    .slice(0, TRUTH_CONTEXT_MAX_FACTS)
    .map((truth) => `- [${truth.id}] (${truth.kind}) ${truncateForPrompt(truth.content, TRUTH_CONTEXT_MAX_CHARS)}`)
  return [
    '【观察批次】',
    ...blocks,
    '',
    ...(truthLines.length > 0 ? ['【已有知识（同一工作区）】', ...truthLines, ''] : []),
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
  knownTruthIds: ReadonlySet<string>,
  truthTargets: ReturnType<typeof toConflictTargets>,
): CandidateFact {
  const factId = randomUUID()
  const candidateId = randomUUID()
  // 模型幻觉出的 supersedes（指向不存在的 truth）直接丢弃，不进审核流。
  const supersedes =
    typeof raw.supersedes === 'string' && knownTruthIds.has(raw.supersedes.trim()) && raw.supersedes.trim()
      ? raw.supersedes.trim()
      : undefined
  const fact: MemoryFact = {
    id: factId,
    content: raw.content,
    concepts: raw.concepts,
    files: raw.files,
    tags: raw.tags,
    confidence: raw.confidence,
    version: 1,
    status: 'proposed',
    kind: raw.kind,
    ...(supersedes ? { supersedes } : {}),
    provenance,
  }
  const conflicts = findConflicts(
    {
      workspaceId: provenance.workspaceId,
      kind: fact.kind,
      concepts: fact.concepts,
      files: fact.files,
      content: fact.content,
    },
    truthTargets,
  )
  return {
    id: candidateId,
    type: 'fact',
    status: 'proposed',
    fact,
    derivation: 'llm',
    evidence: { observationIds: provenance.sourceObservationIds },
    ...(conflicts.length > 0 ? { conflicts } : {}),
  }
}

function mapWikiPatchCandidate(
  raw: ExtractResult['wikiPatches'][number],
  provenance: KnowledgeProvenance,
  knownTruthIds: ReadonlySet<string>,
): CandidateWikiPatch {
  // 模型幻觉出的 sourceFactIds（指向不存在的 truth）直接丢弃，不进索引。
  const sourceFactIds = [...new Set(
    raw.sourceFactIds.map((id) => id.trim()).filter((id) => id.length > 0 && knownTruthIds.has(id)),
  )]
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
    derivation: 'llm',
    evidence: { observationIds: provenance.sourceObservationIds },
    sourceFactIds,
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
    derivation: 'llm',
    evidence: { observationIds: provenance.sourceObservationIds },
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

export interface ExtractCallOptions {
  /** 合并平局时的内容取舍（默认 deterministic）；测试可直接注入。 */
  mode?: KnowledgeProcessingMode
  /** 单次模型调用超时（默认 60s）；测试可调小。 */
  timeoutMs?: number
  /** 失败重试次数上限（默认 2，即最多 3 次调用）；测试可调小。 */
  maxRetries?: number
  /** 可注入的 sleep（超时竞速 + 重试退避共用）；测试注入空实现。 */
  sleepMs?: (ms: number) => Promise<void>
  /** 可注入的模型调用；默认走 generateObject（测试 mock 模块即可）。 */
  callModel?: (args: { model: unknown; userContent: string; abortSignal: AbortSignal }) => Promise<{ object: unknown }>
  /** 可注入的同工作区 truth 读取（prompt 上下文 + supersedes 校验 + 冲突检测）。 */
  listWorkspaceFacts?: (workspaceId: string) => Promise<MemoryFact[]>
}

function defaultSleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}

function llmTimeoutError(timeoutMs: number): Error {
  const error = new Error(`LLM extract timed out after ${timeoutMs}ms`)
  error.name = 'LlmExtractTimeoutError'
  return error
}

/**
 * Phase 2：带超时 + 重试的单次模型调用。超时用自己的 AbortController（既传给
 * SDK 做真实取消，也用 sleep 竞速兜底，保证 mock/卡死的调用同样能超时返回）。
 */
async function callWithRetry(
  options: Required<Pick<ExtractCallOptions, 'timeoutMs' | 'maxRetries' | 'sleepMs' | 'callModel'>>,
  args: { model: unknown; userContent: string },
): Promise<ExtractResult> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (attempt > 0) {
      await options.sleepMs(LLM_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
    }
    const controller = new AbortController()
    try {
      const pending = options.callModel({ ...args, abortSignal: controller.signal })
      const onTimeout = options.sleepMs(options.timeoutMs).then(() => {
        controller.abort()
        throw llmTimeoutError(options.timeoutMs)
      })
      const response = await Promise.race([pending, onTimeout])
      return extractSchema.parse(response.object)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export interface BudgetedBatch {
  observations: Observation[]
  droppedObservationIds: string[]
}

/**
 * Phase 2：单批字符预算（token 预算的代理）。先逐条截断，再超限时从最旧的
 * 整条丢弃（observations 按时间升序传入时即 oldest-first）。
 */
export function applyLlmBudget(observations: Observation[]): BudgetedBatch {
  const capped = observations.map((observation) =>
    observation.content.length > LLM_OBSERVATION_MAX_CHARS
      ? { ...observation, content: `${observation.content.slice(0, LLM_OBSERVATION_MAX_CHARS)}\n…[truncated for LLM budget]` }
      : observation,
  )
  const totalChars = (list: Observation[]): number =>
    list.reduce((total, item) => total + item.content.length, 0)
  const kept = [...capped]
  const droppedObservationIds: string[] = []
  while (kept.length > 1 && totalChars(kept) > LLM_BATCH_MAX_CHARS) {
    const dropped = kept.shift()!
    droppedObservationIds.push(dropped.id)
  }
  return { observations: kept, droppedObservationIds }
}

/**
 * Phase 2：LLM fact 候选与同批确定性候选的合并。内容 Jaccard ≥ 0.7 即视为
 * 同一条知识：原位升级确定性候选为 merged（置信度取高，mergedFrom 记两者），
 * LLM 侧不再另行 append，避免 Inbox 出现重复条目。
 */
export function mergeLlmFactCandidate(
  llm: CandidateFact,
  deterministic: CandidateFact,
  mode: KnowledgeProcessingMode,
  truthTargets: ReturnType<typeof toConflictTargets>,
): CandidateFact {
  const llmWins =
    llm.fact.confidence > deterministic.fact.confidence
    || (llm.fact.confidence === deterministic.fact.confidence && mode === 'llm-preferred')
  const winner = llmWins ? llm.fact : deterministic.fact
  const loser = llmWins ? deterministic.fact : llm.fact
  const evidenceIds = Array.from(new Set([
    ...deterministic.evidence.observationIds,
    ...llm.evidence.observationIds,
  ]))
  const merged: CandidateFact = {
    ...deterministic,
    derivation: 'merged',
    fact: {
      ...deterministic.fact,
      content: winner.content,
      concepts: [...winner.concepts],
      files: [...winner.files],
      tags: [...winner.tags],
      confidence: Math.max(deterministic.fact.confidence, llm.fact.confidence),
      kind: winner.kind,
      // winner 优先，fallback loser：任何一方指出的替代关系都不应静默丢失。
      supersedes: winner.supersedes ?? loser.supersedes,
    },
    evidence: {
      observationIds: evidenceIds,
      snippets: [...(deterministic.evidence.snippets ?? []), ...(llm.evidence.snippets ?? [])].slice(0, 5),
    },
    // 同一确定性候选被多条 LLM 事实命中时，来源链不断累积，不丢历史。
    mergedFrom: Array.from(new Set([...(deterministic.mergedFrom ?? [deterministic.id]), llm.id])),
  }
  const conflicts = findConflicts(
    {
      workspaceId: merged.fact.provenance.workspaceId,
      kind: merged.fact.kind,
      concepts: merged.fact.concepts,
      files: merged.fact.files,
      content: merged.fact.content,
    },
    truthTargets,
  )
  if (conflicts.length > 0) merged.conflicts = conflicts
  else delete merged.conflicts
  return merged
}

async function rewriteFactCandidates(records: CandidateFact[]): Promise<void> {
  const file = join(knowledgeRootPath(), FACT_CANDIDATES_FILE)
  await mkdir(dirname(file), { recursive: true })
  const body = records.map((record) => JSON.stringify(record)).join('\n')
  await writeFileAtomic(file, body.length > 0 ? `${body}\n` : '')
}

/** 默认模型调用：generateObject + abortSignal，SDK 内置重试关闭（重试由 callWithRetry 统一做，避免乘法放大）。 */
const generateStructuredObject = generateObject as unknown as (options: {
  model: unknown
  name: string
  mode: string
  schema: unknown
  system: string
  messages: Array<{ role: string; content: string }>
  temperature: number
  maxRetries: number
  abortSignal: AbortSignal
}) => Promise<{ object: unknown }>

function defaultCallModel(args: {
  model: unknown
  userContent: string
  abortSignal: AbortSignal
}): Promise<{ object: unknown }> {
  return generateStructuredObject({
    model: args.model,
    name: 'knowledgeExtract',
    mode: 'json',
    schema: extractSchema,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: args.userContent }],
    temperature: 0.2,
    maxRetries: 0,
    abortSignal: args.abortSignal,
  })
}

export class KnowledgeExtractService {
  async extract(input: ExtractInput, options: ExtractCallOptions = {}): Promise<ExtractOutput> {
    const timeoutMs = options.timeoutMs ?? LLM_TIMEOUT_MS
    const maxRetries = options.maxRetries ?? LLM_MAX_RETRIES
    const sleepMs = options.sleepMs ?? defaultSleepMs
    const callModel = options.callModel ?? defaultCallModel
    const listWorkspaceFacts = options.listWorkspaceFacts
      ?? (async (workspaceId: string) =>
        (await knowledgeTruthService.list()).facts.filter(
          (fact) => fact.provenance.workspaceId === workspaceId,
        ))

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

    // 3. Phase 2：单批字符预算（超限丢最旧，id 进 droppedObservationIds）。
    const budgeted = applyLlmBudget(resolved)
    if (budgeted.observations.length === 0) {
      return { ...empty, degraded: { reason: 'no-evidence' } }
    }

    // 4. 构造共享 provenance
    const workspace = deriveWorkspace(budgeted.observations, input)
    const createdAt = new Date().toISOString()
    const sourceObservationIds = budgeted.observations.map((observation) => observation.id)
    const fileRefs = Array.from(
      new Set(budgeted.observations.flatMap((observation) => normalizeList(observation.fileRefs))),
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

    // 5. Phase 2：同工作区 truth（prompt 上下文 + supersedes 校验 + 冲突检测）。
    const truths = await listWorkspaceFacts(workspace.workspaceId)
    const knownTruthIds = new Set(truths.map((truth) => truth.id))
    const truthTargets = toConflictTargets(truths)

    // 6. 无默认 LLM → 安全降级（不抛错，对齐 analyzer.ts:552-562）
    const def = await llmService.getDefaultModel().catch(() => null)
    if (!def) {
      return { ...empty, degraded: { reason: 'no-default-llm' } }
    }

    // 7. Phase 2：超时 + 重试调用（对齐 analyzer.ts:409-433 的 generateObject 模式）。
    // 失败/超时/非法输出在这里只记 degraded，由 llm-stage 转为队列 llm 失败账本；
    // 确定性产物不受影响（它早已在确定性阶段落盘）。
    const model = await llmService.getLanguageModel(def.provider.id, def.modelId)
    let result: ExtractResult
    try {
      result = await callWithRetry(
        { timeoutMs, maxRetries, sleepMs, callModel },
        { model, userContent: buildUserMessage(budgeted.observations, truths) },
      )
    } catch (error) {
      return {
        ...empty,
        degraded: {
          reason: 'generate-object-failed',
          detail: error instanceof Error ? error.message : String(error),
        },
      }
    }

    // 8. Phase 2：合并模式（显式注入优先，否则读配置；读不到按 auto）。
    let mode = options.mode
    if (!mode) {
      try {
        mode = (await configService.getKnowledgeSettings()).mode
      } catch {
        mode = 'auto'
      }
    }

    // 9. 映射候选；fact 候选先与同批确定性候选合并（命中则原位升级，不另行 append）。
    const llmFacts = result.facts.map((raw) =>
      mapFactCandidate(raw, provenance, knownTruthIds, truthTargets),
    )
    const wikiPatchCandidates = result.wikiPatches.map((raw) => mapWikiPatchCandidate(raw, provenance, knownTruthIds))
    const graphEdgeCandidates = result.graphEdges.map((raw) => mapGraphEdgeCandidate(raw, provenance))

    const batchIds = new Set(budgeted.observations.map((observation) => observation.id))
    const mergeable = (await this.listFactCandidates()).filter((candidate) =>
      candidate.status === 'proposed'
      && candidate.derivation === 'deterministic'
      && (candidate.evidence?.observationIds ?? []).some((id) => batchIds.has(id)),
    )
    const appendedFacts: CandidateFact[] = []
    const mergedIds: string[] = []
    const rewritten = new Map<string, CandidateFact>()
    for (const llm of llmFacts) {
      let best: CandidateFact | null = null
      let bestScore = 0
      for (const deterministic of mergeable) {
        const current = rewritten.get(deterministic.id) ?? deterministic
        const score = tokenJaccard(llm.fact.content, current.fact.content)
        if (score >= MERGE_JACCARD_THRESHOLD && (best === null || score > bestScore)) {
          best = current
          bestScore = score
        }
      }
      if (best) {
        rewritten.set(best.id, mergeLlmFactCandidate(llm, best, mode, truthTargets))
        mergedIds.push(best.id)
      } else {
        appendedFacts.push(llm)
      }
    }
    if (rewritten.size > 0) {
      const current = await this.listFactCandidates()
      const next = current.map((candidate) => rewritten.get(candidate.id) ?? candidate)
      await withFactCandidatesLock(() => rewriteFactCandidates(next))
    }

    // 10. 落盘候选
    for (const candidate of appendedFacts) {
      await appendJsonl(FACT_CANDIDATES_FILE, candidate)
    }
    for (const patch of wikiPatchCandidates) {
      await appendJsonl(WIKI_PATCHES_FILE, patch)
    }
    for (const edge of graphEdgeCandidates) {
      await appendJsonl(GRAPH_CANDIDATES_FILE, edge)
    }

    // 11. 写一条批次级 candidate_proposed audit
    let auditEventId: string | undefined
    const totalCandidates =
      appendedFacts.length + wikiPatchCandidates.length + graphEdgeCandidates.length
    if (totalCandidates > 0 || mergedIds.length > 0) {
      const audit = await knowledgeAuditService.record({
        action: 'candidate_proposed',
        targetType: 'fact',
        targetId: workspace.workspaceId,
        before: null,
        after: {
          factCandidateIds: appendedFacts.map((candidate) => candidate.id),
          wikiPatchCandidateIds: wikiPatchCandidates.map((patch) => patch.id),
          graphEdgeCandidateIds: graphEdgeCandidates.map((edge) => edge.id),
          mergedFactCandidateIds: mergedIds,
          sourceObservationIds,
        },
        provenance,
      })
      auditEventId = audit.id
    }

    return {
      facts: appendedFacts,
      wikiPatches: wikiPatchCandidates,
      graphEdges: graphEdgeCandidates,
      auditEventId,
      mergedFactCandidateIds: mergedIds,
      ...(budgeted.droppedObservationIds.length > 0
        ? { droppedObservationIds: budgeted.droppedObservationIds }
        : {}),
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
