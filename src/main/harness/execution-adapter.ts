// Note: JanusX task execution lands on the shared dispatch kernel here — see .agents/notes/implemented/architecture/2026-09-18-harness-execution-adapter-s8.md
/**
 * @file Harness execution adapter (S8-JanusX)
 * @description JanusX-side entry to the shared run lifecycle: prepare and start
 *  recompute the C3 baseline from note files so desktop runs pin the same
 *  contract the terminal kernel pins; verify/record/finish/repair/pause/
 *  resume/cancel/takeover/rebaseline/mark/closeout/handoff are thin,
 *  root-first wrappers over `@janus-agent/janus-agent` with JanusX-owned
 *  checkout resolution left to callers. The adapter never runs models,
 *  shells, or builds: hashing and Git stay with harness-node, execution with
 *  the caller, review verdicts with the reviewer. Every contract violation
 *  returns diagnostics; only run-store IO failures surface as IO_ERROR.
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
import { collectTaskBaseline } from '@janus-agent/harness-node'
import { type BaselineInput, type Diagnostic, type Receipt } from '@janus-agent/harness-core'

// Note: hosts share snapshot and task execution policy - see .agents/notes/implemented/architecture/2026-09-18-harness-execution-adapter-s8.md
export { collectLiveSnapshot } from '@janus-agent/harness-node'
export { prepareTaskTurn as prepareTaskExecutionTurn, verifyTaskExecution as executeTaskVerification } from '@janus-agent/janus-agent'
export type { TaskTurnContext, TaskVerificationPorts } from '@janus-agent/janus-agent'

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
