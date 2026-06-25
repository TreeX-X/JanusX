/**
 * @file Blueprint 数据模型
 * @description Janus 蓝图子系统核心类型定义（design §2.1–§2.4）。
 *              本文件偏离文档处：
 *              - BlueprintNode 新增 `lastAnalyzedCommitSha` 游标字段（任务约束3）。
 *              - BlueprintAnalysis.result 新增 `schemaVersion` 用于向前兼容。
 *              - Blueprint 为应用级全局资源，节点通过 workspaceId 关联单个工作区。
 */

/** 蓝图节点类型 */
export type BlueprintNodeType = 'epic' | 'feature' | 'task' | 'issue'

/** 蓝图节点状态 */
export type BlueprintNodeStatus =
  | 'not-started'
  | 'planning'
  | 'in-progress'
  | 'testing'
  | 'bug-fixing'
  | 'blocked'
  | 'paused'
  | 'done'
  | 'archived'

/** 最近一次状态来源 */
export type BlueprintStatusSource = 'manual' | 'janus'

export interface WorkspaceSnapshot {
  name: string
  path: string
}

/** 分析触发来源 */
export type AnalysisTrigger =
  | 'commit-threshold'
  | 'manual'
  | 'terminal-close'
  | 'reconcile'

export interface BlueprintTodo {
  id: string
  text: string
  done: boolean
  createdAt: string
}

export type BlueprintFeatureStatus = 'planned' | 'in-progress' | 'done' | 'blocked'

export interface BlueprintFeatureItem {
  id: string
  title: string
  description: string
  progress: number
  status: BlueprintFeatureStatus
  requirementNotes: string[]
  createdAt: string
  updatedAt: string
}

export type BlueprintIssueSeverity = 'low' | 'medium' | 'high' | 'critical'
export type BlueprintIssueStatus = 'open' | 'resolved' | 'wontfix'

export interface BlueprintIssue {
  id: string
  title: string
  description: string
  severity: BlueprintIssueSeverity
  status: BlueprintIssueStatus
  createdAt: string
  resolvedAt?: string
}

export type BlueprintActivityType =
  | 'terminal-start'
  | 'file-change'
  | 'commit'
  | 'output'
  | 'analysis'
  | 'note'
  | 'status-change'

export interface BlueprintActivity {
  id: string
  type: BlueprintActivityType
  content: string
  metadata?: Record<string, unknown>
  createdAt: string
}

/** LLM 发现的需求之外的新需求提议（需人工确认后才建节点） */
export interface DiscoveredRequirement {
  title: string
  description: string
  suggestedParent: string
  confidence: number
}

/** 单次 LLM 分析产出的结构化结果 */
export interface AnalysisResult {
  schemaVersion: number
  progress: number
  status: BlueprintNodeStatus
  summary: string
  confidence: number
  evidence: string[]
  unresolved: string[]
  discoveredRequirements: DiscoveredRequirement[]
  featureUpdates: Array<{
    featureId: string
    progress?: number
    status?: BlueprintFeatureStatus
    description?: string
    requirementNotes?: string[]
  }>
  newFeatureRequirements: DiscoveredRequirement[]
}

export interface AnalysisInputSummary {
  blueprint: string
  actual: string
}

export interface BlueprintAnalysis {
  id: string
  nodeId: string
  trigger: AnalysisTrigger
  inputSummary: AnalysisInputSummary
  result: AnalysisResult
  applied: boolean
  error?: string
  createdAt: string
}

export interface BlueprintNode {
  /** 身份 */
  id: string
  title: string
  type: BlueprintNodeType
  status: BlueprintNodeStatus
  progress: number
  statusSource: BlueprintStatusSource

  /** 内容 */
  positioning: string
  description: string
  features: BlueprintFeatureItem[]
  completedItems: string[]
  techSolution: string
  notes: string

  /** 附录 */
  todos: BlueprintTodo[]
  issues: BlueprintIssue[]
  activities: BlueprintActivity[]
  analyses: BlueprintAnalysis[]

  /** 工作区与终端绑定：节点最多关联一个工作区，一个工作区可关联多个节点 */
  workspaceId: string | null
  workspaceSnapshot: WorkspaceSnapshot | null
  boundTerminalId: string | null
  terminalHistory: string[]

  /**
   * 分析游标：上次已分析的最近 commit sha。
   * null 表示从未分析过。analyzeNode 以 git log <cursor>..HEAD 取未分析批次。
   */
  lastAnalyzedCommitSha: string | null

  /** 树结构 */
  children: string[]
  parentId: string | null

  /** 元数据 */
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Blueprint {
  id: string
  name: string
  description: string
  rootNodeId: string
  nodeIds: string[]
  nodes: Record<string, BlueprintNode>
  mountedTo: string | null
  canvasLayout: Record<string, { x: number; y: number }>
  createdAt: string
  updatedAt: string
}

/** BlueprintAnalysis.result 的当前 schema 版本号 */
export const ANALYSIS_SCHEMA_VERSION = 1
