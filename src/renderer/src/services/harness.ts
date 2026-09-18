import type {
  HarnessAPI,
  HarnessApplyResult,
  HarnessBinding,
  HarnessEditOp,
  HarnessGraphResult,
  HarnessResolveResult,
  HarnessRunCloseout,
  HarnessRunCloseoutResult,
  HarnessRunMode,
  HarnessRunPrepared,
  HarnessRunPrepareInput,
  HarnessRunState,
  HarnessShareSelection,
} from '../../../shared/ipc/harness'

export type {
  HarnessApplyResult,
  HarnessBinding,
  HarnessEditOp,
  HarnessGraphResult,
  HarnessResolveResult,
  HarnessRunCloseout,
  HarnessRunCloseoutResult,
  HarnessRunMode,
  HarnessRunPrepared,
  HarnessRunPrepareInput,
  HarnessRunState,
  HarnessShareSelection,
}

export function resolveProject(cwd: string): Promise<HarnessResolveResult> {
  return window.electron.harness.resolve(cwd)
}

export function projectGraph(cwd: string): Promise<HarnessGraphResult | null> {
  return window.electron.harness.projectGraph(cwd)
}

export function rescanProject(cwd: string): Promise<{ rev: number; ms: number }> {
  return window.electron.harness.rescan(cwd)
}

export function applyEdits(cwd: string, operations: HarnessEditOp[], reason: string): Promise<HarnessApplyResult> {
  return window.electron.harness.apply(cwd, operations, reason)
}

export function getBindings(cwd: string): Promise<HarnessBinding[]> {
  return window.electron.harness.getBindings(cwd)
}

export function setBinding(cwd: string, binding: HarnessBinding): Promise<HarnessBinding[]> {
  return window.electron.harness.setBinding(cwd, binding)
}

export function sharePreview(cwd: string, selection: HarnessShareSelection): Promise<{ notes: number; json: string }> {
  return window.electron.harness.sharePreview(cwd, selection)
}

export function shareExport(
  cwd: string,
  selection: HarnessShareSelection,
  outPath: string,
): Promise<{ outPath: string; notes: number }> {
  return window.electron.harness.shareExport(cwd, selection, outPath)
}

export function runPrepare(cwd: string, input: HarnessRunPrepareInput): Promise<HarnessRunPrepared> {
  return window.electron.harness.runPrepare(cwd, input)
}

export function runStart(
  cwd: string,
  runId: string,
  owner: string,
  authorization: { by: string; ref?: string } | null,
): Promise<{ attempt: number }> {
  return window.electron.harness.runStart(cwd, runId, owner, authorization)
}

export function runStatus(cwd: string, runId: string): Promise<HarnessRunState> {
  return window.electron.harness.runStatus(cwd, runId)
}

export function runList(cwd: string): Promise<HarnessRunState[]> {
  return window.electron.harness.runList(cwd)
}

export function runCancel(cwd: string, runId: string): Promise<{ state: string }> {
  return window.electron.harness.runCancel(cwd, runId)
}

export function runCloseout(cwd: string, runId: string): Promise<HarnessRunCloseoutResult> {
  return window.electron.harness.runCloseout(cwd, runId)
}

export function runHandoff(cwd: string, runId: string): Promise<{ path: string }> {
  return window.electron.harness.runHandoff(cwd, runId)
}

export function onHarnessChanged(callback: (event: { root: string; rev: number; kinds: string[] }) => void): () => void {
  return (window.electron.harness as HarnessAPI).onChanged(callback)
}
