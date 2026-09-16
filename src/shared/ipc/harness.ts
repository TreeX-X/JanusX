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
} as const

export const HARNESS_EVENT_CHANNELS = {
  changed: 'harness:changed',
} as const

/** Coded failure envelope. IPC transports plain data, never Error instances. */
export interface HarnessFailure {
  code: 'HARNESS_CONFLICT' | 'HARNESS_MANAGED' | 'HARNESS_READONLY' | 'NOT_FOUND' | 'SCHEMA_INVALID' | 'CONFLICT' | 'RECOVERY_REQUIRED' | 'APPROVAL_REQUIRED' | 'PERMISSION_DENIED' | 'IO_ERROR'
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

export interface HarnessAPI {
  resolve(cwd: string): Promise<HarnessResolveResult>
  projectGraph(cwd: string): Promise<HarnessGraphResult | null>
  rescan(cwd: string): Promise<{ rev: number; ms: number }>
  apply(cwd: string, operations: HarnessEditOp[], reason: string): Promise<HarnessApplyResult>
  getBindings(cwd: string): Promise<HarnessBinding[]>
  setBinding(cwd: string, binding: HarnessBinding): Promise<HarnessBinding[]>
  sharePreview(cwd: string, selection: HarnessShareSelection): Promise<{ notes: number; json: string }>
  shareExport(cwd: string, selection: HarnessShareSelection, outPath: string): Promise<{ outPath: string; notes: number }>
  onChanged(callback: (event: HarnessChangedEvent) => void): () => void
}
