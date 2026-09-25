// Note: JanusX task execution lands on the neutral run kernel here — see .agents/notes/2026-09-18-desktop-xdo-executor--b057b3f0.md
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
  maybeAutoRepair,
  pauseRun,
  rebaselineRun,
  recordReceipt,
  repairRun,
  resumeRun,
  startRun,
  takeoverRun,
  verifyRun,
  type AutoRepairOutcome,
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
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureTaskThread, loadTaskThread } from './task-thread'
import { removeTaskTranscript } from './task-transcript'

// Note: desktop and terminal read the same portable proof - see .agents/notes/2026-09-18-harness-portable-results--11d8826d.md
function resultState(result: TaskResult, run?: HarnessRun): HarnessRunState {
  const execution = result.execution!
  return { runId: run?.runId ?? result.taskUri, taskUri: result.taskUri, mode: execution.mode, state: execution.state,
    attempt: execution.attempt, executor: run?.executor ?? 'unknown', closeout: execution.closeout,
    receipts: execution.receipts.length, updatedAt: run?.updatedAt ?? '', local: Boolean(run), validity: result.validity,
    repairBudget: run ? { maxAuto: run.repairBudget.maxAuto, usedAuto: run.repairBudget.usedAuto } : { maxAuto: 1, usedAuto: 0 } }
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

/** Spends the automatic repair budget when the live attempt failed checks. */
export async function maybeAutoRepairTaskRun(
  root: string,
  runId: string,
  token: string,
): Promise<OpResult<AutoRepairOutcome>> {
  return maybeAutoRepair(root, runId, token)
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

export interface TaskThreadView {
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

export interface TaskThreadDetail extends TaskThreadView {
  model?: { providerId: string; modelId: string }
  reviewerModel?: { providerId: string; modelId: string }
  reviewer?: string
  history: Array<{ attempt: number; manifestHash: string; checks: Array<{ id: string; kind: string; status: string }>; reviewVerdict?: string; receiptId?: string; at: string }>
}

/**
 * Aggregates the thread registry from local runs plus thread files. Threads
 * live and die with their run on this checkout: runs without a thread file
 * appear threadless so foreign or older runs stay activatable, and the
 * registry never invents history. Portable-only tasks carry no thread.
 */
export async function listTaskThreads(root: string): Promise<{ threads: TaskThreadView[]; errors: Diagnostic[] }> {
  const listed = await listTaskRuns(root)
  if (listed.errors.length > 0) return { threads: [], errors: listed.errors }
  const threads: TaskThreadView[] = []
  for (const run of listed.runs) {
    let stored: Awaited<ReturnType<typeof loadTaskThread>> = null
    try {
      stored = await loadTaskThread(root, run.runId)
    } catch {
      stored = null
    }
    const attempts = stored?.attempts ?? []
    threads.push({
      runId: run.runId,
      taskUri: run.taskUri,
      mode: run.mode,
      state: run.state,
      attempt: run.attempt,
      receipts: run.receipts.length,
      updatedAt: run.updatedAt,
      hasThread: stored !== null,
      attempts: attempts.length,
      ...(attempts.length > 0 && attempts[attempts.length - 1]?.reviewVerdict ? { lastVerdict: attempts[attempts.length - 1]?.reviewVerdict as string } : {}),
      hasModel: Boolean(stored?.model),
    })
  }
  return { threads, errors: [] }
}

/**
 * Opens a thread for activation, creating it on first touch. Activation
 * reattaches history and the model endpoint; it never re-reads the world.
 */
export async function openTaskThread(root: string, runId: string): Promise<OpResult<TaskThreadDetail>> {
  const loaded = await (async () => {
    try {
      return { run: await loadRun(root, runId), errors: [] as Diagnostic[] }
    } catch (error) {
      return { run: null, errors: [diag('IO_ERROR', `cannot load run ${runId}: ${(error as Error).message}`)] }
    }
  })()
  if (!loaded.run) return { ok: false, run: null, errors: loaded.errors, data: { runId, taskUri: '', mode: '', state: '', attempt: 0, receipts: 0, updatedAt: '', hasThread: false, attempts: 0, hasModel: false, history: [] } }
  let stored: Awaited<ReturnType<typeof ensureTaskThread>>
  try {
    stored = await ensureTaskThread(root, { runId, taskUri: loaded.run.taskUri, mode: loaded.run.mode })
  } catch (error) {
    return { ok: false, run: loaded.run, errors: [diag('IO_ERROR', error instanceof Error ? error.message : String(error))], data: { runId, taskUri: loaded.run.taskUri, mode: loaded.run.mode, state: loaded.run.state, attempt: loaded.run.attempt, receipts: loaded.run.receipts.length, updatedAt: loaded.run.updatedAt, hasThread: false, attempts: 0, hasModel: false, history: [] } }
  }
  const history = stored.attempts.map((item) => ({
    attempt: item.attempt,
    manifestHash: item.manifestHash,
    checks: item.checks.map((check) => ({ id: check.id, kind: check.kind, status: check.status })),
    ...(item.reviewVerdict ? { reviewVerdict: item.reviewVerdict } : {}),
    ...(item.receiptId ? { receiptId: item.receiptId } : {}),
    at: item.at,
  }))
  return {
    ok: true,
    run: loaded.run,
    errors: [],
    data: {
      runId,
      taskUri: loaded.run.taskUri,
      mode: loaded.run.mode,
      state: loaded.run.state,
      attempt: loaded.run.attempt,
      receipts: loaded.run.receipts.length,
      updatedAt: loaded.run.updatedAt,
      hasThread: true,
      attempts: history.length,
      ...(history.length > 0 && history[history.length - 1]?.reviewVerdict ? { lastVerdict: history[history.length - 1]?.reviewVerdict as string } : {}),
      hasModel: Boolean(stored.model),
      ...(stored.model ? { model: { ...stored.model } } : {}),
      ...(stored.reviewerModel ? { reviewerModel: { ...stored.reviewerModel } } : {}),
      ...(stored.reviewer ? { reviewer: stored.reviewer } : {}),
      history,
    },
  }
}

/**
 * Destroys a thread file, implementation history and briefs after an explicit user decision.
 * Notes, receipts, and run records always survive. Active owned runs refuse:
 * pause, cancel, or finish first so no turn loses its thread mid-flight.
 */
export async function closeTaskThread(root: string, runId: string): Promise<OpResult<{ closed: boolean }>> {
  let run: Awaited<ReturnType<typeof mustLoadRun>>
  try {
    run = await mustLoadRun(root, runId)
  } catch (error) {
    const failure = error as { code?: Diagnostic['code']; message?: string }
    return { ok: false, run: null, errors: [diag(failure.code ?? 'IO_ERROR', failure.message ?? 'load failed')], data: { closed: false } }
  }
  if (run.lease && (run.state === 'running' || run.state === 'verifying')) {
    return { ok: false, run, errors: [diag('BUSY', `run ${runId} is actively owned; pause, cancel, or finish it before closing its thread`, 'state')], data: { closed: false } }
  }
  const stored = await loadTaskThread(root, runId).catch(() => null)
  if (!stored) return { ok: false, run, errors: [diag('NOT_FOUND', `no thread to close for run ${runId}`)], data: { closed: false } }
  try {
    await removeTaskTranscript(root, runId)
    await rm(join(root, '.agents', '.local', 'runs', runId, 'thread.json'), { force: true })
    await rm(join(root, '.agents', '.local', 'runs', runId, 'briefs'), { recursive: true, force: true })
  } catch (error) {
    const failure = error as { code?: Diagnostic['code']; message?: string }
    return { ok: false, run, errors: [diag(failure.code ?? 'IO_ERROR', `cannot close thread for run ${runId}: ${failure.message}`)], data: { closed: false } }
  }
  return { ok: true, run, errors: [], data: { closed: true } }
}

/**
 * Reads a written handoff for display and copy. The path mirrors the
 * kernel's run-store handoff location; the kernel owns the write, this only
 * reads. Missing handoffs refuse instead of inventing content.
 */
export async function readTaskHandoff(root: string, runId: string): Promise<OpResult<{ path: string; markdown: string }>> {
  let run: Awaited<ReturnType<typeof mustLoadRun>>
  try {
    run = await mustLoadRun(root, runId)
  } catch (error) {
    const failure = error as { code?: Diagnostic['code']; message?: string }
    return { ok: false, run: null, errors: [diag(failure.code ?? 'IO_ERROR', failure.message ?? 'load failed')], data: { path: '', markdown: '' } }
  }
  const path = join(root, '.agents', '.local', 'runs', runId, 'handoff.md')
  try {
    const markdown = await readFile(path, 'utf8')
    if (!markdown.trim()) return { ok: false, run, errors: [diag('NOT_READY', `handoff is empty for run ${runId}; rewrite it`)], data: { path, markdown: '' } }
    return { ok: true, run, errors: [], data: { path, markdown } }
  } catch {
    return { ok: false, run, errors: [diag('NOT_FOUND', `no handoff written for run ${runId}; write one first`)], data: { path, markdown: '' } }
  }
}

export async function getTaskRun(root: string, runId: string): Promise<{ run: HarnessRun | null; errors: Diagnostic[] }> {
  try {
    return { run: await loadRun(root, runId), errors: [] }
  } catch (error) {
    const failure = error as { code?: Diagnostic['code']; message?: string }
    return { run: null, errors: [diag(failure.code ?? 'IO_ERROR', failure.message ?? `cannot load run ${runId}`)] }
  }
}

export async function listTaskRuns(root: string): Promise<{ runs: HarnessRun[]; errors: Diagnostic[] }> {
  try {
    return { runs: await listRuns(root), errors: [] }
  } catch (error) {
    return { runs: [], errors: [diag('IO_ERROR', `cannot list runs under ${root}: ${(error as Error).message}`)] }
  }
}
