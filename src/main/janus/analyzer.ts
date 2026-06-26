/**
 * @file Janus Analyzer —— 后台蓝图分析子系统
 * @description
 *  - 输入源：git commit diff（不碰 output stream、不挂 checkpoint 事件）。
 *  - 逐 commit 触发、游标驱动（lastAnalyzedCommitSha），漏的批量补。
 *  - 大 diff 按 commit 切分；单 commit diff 超阈值再按文件切分；各段独立 generateObject，
 *    规则合并不打第二次 LLM（取最严状态 + 累加 evidence/新需求去重，进度取覆盖最多 commit 的段为准）。
 *  - 归属机制 B：一个 workspace 同时最多一个焦点节点，commit 归焦点节点。
 *  - 四入口汇入 scheduleAnalyze：① git:commit ② git:log/git:status 对账 ③ 手动 ④ 终端关闭。
 *  - LLM 调用走主进程统一路径（不经渲染层 chatStream）。
 *  - 降级安全：LLM 失败/无 LLM → applied=false，不污染 node.status/progress，statusSource 不翻转，落留痕 analysis。
 *  - 并发：内置按 nodeId 的 in-flight 锁 + 轻量队列，队列期间累计的触发合并进下一次。
 */

import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { z } from 'zod'
import { llmService } from '../llm/LlmService'
import {
  getCommitRange,
  getCommitDiff,
  commitExists,
  type CommitRangeItem
} from '../git/service'
import { blueprintStore } from './blueprint-store'
import { JANUS_PERSONA } from '../../shared/janus/persona'
import {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisResult,
  type BlueprintAnalysis,
  type BlueprintNode,
  type BlueprintNodeStatus,
  type AnalysisTrigger,
  type BlueprintRequirementCandidate
} from './types'

/** 单 commit diff token 估算阈值（约 8K token；用字符数/3.5 估算，不打 LLM 数 token）。 */
const DIFF_TOKEN_CAP = 8000
const CHARS_PER_TOKEN = 3.5
/** 单次 analyzeNode 处理的 commit 批量上限（保护首分析爆炸）。 */
const COMMIT_BATCH_CAP = 50
/** 首次分析默认只看最近 5 次提交，避免根任务首次触发时产生过多分段。 */
const INITIAL_COMMIT_BATCH_DEFAULT = 5

/** 状态严格度排序（越大越严，取最严为合并状态）。 */
const STATUS_SEVERITY: Record<BlueprintNodeStatus, number> = {
  'not-started': 0,
  archived: 1,
  planning: 2,
  paused: 3,
  done: 4,
  testing: 5,
  'in-progress': 6,
  'bug-fixing': 7,
  blocked: 8
}

/** zod schema：单段分析产出。 */
const segmentSchema = z.object({
  progress: z.number().min(0).max(100),
  status: z.enum([
    'not-started',
    'planning',
    'in-progress',
    'testing',
    'bug-fixing',
    'blocked',
    'paused',
    'done',
    'archived'
  ]),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  unresolved: z.array(z.string()),
  discoveredRequirements: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        suggestedParent: z.string(),
        confidence: z.number().min(0).max(1)
      })
    )
    .default([])
  ,
  featureUpdates: z
    .array(
      z.object({
        featureId: z.string(),
        progress: z.number().min(0).max(100).optional(),
        status: z.enum(['planned', 'in-progress', 'done', 'blocked']).optional(),
        description: z.string().optional(),
        requirementNotes: z.array(z.string()).optional()
      })
    )
    .default([]),
  newFeatureRequirements: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        suggestedParent: z.string().default(''),
        confidence: z.number().min(0).max(1).default(0.5)
      })
    )
    .default([])
})
type SegmentResult = z.infer<typeof segmentSchema>

interface Segment {
  commits: CommitRangeItem[]
  diff: string
}

interface AnalysisErrorInfo {
  code: string
  message: string
}

/** Analyzer 职责追加段（拼在 JANUS_PERSONA 之后）。 */
const ANALYZER_DUTY = `

【分析子系统职责】
你现在作为 Janus 的分析子系统运行。你将对照蓝图节点的预期（positioning / techSolution / requirement features / issues）与实际 commit 变更，产出结构化判断：
- progress：0-100，按已完成的预期工作量占比估算。
- status：从 not-started / planning / in-progress / testing / bug-fixing / blocked / paused / done / archived 中选择最贴切的当前状态。
- summary：一句话概括本次变更相对预期的进展。
- confidence：0-1，你对本次判断的置信度，保守取值。
- evidence：支撑判断的具体证据（文件路径 / commit / 代码要点）。
- unresolved：仍存疑或未完成的事项。
- discoveredRequirements：预期之外、由本次变更新暴露出的需求提议（仅提议，不执行），suggestedParent 为建议挂载的父节点标题。
 - featureUpdates：对已有需求项的受控更新，只允许更新 featureId 对应条目的 progress/status/description/requirementNotes。不要改写定位和技术方案。
 - newFeatureRequirements：当前节点内可能需要补充的新增需求项提议；同样只进入候选需求 Inbox，不能直接写入 features。
规则：只提议不执行；对置信度保守；不要编造证据；信息不足以判断时 confidence 取低值并据实说明。`

export function getAnalysisSystemPrompt(): string {
  return JANUS_PERSONA + ANALYZER_DUTY
}

/** 估算 token 数（字符数 / 3.5）。 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** 把一段 commit 列表按 §约束5 切成多个 segment。 */
async function buildSegments(cwd: string, commits: CommitRangeItem[]): Promise<Segment[]> {
  const segments: Segment[] = []
  for (const c of commits) {
    const diff = await getCommitDiff(cwd, c.hash).catch(() => '')
    if (!diff) continue
    if (estimateTokens(diff) <= DIFF_TOKEN_CAP) {
      segments.push({ commits: [c], diff })
      continue
    }
    // 单 commit diff 过大：按文件边界切分
    const chunks = splitDiffByFile(diff)
    for (const chunk of chunks) {
      if (!chunk.trim()) continue
      segments.push({ commits: [c], diff: chunk })
    }
  }
  return segments
}

/** 按 `diff --git` 文件边界切分（尽量塞满 token 上限）。 */
function splitDiffByFile(diff: string): string[] {
  const lines = diff.split('\n')
  const fileBlocks: string[] = []
  let cur: string[] = []
  for (const line of lines) {
    if (line.startsWith('diff --git') && cur.length > 0) {
      fileBlocks.push(cur.join('\n'))
      cur = []
    }
    cur.push(line)
  }
  if (cur.length > 0) fileBlocks.push(cur.join('\n'))

  const chunks: string[] = []
  let acc = ''
  for (const block of fileBlocks) {
    const candidate = acc ? acc + '\n' + block : block
    if (estimateTokens(candidate) > DIFF_TOKEN_CAP && acc) {
      chunks.push(acc)
      acc = block
    } else {
      acc = candidate
    }
  }
  if (acc) chunks.push(acc)
  return chunks
}

function buildUserMessage(node: BlueprintNode, segment: Segment): string {
  const requirements = node.features.length
    ? node.features
        .map((feature) => {
          const notes = feature.requirementNotes.length ? ` | 评估备注：${feature.requirementNotes.join('；')}` : ''
          return `- ${feature.title} [${feature.status}, ${feature.progress}%]：${feature.description || '（无描述）'}${notes}`
        })
        .join('\n')
    : '（无）'
  const issues = node.issues.length
    ? node.issues.map((i) => `- [${i.severity}] ${i.title} (${i.status})`).join('\n')
    : '（无）'

  const commitBlock = segment.commits
    .map((c) => `commit ${c.shortHash} | ${c.message} (${c.author}, ${c.date})`)
    .join('\n')

  return `【蓝图节点预期】
标题：${node.title}
定位：${node.positioning || '（未填）'}
技术方案：${node.techSolution || '（未填）'}
旧版节点描述（仅兼容参考）：${node.description || '（无）'}
需求项：
${requirements}
问题：
${issues}

【本次分析的实际变更（commit diff）】
${commitBlock}

\`\`\`diff
${segment.diff}
\`\`\`

请按 schema 产出结构化分析。`
}

/** 规则合并：取最严状态、最低置信度、累加并去重 evidence/unresolved/discoveredRequirements，进度取覆盖最多 commit 的段。 */
function mergeSegments(
  results: Array<{ segment: Segment; result: SegmentResult }>
): AnalysisResult {
  if (results.length === 0) {
    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      progress: 0,
      status: 'not-started',
      summary: '',
      confidence: 0,
      evidence: [],
      unresolved: [],
      discoveredRequirements: [],
      featureUpdates: [],
      newFeatureRequirements: []
    }
  }
  if (results.length === 1) {
    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      ...results[0].result,
      discoveredRequirements: results[0].result.discoveredRequirements ?? [],
      featureUpdates: results[0].result.featureUpdates ?? [],
      newFeatureRequirements: results[0].result.newFeatureRequirements ?? []
    }
  }

  // 覆盖最多 commit 的段 → 进度/摘要来源
  const maxCommitSeg = [...results].sort(
    (a, b) => b.segment.commits.length - a.segment.commits.length
  )[0]

  // 最严状态
  const status = results.reduce<BlueprintNodeStatus>((acc, r) => {
    return STATUS_SEVERITY[r.result.status] > STATUS_SEVERITY[acc]
      ? r.result.status
      : acc
  }, results[0].result.status)

  // 最低置信度
  const confidence = results.reduce((acc, r) => Math.min(acc, r.result.confidence), 1)

  // 累加去重
  const evidence = dedupeStrings(results.flatMap((r) => r.result.evidence))
  const unresolved = dedupeStrings(results.flatMap((r) => r.result.unresolved))
  const discovered = dedupeDiscovered(results.flatMap((r) => r.result.discoveredRequirements ?? []))
  const featureUpdates = dedupeFeatureUpdates(results.flatMap((r) => r.result.featureUpdates ?? []))
  const newFeatureRequirements = dedupeDiscovered(
    results.flatMap((r) => r.result.newFeatureRequirements ?? [])
  )

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    progress: maxCommitSeg.result.progress,
    status,
    summary: maxCommitSeg.result.summary,
    confidence,
    evidence,
    unresolved,
    discoveredRequirements: discovered,
    featureUpdates,
    newFeatureRequirements
  }
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of arr) {
    const key = s.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function dedupeDiscovered(
  arr: Array<{ title: string; description: string; suggestedParent: string; confidence: number }>
) {
  const seen = new Set<string>()
  const out: typeof arr = []
  for (const d of arr) {
    const key = d.title.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

function dedupeFeatureUpdates(
  arr: Array<{
    featureId: string
    progress?: number
    status?: 'planned' | 'in-progress' | 'done' | 'blocked'
    description?: string
    requirementNotes?: string[]
  }>
) {
  const seen = new Set<string>()
  const out: typeof arr = []
  for (const item of arr) {
    const key = item.featureId.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function normalizeAnalysisError(err: unknown): AnalysisErrorInfo {
  const raw = errorMessageOf(err)
  if (raw === 'no-default-llm') {
    return {
      code: 'no-default-llm',
      message: '未配置默认模型。请在模型设置中选择一个可用的默认 LLM 后重新分析。'
    }
  }
  if (/default object generation mode/i.test(raw) || /object generation mode/i.test(raw)) {
    return {
      code: 'llm-object-mode-unsupported',
      message:
        '当前默认模型不支持 Janus 结构化分析。请切换到支持 JSON/结构化输出的模型，或在模型提供方适配里启用 object generation / JSON mode 后重试。'
    }
  }
  if (/json/i.test(raw) && /(mode|schema|object|structured|parse)/i.test(raw)) {
    return {
      code: 'llm-structured-output-failed',
      message:
        '模型没有返回可解析的结构化分析结果。请重试，或换用结构化输出更稳定的模型。'
    }
  }
  return {
    code: 'analysis-segment-failed',
    message: `分段分析失败：${raw || '未知错误'}`
  }
}

function summarizeAnalysisErrors(errors: AnalysisErrorInfo[], allFailed: boolean): string {
  if (errors.length === 0) {
    return allFailed
      ? '分析失败：所有分段都未返回有效结果。请检查默认模型配置后重试。'
      : '部分分段分析失败。请检查默认模型配置后重试。'
  }

  const groups = new Map<string, { message: string; count: number }>()
  for (const error of errors) {
    const key = `${error.code}:${error.message}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
    } else {
      groups.set(key, { message: error.message, count: 1 })
    }
  }

  const detail = [...groups.values()]
    .map((item) => (item.count > 1 ? `${item.message}（重复 ${item.count} 次）` : item.message))
    .join('；')
  const prefix = allFailed
    ? `${errors.length} 个分段分析全部失败`
    : `${errors.length} 个分段分析失败`
  return `${prefix}：${detail}`
}

function resolveCommitLimit(value: number | undefined, isFirstAnalysis: boolean): number {
  const fallback = isFirstAnalysis ? INITIAL_COMMIT_BATCH_DEFAULT : COMMIT_BATCH_CAP
  const candidate = Number.isFinite(value) ? Math.trunc(value as number) : fallback
  return Math.max(1, Math.min(COMMIT_BATCH_CAP, candidate))
}

/** 单段 LLM 调用。 */
async function callLLM(
  node: BlueprintNode,
  segment: Segment
): Promise<SegmentResult> {
  const def = await llmService.getDefaultModel()
  if (!def) {
    throw new Error('no-default-llm')
  }
  const model = await llmService.getLanguageModel(def.provider.id, def.modelId)
  const ai = await llmService.getAiModule()
  const generateObject: (opts: unknown) => Promise<{ object: SegmentResult }> =
    ai.generateObject

  const res = await generateObject({
    model,
    name: 'blueprintAnalysis',
    mode: 'json',
    schema: segmentSchema,
    system: getAnalysisSystemPrompt(),
    messages: [{ role: 'user', content: buildUserMessage(node, segment) }],
    temperature: 0.2
  })
  return res.object
}

class JanusAnalyzer {
  private mainWindow: BrowserWindow | null = null
  /** nodeId -> workspacePath（手动分析时若 IPC 未带 workspace，用此回退） */
  private nodeWorkspace = new Map<string, string>()
  /** in-flight 锁 + 队列合并 */
  private inflight = new Map<string, Promise<BlueprintAnalysis | null>>()
  private pending = new Set<string>()
  private pendingOpts = new Map<string, AnalyzeOptions>()

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  /** 记录 nodeId 所属 workspace（在蓝图加载/创建/绑定时调用）。 */
  registerNodeWorkspace(nodeId: string, workspace: string): void {
    this.nodeWorkspace.set(nodeId, workspace)
  }

  /** 投队列 + 去重，最终聚到 analyzeNode。所有触发入口都走这里。 */
  scheduleAnalyze(nodeId: string, opts: AnalyzeOptions): void {
    if (this.inflight.has(nodeId)) {
      this.pending.add(nodeId)
      this.pendingOpts.set(nodeId, opts) // 合并进下一次
      return
    }
    const p = this.analyzeNode(nodeId, opts)
      .catch((err) => {
        console.error('[JanusAnalyzer] analyzeNode failed:', err)
        return null
      })
      .finally(() => {
        this.inflight.delete(nodeId)
        if (this.pending.has(nodeId)) {
          this.pending.delete(nodeId)
          const next = this.pendingOpts.get(nodeId)
          this.pendingOpts.delete(nodeId)
          if (next) this.scheduleAnalyze(nodeId, next)
        }
      })
    this.inflight.set(nodeId, p)
  }

  /** 等待某 nodeId 的当前分析完成（供测试/IPC 同步返回）。 */
  awaitInflight(nodeId: string): Promise<BlueprintAnalysis | null> | null {
    return this.inflight.get(nodeId) ?? null
  }

  /** 对账补漏：取焦点节点游标，有未分析 commit 则入队。 */
  async maybeReconcile(workspace: string): Promise<void> {
    const focused = await blueprintStore.findFocusedNode(workspace)
    if (!focused) return
    this.registerNodeWorkspace(focused.node.id, workspace)
    this.scheduleAnalyze(focused.node.id, {
      workspacePath: workspace,
      trigger: 'reconcile'
    })
  }

  /** 焦点节点调度分析（入口① git:commit 用 commit-threshold 触发）。 */
  async scheduleFocusedAnalyze(
    workspace: string,
    trigger: AnalysisTrigger
  ): Promise<void> {
    const focused = await blueprintStore.findFocusedNode(workspace)
    if (!focused) return
    this.registerNodeWorkspace(focused.node.id, workspace)
    this.scheduleAnalyze(focused.node.id, { workspacePath: workspace, trigger })
  }

  /** 终端关闭最终分析：按 terminalId 反查绑定节点。 */
  async analyzeTerminal(workspace: string, terminalId: string): Promise<void> {
    const found = await blueprintStore.findNodeByTerminal(workspace, terminalId)
    if (!found) return
    this.registerNodeWorkspace(found.node.id, workspace)
    this.scheduleAnalyze(found.node.id, {
      workspacePath: workspace,
      trigger: 'terminal-close'
    })
  }

  /**
   * 分析单个节点。核心流程。
   * 成功：落 applied=true 的 BlueprintAnalysis + 回写状态 + 推进游标 + 发 Island 事件。
   * 失败/无 LLM：落 applied=false 留痕 analysis，不推进游标，不污染状态。
   */
  async analyzeNode(
    nodeId: string,
    opts: AnalyzeOptions
  ): Promise<BlueprintAnalysis | null> {
    const workspace = opts.workspacePath ?? this.nodeWorkspace.get(nodeId)
    if (!workspace) {
      console.warn('[JanusAnalyzer] no workspace for node', nodeId)
      return null
    }
    this.registerNodeWorkspace(nodeId, workspace)

    const found = await blueprintStore.findNode(workspace, nodeId)
    if (!found) {
      console.warn('[JanusAnalyzer] node not found', nodeId)
      return null
    }
    const { blueprintId, node } = found

    // ---- 校验游标有效性 ----
    let cursor = node.lastAnalyzedCommitSha
    if (cursor && !(await commitExists(workspace, cursor))) {
      // 游标丢失（如 rebase），重置避免 git log 报错
      cursor = null
    }

    // ---- 取未分析 commit 批次 ----
    const commitLimit = resolveCommitLimit(opts.commitLimit, cursor === null)
    const commits = await getCommitRange(workspace, cursor, 'HEAD', commitLimit)
    if (commits.length === 0) {
      return null // 无新增 commit，无需分析
    }

    // ---- 检查是否有默认 LLM ----
    const def = await llmService.getDefaultModel().catch(() => null)
    if (!def) {
      const analysis = this.buildAnalysis(nodeId, opts.trigger, {
        blueprint: summarizeBlueprint(node),
        actual: `待分析 commit：${commits.length} 个（上限 ${commitLimit}）`
      }, null, normalizeAnalysisError(new Error('no-default-llm')).message)
      await blueprintStore.appendAnalysis(workspace, blueprintId, nodeId, analysis)
      this.emitAnalysis(analysis, node, blueprintId, workspace)
      return analysis
    }

    // ---- 分段 ----
    const segments = await buildSegments(workspace, commits)
    if (segments.length === 0) {
      // 有 commit 但 diff 全空（如 merge commit），直接推进游标，不留痕
      await blueprintStore.setCursor(workspace, blueprintId, nodeId, commits[commits.length - 1].hash)
      return null
    }

    // ---- 逐段 LLM ----
    const segResults: Array<{ segment: Segment; result: SegmentResult }> = []
    const errors: AnalysisErrorInfo[] = []
    for (const seg of segments) {
      try {
        const r = await callLLM(node, seg)
        segResults.push({ segment: seg, result: r })
      } catch (err) {
        errors.push(normalizeAnalysisError(err))
      }
    }

    const lastSha = commits[0].hash

    if (segResults.length === 0) {
      // 全部段失败：留痕，不推进游标
      const analysis = this.buildAnalysis(
        nodeId,
        opts.trigger,
        { blueprint: summarizeBlueprint(node), actual: `commit：${commits.length} 个（上限 ${commitLimit}）` },
        null,
        summarizeAnalysisErrors(errors, true)
      )
      await blueprintStore.appendAnalysis(workspace, blueprintId, nodeId, analysis)
      this.emitAnalysis(analysis, node, blueprintId, workspace)
      return analysis
    }

    // ---- 规则合并 ----
    const merged = mergeSegments(segResults)
    if (errors.length > 0) {
      // 部分段失败：合并成功段，但降低置信度并记录误差
      merged.confidence = Math.min(merged.confidence, 0.4)
      merged.unresolved = dedupeStrings([
        ...merged.unresolved,
        summarizeAnalysisErrors(errors, false)
      ])
    }

    const analysis = this.buildAnalysis(
      nodeId,
      opts.trigger,
      { blueprint: summarizeBlueprint(node), actual: buildActualSummary(commits, segments, commitLimit) },
      merged,
      errors.length > 0 ? summarizeAnalysisErrors(errors, false) : undefined
    )

    // ---- 落库 + 回写状态 + 推进游标 ----
    await blueprintStore.appendAnalysis(workspace, blueprintId, nodeId, analysis)
    if (analysis.applied && analysis.result) {
      await blueprintStore.applyAnalysisPatch(workspace, blueprintId, nodeId, {
        progress: analysis.result.progress,
        status: analysis.result.status,
        featureUpdates: analysis.result.featureUpdates
      })
    }
    const candidateRequirements = [
      ...merged.discoveredRequirements,
      ...merged.newFeatureRequirements
    ]
    const candidates =
      analysis.applied && candidateRequirements.length > 0
        ? await blueprintStore.upsertRequirementCandidates(
            workspace,
            blueprintId,
            nodeId,
            analysis.id,
            candidateRequirements,
            merged.evidence
          )
        : []
    await blueprintStore.setCursor(workspace, blueprintId, nodeId, lastSha)

    // ---- Island 通知 ----
    this.emitAnalysis(analysis, node, blueprintId, workspace)
    if (candidates.length > 0) {
      this.emitDiscovered(blueprintId, workspace, node, candidates)
    }

    return analysis
  }

  private buildAnalysis(
    nodeId: string,
    trigger: AnalysisTrigger,
    inputSummary: { blueprint: string; actual: string },
    result: AnalysisResult | null,
    error?: string
  ): BlueprintAnalysis {
    return {
      id: randomUUID(),
      nodeId,
      trigger,
      inputSummary,
        result:
        result ?? {
          schemaVersion: ANALYSIS_SCHEMA_VERSION,
          progress: 0,
          status: 'not-started',
          summary: '',
          confidence: 0,
          evidence: [],
          unresolved: [],
          discoveredRequirements: [],
          featureUpdates: [],
          newFeatureRequirements: []
        },
      applied: result !== null,
      error,
      createdAt: new Date().toISOString()
    }
  }

  private emitAnalysis(
    analysis: BlueprintAnalysis,
    node: BlueprintNode,
    blueprintId: string,
    workspacePath: string
  ): void {
    try {
      this.mainWindow?.webContents.send('janus:island:analysis', {
        blueprintId,
        workspacePath,
        nodeId: analysis.nodeId,
        nodeTitle: node.title,
        applied: analysis.applied,
        error: analysis.error,
        result: analysis.result,
        createdAt: analysis.createdAt
      })
    } catch (err) {
      console.error('[JanusAnalyzer] emit analysis failed:', err)
    }
  }

  private emitDiscovered(
    blueprintId: string,
    workspacePath: string,
    node: BlueprintNode,
    candidates: BlueprintRequirementCandidate[]
  ): void {
    try {
      this.mainWindow?.webContents.send('janus:island:discovered', {
        blueprintId,
        workspacePath,
        nodeId: node.id,
        nodeTitle: node.title,
        candidateIds: candidates.map((candidate) => candidate.id),
        requirements: candidates,
        discovered: candidates.map((candidate) => ({
          title: candidate.title,
          description: candidate.description,
          suggestedParent: candidate.suggestedParentTitle ?? '',
          confidence: candidate.confidence
        })),
        createdAt: new Date().toISOString()
      })
    } catch (err) {
      console.error('[JanusAnalyzer] emit discovered failed:', err)
    }
  }
}

export interface AnalyzeOptions {
  workspacePath?: string
  trigger: AnalysisTrigger
  commitLimit?: number
}

function summarizeBlueprint(node: BlueprintNode): string {
  return [
    `标题：${node.title}`,
    `定位：${node.positioning}`,
    `技术方案：${node.techSolution}`,
    `需求项：${node.features.length} 项（完成 ${node.features.filter((feature) => feature.status === 'done').length}）`,
    `问题：${node.issues.length} 项`
  ].join('\n')
}

function buildActualSummary(commits: CommitRangeItem[], segments: Segment[], commitLimit: number): string {
  return [
    `commit 数：${commits.length}`,
    `commit 上限：${commitLimit}`,
    `分析分段数：${segments.length}`,
    `commit 列表：`,
    ...commits.map((c) => `- ${c.shortHash} ${c.message}`)
  ].join('\n')
}

export const analyzer = new JanusAnalyzer()
