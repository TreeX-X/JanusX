import type { Blueprint } from '../janus/types'

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
}

export interface HarnessRunCloseoutResult {
  satisfied: boolean
  detail: string
}

export interface HarnessAPI {
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
  onChanged(callback: (event: HarnessChangedEvent) => void): () => void
}
