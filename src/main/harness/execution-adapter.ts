// Note: JanusX task execution lands on the neutral run kernel here — see .agents/notes/implemented/architecture/2026-09-18-desktop-xdo-executor.md
/**
 * @file Harness execution adapter (S8-JanusX)
 * @description JanusX-side entry to the neutral run kernel: prepare and start
 *  recompute the C3 baseline from note files so desktop runs pin the same
 *  contract the terminal kernel pins; verify/record/finish/repair/pause/
 *  resume/cancel/takeover/rebaseline/mark/closeout/handoff are thin,
 *  root-first wrappers over the kernel's run lifecycle with JanusX-owned
 *  checkout resolution left to callers. The adapter never runs models,
 *  shells, or builds: hashing and Git stay with harness-node, checks and
 *  self-review stay with the desktop xdo host (`desktop-executor.ts`).
 *  The CLI task-execution host is never re-exported or called here; the two
 *  hosts are peers sharing only the contract and the receipt validator.
 *  No filesystem roots are invented here and no Electron is imported, so unit
 *  tests drive real temp checkouts.
 */
import {
  cancelRun,
  closeoutRun,
  dispatchRun,
  finishRun,
  handoffRun,
  listRuns,
  loadRun,
  markRun,
  pauseRun,
  rebaselineRun,
  recordReceipt,
  repairRun,
  resumeRun,
  startRun,
  takeoverRun,
  verifyRun,
  type CloseoutCheck,
  type CodeRow,
  type HarnessRun,
  type LiveSnapshot,
  type OpResult,
  type RepairPacket,
} from '@janus-agent/janus-agent'
import { collectTaskBaseline, listTaskResults, readTaskResult, type TaskResult } from '@janus-agent/harness-node'
import { type BaselineInput, type Diagnostic, type Receipt } from '@janus-agent/harness-core'
import type { HarnessRunState } from '../../shared/ipc/harness'

// Note: desktop and terminal read the same portable proof - see .agents/notes/implemented/architecture/2026-09-18-harness-portable-results.md
function resultState(result: TaskResult, run?: HarnessRun): HarnessRunState {
  const execution = result.execution!
  return { runId: run?.runId ?? result.taskUri, taskUri: result.taskUri, mode: execution.mode, state: execution.state,
    attempt: execution.attempt, executor: run?.executor ?? 'unknown', closeout: execution.closeout,
    receipts: execution.receipts.length, updatedAt: run?.updatedAt ?? '', local: Boolean(run), validity: result.validity }
}

export async function listTaskRunStates(root: string): Promise<HarnessRunState[]> {
  const results = await listTaskResults(root)
  const runs = await listRuns(root)
  return results.filter((result) => result.execution).map((result) => resultState(result, runs.find((run) => run.taskUri === result.taskUri)))
}

export async function getTaskRunState(root: string, ref: string): Promise<HarnessRunState> {
  const run = ref.startsWith('note://') ? undefined : await loadRun(root, ref)
  const result = await readTaskResult(root, run?.taskUri ?? ref)
  if (!result.execution) throw result.errors[0] ?? { code: 'NOT_READY', message: 'task has no execution' }
  return resultState(result, run)
}

function diag(code: Diagnostic['code'], message: string, path?: string): Diagnostic {
  return path === undefined ? { code, message } : { code, message, path }
}

/** Order-insensitive baseline comparison for start preconditions. */
function sameInputs(a: BaselineInput[], b: BaselineInput[]): boolean {
  if (a.length !== b.length) return false
  const key = (row: BaselineInput): string =>
    `${row.uri}${row.contentHash}${[...(row.criteria ?? [])].sort().join(',')}`
  const left = a.map(key).sort()
  const right = b.map(key).sort()
  return left.every((value, index) => value === right[index])
}

export interface PrepareTaskRunInput {
  /** Note URI, id, or notes-relative path; resolved by the shared baseline. */
  taskRef: string
  mode: 'xdo' | 'xdel' | 'xflow'
  closeout: HarnessRun['closeout']
  authorizationRef?: string
  maxAutoRepairs?: number
  executor?: 'internal' | 'external'
}

/**
 * Pins the C3 baseline from current note files and opens a queued run.
 * Unaccepted tasks, unresolvable relations, and uncovered predecessors
 * refuse with named diagnostics before any run record exists.
 */
export async function prepareTaskRun(
  root: string,
  input: PrepareTaskRunInput,
): Promise<OpResult<{ runId: string }>> {
  const baseline = await collectTaskBaseline(root, input.taskRef)
  if (!baseline.ok) {
    return { ok: false, run: null, errors: baseline.problems, data: { runId: '' } }
  }
  return dispatchRun(root, {
    taskUri: baseline.baseline.taskUri,
    mode: input.mode,
    taskContractHash: baseline.baseline.taskContractHash,
    inputs: baseline.baseline.inputs,
    closeout: input.closeout,
    ...(input.authorizationRef ? { authorizationRef: input.authorizationRef } : {}),
    ...(input.maxAutoRepairs !== undefined ? { maxAutoRepairs: input.maxAutoRepairs } : {}),
    ...(input.executor ? { executor: input.executor } : {}),
  })
}

async function mustLoadRun(root: string, runId: string): Promise<HarnessRun> {
  try {
    return await loadRun(root, runId)
  } catch (error) {
    throw { code: 'IO_ERROR', message: `cannot load run ${runId}: ${(error as Error).message}` }
  }
}

/**
 * Starts a queued run after re-pinning the baseline. A moved contract,
 * moved input, or newly uncovered predecessor fails the start instead of
 * executing against a stale pin; call rebaselineTaskRun explicitly.
 */
export async function startTaskRun(
  root: string,
  runId: string,
  owner: string,
  authorization: { by: string; ref?: string } | null,
): Promise<OpResult<{ attempt: number }>> {
  let run: HarnessRun
  try {
    run = await mustLoadRun(root, runId)
  } catch (error) {
    const failure = error as { code?: Diagnostic['code']; message?: string }
    return { ok: false, run: null, errors: [diag(failure.code ?? 'IO_ERROR', failure.message ?? 'load failed')], data: { attempt: 0 } }
  }
  const fresh = await collectTaskBaseline(root, run.taskUri)
  const baselineValid =
    fresh.ok &&
    fresh.baseline.taskContractHash === run.baseline.taskContractHash &&
    sameInputs(fresh.baseline.inputs, run.baseline.inputs)
  return startRun(root, runId, owner, {
    baselineValid,
    dependenciesReady: fresh.ok,
    authorization,
  })
}

/** Stops code writes for the run and records the tested file manifest. */
export async function verifyTaskRun(
  root: string,
  runId: string,
  token: string,
  codeManifest: CodeRow[],
): Promise<OpResult<undefined>> {
  return verifyRun(root, runId, token, codeManifest)
}

/** Stores one immutable execution receipt on the run. */
export async function recordTaskReceipt(
  root: string,
  runId: string,
  token: string,
  receipt: Receipt,
): Promise<OpResult<{ receiptId: string }>> {
  return recordReceipt(root, runId, token, receipt)
}

/** Completes a verifying run against one stored receipt and a live snapshot. */
export async function finishTaskRun(
  root: string,
  runId: string,
  token: string,
  receiptId: string,
  live: LiveSnapshot,
): Promise<OpResult<{ receiptId: string }>> {
  return finishRun(root, runId, token, receiptId, live)
}

/** Spends repair budget (default one automatic) on the same contract. */
export async function repairTaskRun(
  root: string,
  runId: string,
  token: string,
  packet: RepairPacket,
): Promise<OpResult<{ attempt: number }>> {
  return repairRun(root, runId, token, packet)
}

export async function pauseTaskRun(root: string, runId: string, token: string): Promise<OpResult<undefined>> {
  return pauseRun(root, runId, token)
}

export async function resumeTaskRun(root: string, runId: string, token: string): Promise<OpResult<{ state: string }>> {
  const result = await resumeRun(root, runId, token)
  return { ok: result.ok, run: result.run, errors: result.errors, data: { state: result.data.state } }
}

export async function cancelTaskRun(root: string, runId: string, token: string | null): Promise<OpResult<undefined>> {
  return cancelRun(root, runId, token)
}

export async function takeoverTaskRun(root: string, runId: string, newOwner: string, reason: string): Promise<OpResult<{ token: string }>> {
  return takeoverRun(root, runId, newOwner, reason)
}

/** Re-pins a blocked or paused run onto a fresh baseline; attempt is kept. */
export async function rebaselineTaskRun(
  root: string,
  runId: string,
  token: string,
  taskRef: string,
  authorization: { by: string; ref?: string } | null,
): Promise<OpResult<undefined>> {
  const fresh = await collectTaskBaseline(root, taskRef)
  if (!fresh.ok) {
    return { ok: false, run: null, errors: fresh.problems, data: undefined }
  }
  return rebaselineRun(
    root,
    runId,
    token,
    { taskContractHash: fresh.baseline.taskContractHash, inputs: fresh.baseline.inputs },
    authorization,
  )
}

/** Marks a running or verifying run stale or restarted without guessing success. */
export async function markTaskRun(
  root: string,
  runId: string,
  kind: 'stale' | 'restart',
  summary: string,
): Promise<OpResult<undefined>> {
  return markRun(root, runId, kind, summary)
}

/** Checks the closeout strategy: commit reachability or explicit worktree grant. */
export async function closeoutTaskRun(
  root: string,
  runId: string,
  check: CloseoutCheck,
): Promise<OpResult<{ satisfied: boolean; detail: string }>> {
  if (runId.startsWith('note://')) {
    const result = await readTaskResult(check.repoRoot, runId, { closeout: true })
    if (!result.closeout) return { ok: false, run: null, errors: result.errors.length ? result.errors : [diag('NOT_READY', 'task has no completed result')], data: { satisfied: false, detail: 'unverified task' } }
    return { ok: true, run: null, errors: [], data: result.closeout }
  }
  const report = await closeoutRun(root, runId, check)
  if (!report.ok || !report.run) return report as OpResult<{ satisfied: boolean; detail: string }>
  return {
    ok: report.ok,
    run: report.run,
    errors: report.errors,
    data: { satisfied: report.data.satisfied, detail: report.data.detail },
  }
}

/** Writes the external-runner handoff file for one task URI and baseline. */
export async function handoffTaskRun(root: string, runId: string): Promise<OpResult<{ path: string }>> {
  return handoffRun(root, runId)
}

export async function getTaskRun(root: string, runId: string): Promise<{ run: HarnessRun | null; errors: Diagnostic[] }> {
  try {
    return { run: await loadRun(root, runId), errors: [] }
  } catch (error) {
    return { run: null, errors: [diag('IO_ERROR', `cannot load run ${runId}: ${(error as Error).message}`)] }
  }
}

export async function listTaskRuns(root: string): Promise<{ runs: HarnessRun[]; errors: Diagnostic[] }> {
  try {
    return { runs: await listRuns(root), errors: [] }
  } catch (error) {
    return { runs: [], errors: [diag('IO_ERROR', `cannot list runs under ${root}: ${(error as Error).message}`)] }
  }
}
