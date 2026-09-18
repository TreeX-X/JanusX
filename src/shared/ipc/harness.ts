import type { Blueprint } from '../janus/types'
import type { WorkContract } from '@janus-agent/harness-core'

export const HARNESS_COMMAND_CHANNELS = {
  resolve: 'harness:resolve',
  projectGraph: 'harness:project-graph',
  rescan: 'harness:rescan',
  apply: 'harness:apply',
  bindingsGet: 'harness:bindings:get',
  bindingsSet: 'harness:bindings:set',
  sharePreview: 'harness:share:preview',
  shareExport: 'harness:share:export',
  runPrepare: 'harness:run:prepare',
  runStart: 'harness:run:start',
  runStatus: 'harness:run:status',
  runList: 'harness:run:list',
  runCancel: 'harness:run:cancel',
  runCloseout: 'harness:run:closeout',
  runHandoff: 'harness:run:handoff',
  runHandoffRead: 'harness:run:handoff-read',
  runTakeover: 'harness:run:takeover',
  runThreads: 'harness:run:threads',
  runThread: 'harness:run:thread',
  runThreadClose: 'harness:run:thread-close',
  runReview: 'harness:run:review',
  runFinish: 'harness:run:finish',
  runRepair: 'harness:run:repair',
  runExecute: 'harness:run:execute',
  runPause: 'harness:run:pause',
  runResume: 'harness:run:resume',
  runRebaseline: 'harness:run:rebaseline',
  runAbort: 'harness:run:abort',
  taskRead: 'harness:task:read',
  taskAdopt: 'harness:task:adopt',
  undoPreview: 'harness:undo:preview',
  undoApply: 'harness:undo:apply',
  migratePreview: 'harness:migrate:preview',
  migrateApply: 'harness:migrate:apply',
} as const

export const HARNESS_EVENT_CHANNELS = {
  changed: 'harness:changed',
} as const

/** Coded failure envelope. IPC transports plain data, never Error instances. */
export interface HarnessFailure {
  code: 'HARNESS_CONFLICT' | 'HARNESS_MANAGED' | 'HARNESS_READONLY' | 'NOT_FOUND' | 'SCHEMA_INVALID' | 'CONFLICT' | 'RECOVERY_REQUIRED' | 'APPROVAL_REQUIRED' | 'PERMISSION_DENIED' | 'IO_ERROR' | 'NOT_READY' | 'STALE_BASELINE' | 'BUSY' | 'DEPENDENCY_UNSATISFIED' | 'INVALID_RELATION' | 'UNRESOLVED_REFERENCE' | 'CAPABILITY_UNAVAILABLE'
  message: string
  path?: string
  expectedHash?: string
  currentHash?: string
}

export interface HarnessResolveResult {
  ok: boolean
  root?: string
  repoId?: string | null
  repoName?: string
  projectId?: string
  diagnostics: Array<{ code: string; message: string }>
}

export interface HarnessGraphResult {
  blueprint: Blueprint
  rev: number
  repoId: string | null
  repoName: string
  invalid: Array<{ relPath: string; diagnostics: Array<{ code: string; message: string }> }>
}

export type HarnessEditOp =
  | { kind: 'create'; nodeType: 'epic' | 'feature' | 'task' | 'issue'; title: string; parentUri?: string | null }
  | { kind: 'update'; uri: string; expectedHash: string; patch: Record<string, unknown> }
  | { kind: 'rename'; uri: string; expectedHash: string; relativePath: string }
  | { kind: 'reparent'; uri: string; expectedHash: string; parentUri: string | null }
  | { kind: 'archive'; uri: string; expectedHash: string; reason: string }

export interface HarnessApplyResult {
  txId: string
  applied: Array<{ operationId: string; uri: string; relPath?: string }>
}

export interface HarnessBinding {
  repoId: string
  checkoutId: string
  path: string
  selected: boolean
}

export interface HarnessShareSelection {
  ids?: string[]
}

export interface HarnessChangedEvent {
  root: string
  rev: number
  kinds: string[]
}

export type HarnessRunMode = 'xdo' | 'xdel' | 'xflow'
export type HarnessRunCloseout = 'commit-required' | 'working-tree-authorized'

export interface HarnessRunPrepareInput {
  taskUri: string
  mode: HarnessRunMode
  closeout: HarnessRunCloseout
  authorizationRef?: string
  maxAutoRepairs?: number
  executor?: 'internal' | 'external'
}

export interface HarnessRunPrepared {
  runId: string
  taskUri: string
  state: string
  attempt: number
}

export interface HarnessRunState {
  runId: string
  taskUri: string
  mode: string
  state: string
  attempt: number
  executor: string
  closeout: string
  receipts: number
  updatedAt: string
  local?: boolean
  validity?: 'unverified' | 'valid' | 'stale'
  repairBudget: { maxAuto: number; usedAuto: number }
}

export interface HarnessRunCloseoutResult {
  satisfied: boolean
  detail: string
}

export interface HarnessRunManualEvidence {
  stepId: string
  observer: string
  observation: string
}

export interface HarnessRunExecuteInput {
  runId: string
  providerId?: string
  modelId?: string
  manualEvidence?: HarnessRunManualEvidence[]
  timeoutMs?: number
}

export interface HarnessRunExecuteResult {
  receiptId: string
  completed: boolean
  checks: Array<{ id: string; kind: string; status: string; summary: string }>
}

export interface HarnessRunHandoff {
  path: string
  markdown: string
}

export interface HarnessThreadAttempt {
  attempt: number
  manifestHash: string
  checks: Array<{ id: string; kind: string; status: string }>
  reviewVerdict?: string
  receiptId?: string
  at: string
}

export interface HarnessThreadSummary {
  runId: string
  taskUri: string
  mode: string
  state: string
  attempt: number
  receipts: number
  updatedAt: string
  hasThread: boolean
  attempts: number
  lastVerdict?: string
  hasModel: boolean
}

export interface HarnessThreadDetail extends HarnessThreadSummary {
  model?: { providerId: string; modelId: string }
  history: HarnessThreadAttempt[]
}

export interface HarnessRunReviewInput {
  runId: string
  reviewer: string
  providerId?: string
  modelId?: string
  receiptId?: string
}

export interface HarnessRunReviewResult {
  receiptId: string
  verdict: 'approved' | 'needs-fix' | 'blocked'
}

export interface HarnessRunRepairInput {
  runId: string
  summary: string
}

export interface HarnessUndoFile {
  operationId: string
  relPath: string
  status: 'reversible' | 'already-reverted' | 'conflict' | 'unsupported'
  beforeHash: string | null
  afterHash: string | null
}

export interface HarnessUndoPreview {
  txId: string
  changeSetId: string
  revision: number
  files: HarnessUndoFile[]
  reversible: boolean
}

export interface HarnessUndoResult {
  txId: string
  reverted: string[]
}

export interface HarnessMigrationNote {
  nodeId: string
  title: string
  kind: string
  lifecycle: string
  noteId: string
  uri: string
}

export interface HarnessMigrationPreview {
  blueprintId: string
  name: string
  nodeCount: number
  auditCount: number
  appliedAuditCount: number
  notes: HarnessMigrationNote[]
  relationCount: number
  warnings: string[]
  targetRepoId: string
}

export interface HarnessMigrationResult {
  txId: string
  uris: string[]
  reportUri: string
  archivedPath: string
}

export interface HarnessTaskContractInput {
  scope: string
  criteria: Array<{ id: string; text: string }>
  work: WorkContract
}

export interface HarnessTaskDraft {
  uri: string
  hash: string
  lifecycle: string
  repoId: string
  hasExecution: boolean
  contract: HarnessTaskContractInput
}

export interface HarnessAPI {
  taskRead(cwd: string, uri: string): Promise<HarnessTaskDraft>
  taskAdopt(cwd: string, uri: string, expectedHash: string, contract: HarnessTaskContractInput): Promise<HarnessTaskDraft>
  resolve(cwd: string): Promise<HarnessResolveResult>
  projectGraph(cwd: string): Promise<HarnessGraphResult | null>
  rescan(cwd: string): Promise<{ rev: number; ms: number }>
  apply(cwd: string, operations: HarnessEditOp[], reason: string): Promise<HarnessApplyResult>
  getBindings(cwd: string): Promise<HarnessBinding[]>
  setBinding(cwd: string, binding: HarnessBinding): Promise<HarnessBinding[]>
  sharePreview(cwd: string, selection: HarnessShareSelection): Promise<{ notes: number; json: string }>
  shareExport(cwd: string, selection: HarnessShareSelection, outPath: string): Promise<{ outPath: string; notes: number }>
  runPrepare(cwd: string, input: HarnessRunPrepareInput): Promise<HarnessRunPrepared>
  runStart(cwd: string, runId: string, owner: string, authorization: { by: string; ref?: string } | null): Promise<{ attempt: number }>
  runStatus(cwd: string, runId: string): Promise<HarnessRunState>
  runList(cwd: string): Promise<HarnessRunState[]>
  runCancel(cwd: string, runId: string): Promise<{ state: string }>
  runCloseout(cwd: string, runId: string): Promise<HarnessRunCloseoutResult>
  runHandoff(cwd: string, runId: string): Promise<{ path: string }>
  runHandoffRead(cwd: string, runId: string): Promise<HarnessRunHandoff>
  runTakeover(cwd: string, runId: string, newOwner: string, reason: string): Promise<{ state: string }>
  runThreads(cwd: string): Promise<HarnessThreadSummary[]>
  runThread(cwd: string, runId: string): Promise<HarnessThreadDetail>
  runThreadClose(cwd: string, runId: string): Promise<{ closed: boolean }>
  runReview(cwd: string, input: HarnessRunReviewInput): Promise<HarnessRunReviewResult>
  runFinish(cwd: string, runId: string): Promise<{ receiptId: string; completed: boolean }>
  runRepair(cwd: string, input: HarnessRunRepairInput): Promise<{ attempt: number; state: string }>
  undoPreview(cwd: string, txId?: string): Promise<HarnessUndoPreview>
  undoApply(cwd: string, txId?: string): Promise<HarnessUndoResult>
  migratePreview(cwd: string, blueprintId: string): Promise<HarnessMigrationPreview>
  migrateApply(cwd: string, blueprintId: string): Promise<HarnessMigrationResult>
  runExecute(cwd: string, input: HarnessRunExecuteInput): Promise<HarnessRunExecuteResult>
  runPause(cwd: string, runId: string): Promise<{ state: string }>
  runResume(cwd: string, runId: string): Promise<{ state: string }>
  runRebaseline(cwd: string, runId: string, authorization: { by: string; ref?: string } | null): Promise<{ state: string }>
  runAbort(cwd: string, runId: string): Promise<{ state: string }>
  onChanged(callback: (event: HarnessChangedEvent) => void): () => void
}
