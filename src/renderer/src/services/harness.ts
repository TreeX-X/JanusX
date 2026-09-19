import type {
  HarnessAPI,
  HarnessApplyResult,
  HarnessBinding,
  HarnessEditOp,
  HarnessGraphResult,
  HarnessResolveResult,
  HarnessRunCloseout,
  HarnessRunCloseoutResult,
  HarnessRunExecuteInput,
  HarnessRunExecuteResult,
  HarnessRunMode,
  HarnessRunPrepared,
  HarnessRunPrepareInput,
  HarnessRunRepairInput,
  HarnessRunReviewInput,
  HarnessRunReviewResult,
  HarnessRunState,
  HarnessShareImportPreview,
  HarnessShareImportResult,
  HarnessShareSelection,
  HarnessThreadDetail,
  HarnessThreadSummary,
  HarnessUndoPreview,
  HarnessUndoResult,
  HarnessMigrationPreview,
  HarnessMigrationResult,
} from '../../../shared/ipc/harness'

export type {
  HarnessApplyResult,
  HarnessBinding,
  HarnessEditOp,
  HarnessGraphResult,
  HarnessResolveResult,
  HarnessRunCloseout,
  HarnessRunCloseoutResult,
  HarnessRunExecuteInput,
  HarnessRunExecuteResult,
  HarnessRunMode,
  HarnessRunPrepared,
  HarnessRunPrepareInput,
  HarnessRunRepairInput,
  HarnessRunReviewInput,
  HarnessRunReviewResult,
  HarnessRunState,
  HarnessShareImportPreview,
  HarnessShareImportResult,
  HarnessShareSelection,
  HarnessThreadDetail,
  HarnessThreadSummary,
  HarnessUndoPreview,
  HarnessUndoResult,
  HarnessMigrationPreview,
  HarnessMigrationResult,
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

export function shareImportPreview(cwd: string, snapshot: unknown): Promise<HarnessShareImportPreview> {
  return window.electron.harness.shareImportPreview(cwd, snapshot)
}

export function shareImportApply(cwd: string, snapshot: unknown): Promise<HarnessShareImportResult> {
  return window.electron.harness.shareImportApply(cwd, snapshot)
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

export function runHandoffRead(cwd: string, runId: string): Promise<{ path: string; markdown: string }> {
  return window.electron.harness.runHandoffRead(cwd, runId)
}

export function runTakeover(cwd: string, runId: string, newOwner: string, reason: string): Promise<{ state: string }> {
  return window.electron.harness.runTakeover(cwd, runId, newOwner, reason)
}

export function runThreads(cwd: string): Promise<HarnessThreadSummary[]> {
  return window.electron.harness.runThreads(cwd)
}

export function runThread(cwd: string, runId: string): Promise<HarnessThreadDetail> {
  return window.electron.harness.runThread(cwd, runId)
}

export function runThreadClose(cwd: string, runId: string): Promise<{ closed: boolean }> {
  return window.electron.harness.runThreadClose(cwd, runId)
}

export function runReview(cwd: string, input: HarnessRunReviewInput): Promise<HarnessRunReviewResult> {
  return window.electron.harness.runReview(cwd, input)
}

export function runFinish(cwd: string, runId: string): Promise<{ receiptId: string; completed: boolean }> {
  return window.electron.harness.runFinish(cwd, runId)
}

export function runRepair(cwd: string, input: HarnessRunRepairInput): Promise<{ attempt: number; state: string }> {
  return window.electron.harness.runRepair(cwd, input)
}

export function undoPreview(cwd: string, txId?: string): Promise<HarnessUndoPreview> {
  return window.electron.harness.undoPreview(cwd, txId)
}

export function undoApply(cwd: string, txId?: string): Promise<HarnessUndoResult> {
  return window.electron.harness.undoApply(cwd, txId)
}

export function migratePreview(cwd: string, blueprintId: string): Promise<HarnessMigrationPreview> {
  return window.electron.harness.migratePreview(cwd, blueprintId)
}

export function migrateApply(cwd: string, blueprintId: string): Promise<HarnessMigrationResult> {
  return window.electron.harness.migrateApply(cwd, blueprintId)
}
export function runExecute(cwd: string, input: HarnessRunExecuteInput): Promise<HarnessRunExecuteResult> {
  return window.electron.harness.runExecute(cwd, input)
}

export function runPause(cwd: string, runId: string): Promise<{ state: string }> {
  return window.electron.harness.runPause(cwd, runId)
}

export function runResume(cwd: string, runId: string): Promise<{ state: string }> {
  return window.electron.harness.runResume(cwd, runId)
}

export function runRebaseline(
  cwd: string,
  runId: string,
  authorization: { by: string; ref?: string } | null,
): Promise<{ state: string }> {
  return window.electron.harness.runRebaseline(cwd, runId, authorization)
}

export function runAbort(cwd: string, runId: string): Promise<{ state: string }> {
  return window.electron.harness.runAbort(cwd, runId)
}

export function onHarnessChanged(callback: (event: { root: string; rev: number; kinds: string[] }) => void): () => void {
  return (window.electron.harness as HarnessAPI).onChanged(callback)
}
