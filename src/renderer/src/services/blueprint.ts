/**
 * @file 渲染进程 Blueprint / Janus 服务层
 * @description
 *  通过 IPC 封装主进程已就绪的 blueprint:* / janus:* 通道（见 src/main/ipc/janus-handlers.ts）。
 *  本文件为 P2 React Flow 画布提供数据底座，函数签名与主进程 handler 一一对应，不引入新依赖。
 *
 *  类型复用策略：main/janus/types.ts 为纯类型文件（含一个常量），无 main 运行时依赖，
 *  渲染层直接 `import type` 复用，不重复定义。详见文末「类型复用说明」。
 */

import type {
  Blueprint,
  BlueprintAnalysis,
  BlueprintNode,
  BlueprintNodeType,
  AnalysisTrigger,
  DiscoveredRequirement,
  BlueprintFeatureItem,
  BlueprintRequirementCandidate,
  BlueprintRequirementCandidateStatus
} from '../../../main/janus/types'

/* ════════════════════════════════════════════════════════════
   共享类型 re-export（供 P2 画布 / P3 节点详情直接 import）
   ════════════════════════════════════════════════════════════ */
export type {
  Blueprint,
  BlueprintNode,
  BlueprintNodeType,
  BlueprintNodeStatus,
  BlueprintStatusSource,
  BlueprintTodo,
  BlueprintIssue,
  BlueprintIssueSeverity,
  BlueprintIssueStatus,
  BlueprintActivity,
  BlueprintActivityType,
  BlueprintAnalysis,
  AnalysisTrigger,
  AnalysisResult,
  AnalysisInputSummary,
  DiscoveredRequirement,
  BlueprintFeatureItem,
  BlueprintRequirementCandidate,
  BlueprintRequirementCandidateStatus
} from '../../../main/janus/types'

/* ════════════════════════════════════════════════════════════
   IPC 入参 / 出参类型（与 main handler 签名严格对齐）
   ════════════════════════════════════════════════════════════ */

/** blueprint:create 入参（对应 main handler input） */
export interface BlueprintCreateInput {
  name: string
  description?: string
  rootTitle?: string
  rootType?: BlueprintNodeType
}

/** blueprint:update 入参 patch */
export interface BlueprintUpdatePatch {
  name?: string
  description?: string
  canvasLayout?: Record<string, { x: number; y: number }>
}

/** blueprint:node:create 入参（title + type 必填，其余可部分覆盖） */
export type NodeCreateInput = Partial<BlueprintNode> & {
  title: string
  type: BlueprintNodeType
}

/** janus:analyzer:analyze 入参 */
export interface AnalyzerAnalyzePayload {
  nodeId: string
  workspacePath?: string
  trigger?: AnalysisTrigger
  commitLimit?: number
}

/** janus:node:focus 入参 */
export interface FocusNodePayload {
  workspacePath: string
  nodeId: string
}

/** janus:analyzer:accept-discovered 入参 */
export interface AcceptDiscoveredPayload {
  workspacePath: string
  blueprintId: string
  discovered: DiscoveredRequirement
  parentId?: string
  fallbackNodeId?: string
}

export interface AnalysisHistoryPayload {
  workspacePath: string
  blueprintId: string
  nodeId: string
}

export interface ApplyAnalysisPayload extends AnalysisHistoryPayload {
  analysisId: string
}

export interface ListCandidatesPayload {
  workspacePath: string
  blueprintId: string
  status?: BlueprintRequirementCandidateStatus
}

export interface AcceptCandidatePayload {
  workspacePath: string
  blueprintId: string
  candidateId: string
  title?: string
  description?: string
  parentId?: string
  decisionNote?: string
}

export interface RejectCandidatePayload {
  workspacePath: string
  blueprintId: string
  candidateId: string
  decisionNote?: string
}

export type FeatureItemInput = Partial<BlueprintFeatureItem> & { title: string }

/* ════════════════════════════════════════════════════════════
   Island 事件 payload 类型（主进程 webContents.send 形状，
   见 analyzer.ts emitAnalysis / emitDiscovered）
   ════════════════════════════════════════════════════════════ */

export interface IslandAnalysisEvent {
  blueprintId: string
  workspacePath: string
  nodeId: string
  nodeTitle: string
  applied: boolean
  error?: string
  result: BlueprintAnalysis['result']
  createdAt: string
}

export interface IslandDiscoveredEvent {
  blueprintId: string
  workspacePath: string
  nodeId: string
  nodeTitle: string
  candidateIds?: string[]
  requirements?: BlueprintRequirementCandidate[]
  discovered: DiscoveredRequirement[]
  createdAt: string
}

/* ════════════════════════════════════════════════════════════
   蓝图树 CRUD（main §6.1）
   ════════════════════════════════════════════════════════════ */

/**
 * 列出工作区下所有蓝图摘要。
 * @main `blueprint:list` handler(`_e, cwd: string`)
 */
export async function listBlueprints(cwd: string): Promise<Blueprint[] | null> {
  return window.electron.invoke('blueprint:list', cwd) as Promise<Blueprint[] | null>
}

/**
 * 加载完整蓝图（含 nodes 树）。
 * @main `blueprint:load` handler(`_e, cwd: string, id: string`)
 */
export async function loadBlueprint(cwd: string, id: string): Promise<Blueprint | null> {
  return window.electron.invoke('blueprint:load', cwd, id) as Promise<Blueprint | null>
}

/**
 * 新建蓝图（同时注册根节点到 analyzer）。
 * @main `blueprint:create` handler(`_e, cwd, input`)
 */
export async function createBlueprint(
  cwd: string,
  input: BlueprintCreateInput
): Promise<Blueprint> {
  return window.electron.invoke('blueprint:create', cwd, input) as Promise<Blueprint>
}

/**
 * 更新蓝图元信息 / 画布布局。
 * @main `blueprint:update` handler(`_e, cwd, id, patch`)
 */
export async function updateBlueprint(
  cwd: string,
  id: string,
  patch: BlueprintUpdatePatch
): Promise<Blueprint | null> {
  return window.electron.invoke('blueprint:update', cwd, id, patch) as Promise<Blueprint | null>
}

/**
 * 删除蓝图。
 * @main `blueprint:delete` handler(`_e, cwd, id`)
 */
export async function deleteBlueprint(cwd: string, id: string): Promise<boolean> {
  return window.electron.invoke('blueprint:delete', cwd, id) as Promise<boolean>
}

/* ════════════════════════════════════════════════════════════
   节点操作（main §6.2）
   ════════════════════════════════════════════════════════════ */

/**
 * 在 parentId 下创建子节点（成功后注册到 analyzer）。
 * @main `blueprint:node:create` handler(`_e, cwd, blueprintId, input, parentId`)
 */
export async function createNode(
  cwd: string,
  blueprintId: string,
  input: NodeCreateInput,
  parentId: string | null
): Promise<BlueprintNode | null> {
  return window.electron.invoke(
    'blueprint:node:create',
    cwd,
    blueprintId,
    input,
    parentId
  ) as Promise<BlueprintNode | null>
}

export async function replaceNodeFeatures(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  features: FeatureItemInput[]
): Promise<BlueprintNode | null> {
  return window.electron.invoke('blueprint:node:features', cwd, blueprintId, nodeId, features) as Promise<BlueprintNode | null>
}

export async function addNodeFeature(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  feature: FeatureItemInput
): Promise<BlueprintNode | null> {
  return window.electron.invoke('blueprint:node:feature:add', cwd, blueprintId, nodeId, feature) as Promise<BlueprintNode | null>
}

export async function updateNodeFeature(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  featureId: string,
  patch: Partial<BlueprintFeatureItem>
): Promise<BlueprintNode | null> {
  return window.electron.invoke(
    'blueprint:node:feature:update',
    cwd,
    blueprintId,
    nodeId,
    featureId,
    patch
  ) as Promise<BlueprintNode | null>
}

export async function deleteNodeFeature(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  featureId: string
): Promise<BlueprintNode | null> {
  return window.electron.invoke('blueprint:node:feature:delete', cwd, blueprintId, nodeId, featureId) as Promise<BlueprintNode | null>
}

/**
 * 局部更新节点字段。
 * @main `blueprint:node:update` handler(`_e, cwd, blueprintId, nodeId, patch`)
 */
export async function updateNode(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  patch: Partial<BlueprintNode>
): Promise<BlueprintNode | null> {
  return window.electron.invoke(
    'blueprint:node:update',
    cwd,
    blueprintId,
    nodeId,
    patch
  ) as Promise<BlueprintNode | null>
}

/**
 * 删除节点。
 * @main `blueprint:node:delete` handler(`_e, cwd, blueprintId, nodeId`)
 */
export async function deleteNode(
  cwd: string,
  blueprintId: string,
  nodeId: string
): Promise<boolean> {
  return window.electron.invoke(
    'blueprint:node:delete',
    cwd,
    blueprintId,
    nodeId
  ) as Promise<boolean>
}

/* ════════════════════════════════════════════════════════════
   节点协作会话 / 终端绑定（main §6.4）
   ════════════════════════════════════════════════════════════ */

/**
 * 激活节点协作会话：设为当前 workspace 焦点并调度后台补漏分析。
 * 不创建终端，不注入上下文。
 * @main `janus:node:focus` handler(`_e, cwd, nodeId`)
 */
export async function focusNode(payload: FocusNodePayload): Promise<BlueprintNode | null> {
  return window.electron.invoke(
    'janus:node:focus',
    payload.workspacePath,
    payload.nodeId
  ) as Promise<BlueprintNode | null>
}

/**
 * 绑定 terminalId 到节点（用户显式进入终端入口）。
 * @main `janus:terminal:bind` handler(`_e, cwd, nodeId, terminalId`)
 */
export async function bindTerminal(
  cwd: string,
  nodeId: string,
  terminalId: string
): Promise<BlueprintNode | null> {
  return window.electron.invoke(
    'janus:terminal:bind',
    cwd,
    nodeId,
    terminalId
  ) as Promise<BlueprintNode | null>
}

/* ════════════════════════════════════════════════════════════
   分析器：手动触发 + 接受新需求（入口③ / §5.5 闭环）
   ════════════════════════════════════════════════════════════ */

/**
 * 手动触发节点分析，IPC 直接 await 返回分析结果（入口③）。
 * @main `janus:analyzer:analyze` handler(`_e, payload`)
 */
export async function analyze(
  payload: AnalyzerAnalyzePayload
): Promise<BlueprintAnalysis | null> {
  return window.electron.invoke('janus:analyzer:analyze', payload) as Promise<
    BlueprintAnalysis | null
  >
}

/**
 * 接受 LLM 提议的新需求，在解析出的父节点下建子节点。
 * @main `janus:analyzer:accept-discovered` handler(`_e, payload`)
 */
export async function acceptDiscovered(
  payload: AcceptDiscoveredPayload
): Promise<BlueprintNode | null> {
  return window.electron.invoke(
    'janus:analyzer:accept-discovered',
    payload
  ) as Promise<BlueprintNode | null>
}

export async function listAnalyses(payload: AnalysisHistoryPayload): Promise<BlueprintAnalysis[]> {
  return window.electron.invoke('janus:analysis:list', payload) as Promise<BlueprintAnalysis[]>
}

export async function applyAnalysis(payload: ApplyAnalysisPayload): Promise<BlueprintNode | null> {
  return window.electron.invoke('janus:analysis:apply', payload) as Promise<BlueprintNode | null>
}

export async function listRequirementCandidates(
  payload: ListCandidatesPayload
): Promise<BlueprintRequirementCandidate[]> {
  return window.electron.invoke('janus:requirements:list-candidates', payload) as Promise<
    BlueprintRequirementCandidate[]
  >
}

export async function acceptRequirementCandidate(
  payload: AcceptCandidatePayload
): Promise<BlueprintNode | null> {
  return window.electron.invoke('janus:requirements:accept-candidate', payload) as Promise<BlueprintNode | null>
}

export async function rejectRequirementCandidate(
  payload: RejectCandidatePayload
): Promise<BlueprintRequirementCandidate | null> {
  return window.electron.invoke('janus:requirements:reject-candidate', payload) as Promise<
    BlueprintRequirementCandidate | null
  >
}

/* ════════════════════════════════════════════════════════════
   Island 事件订阅（主进程 -> 渲染侧单向通知）
   ════════════════════════════════════════════════════════════ */

/**
 * 订阅分析完成事件（Island 提示更新）。
 * @main `janus:island:analysis` — analyzer.emitAnalysis 发送。
 * @returns unsubscribe 函数。
 */
export function onAnalysisResult(cb: (event: IslandAnalysisEvent) => void): () => void {
  return window.electron.on('janus:island:analysis', (payload: unknown) => {
    cb(payload as IslandAnalysisEvent)
  })
}

/**
 * 订阅「发现新需求」事件（Island 弹出确认入口）。
 * @main `janus:island:discovered` — analyzer.emitDiscovered 发送。
 * @returns unsubscribe 函数。
 */
export function onDiscovered(cb: (event: IslandDiscoveredEvent) => void): () => void {
  return window.electron.on('janus:island:discovered', (payload: unknown) => {
    cb(payload as IslandDiscoveredEvent)
  })
}

/* ════════════════════════════════════════════════════════════
   类型复用说明
   ════════════════════════════════════════════════════════════
   `src/main/janus/types.ts` 仅含 type/interface/const，无任何 Node / Electron
   运行时引用，可被渲染层安全 `import type`。本文件采用相对路径
   `../../../main/janus/types` 引用（@/* 别名只覆盖 src/renderer/src/*，无法跨入 main）。
   未抽 shared 文件以避免扩大 P1 改动范围；如后续 main 类型引入运行时依赖，
   再抽取到 src/shared/janus/types.ts 供两边引用。
   ════════════════════════════════════════════════════════════ */
