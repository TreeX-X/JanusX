// Note: desktop xdo host owns checks and self-review — see .agents/notes/implemented/architecture/2026-09-18-desktop-xdo-executor.md
/**
 * @file Desktop xdo execution host (S8-JanusX).
 * @description Runs an accepted task's declared verification on the desktop:
 *  pins the live snapshot, executes command steps in a validated child
 *  process (never a shell string), collects operator evidence for manual
 *  steps, obtains a read-only self-review claim through an injected port,
 *  and records the immutable receipt before finishing against the neutral
 *  run kernel. State transitions ride `execution-adapter` (neutral kernel);
 *  model turns and command runtimes belong to this host. The CLI
 *  task-execution host is never called: the two hosts are peers sharing
 *  only the contract and the receipt validator.
 *  No Electron import, so unit tests drive real temp checkouts.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { relative, resolve } from 'node:path'
import {
  codeKey,
  codeManifestHash,
  type Diagnostic,
  type Receipt,
  type ReceiptCheck,
  type ReceiptCoverage,
  type VerificationStep,
} from '@janus-agent/harness-core'
import { TaskScope, collectLiveSnapshot, collectTaskSnapshot } from '@janus-agent/harness-node'
import { ensureTaskThread, recordThreadAttempt } from './task-thread'
import {
  finishTaskRun,
  getTaskRun,
  pauseTaskRun,
  recordTaskReceipt,
  verifyTaskRun,
} from './execution-adapter'
import { parseDesktopReviewClaim, type DesktopReviewCriterion } from './desktop-review'

type DesktopRun = NonNullable<Awaited<ReturnType<typeof getTaskRun>>['run']>

export interface DesktopCommandOutcome {
  ok: boolean
  exitCode?: number
  timedOut?: boolean
  summary: string
}

export interface DesktopReviewPortInput {
  manifest: Receipt['codeManifest']
  manifestHash: string
  checks: ReceiptCheck[]
  criteria: DesktopReviewCriterion[]
  history: Array<{ attempt: number; verdict: string; receiptId?: string; failedChecks: string[] }>
}

export interface DesktopExecutorPorts {
  command(step: VerificationStep, signal?: AbortSignal): Promise<DesktopCommandOutcome>
  review(input: DesktopReviewPortInput, signal?: AbortSignal): Promise<{ verdict: 'approved' | 'needs-fix' | 'blocked'; coverage: ReceiptCoverage[] }>
}

export interface DesktopManualEvidence {
  stepId: string
  observer: string
  observation: string
}

export interface DesktopExecuteOptions {
  implementor?: string
  timeoutMs?: number
  manualEvidence?: DesktopManualEvidence[]
  signal?: AbortSignal
}

export interface DesktopExecuteResult {
  receiptId: string
  completed: boolean
  checks: ReceiptCheck[]
}

interface OpResult<T> {
  ok: boolean
  run: DesktopRun | null
  errors: Diagnostic[]
  data: T
}

const KNOWN_CODES = new Set(['NOT_FOUND', 'SCHEMA_INVALID', 'CONFLICT', 'NOT_READY', 'STALE_BASELINE', 'DEPENDENCY_UNSATISFIED', 'APPROVAL_REQUIRED', 'PERMISSION_DENIED', 'BUSY', 'RECOVERY_REQUIRED', 'INVALID_RELATION', 'UNRESOLVED_REFERENCE', 'CAPABILITY_UNAVAILABLE'])

function diag(code: Diagnostic['code'], message: string, path?: string): Diagnostic {
  return path === undefined ? { code, message } : { code, message, path }
}

/** Host-thrown `CODE: message` errors become diagnostics; anything else is IO. */
function hostError(error: unknown): Diagnostic[] {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.split(':')[0]?.trim() as Diagnostic['code']
  if (KNOWN_CODES.has(code)) return [diag(code, message)]
  return [diag('IO_ERROR', `desktop executor failed: ${message}`)]
}

function sameInputs(a: Array<{ uri: string; contentHash: string; criteria?: string[] }>, b: Array<{ uri: string; contentHash: string; criteria?: string[] }>): boolean {
  const key = (row: { uri: string; contentHash: string; criteria?: string[] }): string =>
    `${row.uri}${row.contentHash}${[...(row.criteria ?? [])].sort().join(',')}`
  const left = a.map(key).sort()
  const right = b.map(key).sort()
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const SUMMARY_LIMIT = 4000

function summarizeCommand(step: VerificationStep, outcome: DesktopCommandOutcome): string {
  const head = outcome.timedOut
    ? `command timed out`
    : `exit ${outcome.exitCode ?? 'unknown'}`
  const body = (outcome.summary || 'Command produced no output').slice(0, SUMMARY_LIMIT)
  return `${step.program} ${(step.args ?? []).join(' ')} (cwd ${step.cwd}) :: ${head}\n${body}`
}

/**
 * Executes one declared command step without a shell. The program and args
 * travel as an array, the cwd must resolve inside the checkout, and output
 * is truncated. Declared commands are trusted workspace code under runtime
 * policy, not an operating-system sandbox.
 */
export function runDesktopCommand(
  root: string,
  step: VerificationStep,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopCommandOutcome> {
  if (step.kind !== 'command' || typeof step.program !== 'string' || !step.program) {
    return Promise.resolve({ ok: false, summary: `verification step ${step.id} has no executable program` })
  }
  if (!Array.isArray(step.args) || step.args.some((arg) => typeof arg !== 'string')) {
    return Promise.resolve({ ok: false, summary: `verification step ${step.id} needs a string args array` })
  }
  const cwd = resolve(root, step.cwd || '.')
  const outside = relative(root, cwd)
  if (outside === '..' || outside.startsWith(`..${'/'}`) || outside.startsWith('..\\') || (cwd !== root && !cwd.startsWith(root.endsWith('/') || root.endsWith('\\') ? root : `${root}/`) && !cwd.startsWith(`${root}\\`))) {
    return Promise.resolve({ ok: false, summary: `verification cwd escapes the checkout: ${step.cwd}` })
  }
  const timeoutMs = opts?.timeoutMs ?? 120_000
  return new Promise<DesktopCommandOutcome>((promiseResolve) => {
    const child = spawn(step.program as string, (step.args ?? []) as string[], { cwd, shell: false, windowsHide: true, timeout: timeoutMs, signal: opts?.signal })
    let output = ''
    const append = (chunk: Buffer | string): void => {
      output += chunk.toString('utf8')
      if (output.length > SUMMARY_LIMIT) output = output.slice(-SUMMARY_LIMIT)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.on('error', (error: Error) => {
      promiseResolve({ ok: false, summary: `command failed to start: ${error.message}` })
    })
    child.on('close', (code: number | null, signalName: NodeJS.Signals | null) => {
      const timedOut = signalName === 'SIGTERM' && (opts?.signal?.aborted ?? false) === false && code === null
      const aborted = opts?.signal?.aborted ?? false
      promiseResolve({
        ok: aborted === false && timedOut === false && code === 0,
        ...(code === null ? {} : { exitCode: code }),
        ...(timedOut || aborted ? { timedOut: true } : {}),
        summary: output || 'Command produced no output',
      })
    })
  })
}

function checkCoverageClaims(
  claims: ReceiptCoverage[],
  criteria: Map<string, string>,
  passed: Set<string>,
): Diagnostic[] {
  const seen = new Set<string>()
  for (let i = 0; i < claims.length; i += 1) {
    const claim = claims[i] as ReceiptCoverage
    const key = `${claim.uri}#${claim.criterionId}`
    if (!criteria.has(key)) return [diag('UNRESOLVED_REFERENCE', `self-review covers an unknown criterion: ${key}`, `review.coverage[${i}]`)]
    if (seen.has(key)) return [diag('SCHEMA_INVALID', `self-review covers ${key} twice`, `review.coverage[${i}]`)]
    seen.add(key)
    if (claim.criterionHash !== criteria.get(key)) {
      return [diag('STALE_BASELINE', `criterion ${key} moved during verification; re-run explicitly`, `review.coverage[${i}].criterionHash`)]
    }
    for (const checkId of claim.checkIds) {
      if (!passed.has(checkId)) {
        return [diag('NOT_READY', `criterion ${key} cites check ${checkId} that did not pass; partial evidence never composes a pass`, `review.coverage[${i}].checkIds`)]
      }
    }
  }
  return []
}

/**
 * Executes the pinned xdo run to a receipt: verify, checks, self-review,
 * record, finish. Failures record immutable receipts where one exists;
 * malformed review output records nothing and never completes.
 */
export async function executeDesktopXdo(
  root: string,
  runId: string,
  token: string,
  ports: DesktopExecutorPorts,
  opts?: DesktopExecuteOptions,
): Promise<OpResult<DesktopExecuteResult>> {
  const fail = <T>(run: DesktopRun | null, errors: Diagnostic[], data: T): OpResult<T> => ({ ok: false, run, errors, data })
  let loaded: Awaited<ReturnType<typeof getTaskRun>>
  try {
    loaded = await getTaskRun(root, runId)
  } catch (error) {
    return fail(null, hostError(error), { receiptId: '', completed: false, checks: [] })
  }
  const run = loaded.run
  if (!run) return fail(null, loaded.errors, { receiptId: '', completed: false, checks: [] })
  if (run.mode !== 'xdo') {
    return fail(run, [diag('CAPABILITY_UNAVAILABLE', `desktop host executes xdo only (run is ${run.mode}); delegated modes need their own host`, 'mode')], { receiptId: '', completed: false, checks: [] })
  }
  if (run.executor !== 'internal') {
    return fail(run, [diag('CAPABILITY_UNAVAILABLE', 'external runs finish through their own host and handoff', 'executor')], { receiptId: '', completed: false, checks: [] })
  }
  if (run.state !== 'running' && run.state !== 'verifying') {
    return fail(run, [diag('NOT_READY', `execute runs from running (now ${run.state}); start the queued run first`, 'state')], { receiptId: '', completed: false, checks: [] })
  }
  // The thread persists across attempts on the same run: repairs reattach to
  // it instead of re-reading the world. The run record stays the truth.
  let thread: Awaited<ReturnType<typeof ensureTaskThread>>
  try {
    thread = await ensureTaskThread(root, { runId, taskUri: run.taskUri, mode: run.mode })
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', completed: false, checks: [] })
  }
  const history = thread.attempts.slice(-3).map((item) => ({
    attempt: item.attempt,
    verdict: item.reviewVerdict ?? 'unreviewed',
    ...(item.receiptId ? { receiptId: item.receiptId } : {}),
    failedChecks: item.checks.filter((check) => check.status !== 'passed').map((check) => check.id),
  }))
  const noteAttempt = async (extra: { reviewVerdict?: 'approved' | 'needs-fix' | 'blocked'; receiptId?: string; checks: ReceiptCheck[] }): Promise<void> => {
    try {
      thread = await recordThreadAttempt(root, runId, {
        attempt: run.attempt,
        manifestHash,
        checks: extra.checks.map((check) => ({ id: check.id, kind: check.kind, status: check.status })),
        ...(extra.reviewVerdict ? { reviewVerdict: extra.reviewVerdict } : {}),
        ...(extra.receiptId ? { receiptId: extra.receiptId } : {}),
      })
    } catch {
      // Thread history is auxiliary; the receipt dwarfs it. Never fail the run for it.
    }
  }
  const implementor = opts?.implementor ?? run.lease?.owner ?? 'desktop'
  let snapshot: Awaited<ReturnType<typeof collectTaskSnapshot>>
  try {
    snapshot = await collectTaskSnapshot(root, run.taskUri)
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', completed: false, checks: [] })
  }
  if (!snapshot.ok) return fail(run, snapshot.errors, { receiptId: '', completed: false, checks: [] })
  if (snapshot.baseline.taskContractHash !== run.baseline.taskContractHash || !sameInputs(snapshot.baseline.inputs, run.baseline.inputs)) {
    return fail(run, [diag('STALE_BASELINE', 'task contract or inputs moved; pause and rebaseline explicitly', 'baseline')], { receiptId: '', completed: false, checks: [] })
  }
  let scope: TaskScope
  try {
    scope = new TaskScope(root, snapshot.repoId, snapshot.work)
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', completed: false, checks: [] })
  }
  let manifest: Receipt['codeManifest']
  try {
    manifest = await scope.manifest()
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', completed: false, checks: [] })
  }
  const manifestHash = codeManifestHash(manifest)
  if (run.state === 'verifying') {
    const pinned = run.verification?.codeManifest
    if (!pinned || codeManifestHash(pinned) !== manifestHash) {
      return fail(run, [diag('STALE_BASELINE', 'code changed after verification; pause and rebaseline before retrying', 'codeManifest')], { receiptId: '', completed: false, checks: [] })
    }
  } else {
    const verified = await verifyTaskRun(root, runId, token, manifest)
    if (!verified.ok) return fail(verified.run ?? run, verified.errors, { receiptId: '', completed: false, checks: [] })
  }
  const evidence = new Map((opts?.manualEvidence ?? []).map((item) => [item.stepId, item]))
  const checks: ReceiptCheck[] = []
  try {
    for (const step of snapshot.work.verification) {
      opts?.signal?.throwIfAborted()
      if (step.repoId !== snapshot.repoId) {
        return fail(run, [diag('CAPABILITY_UNAVAILABLE', `verification step ${step.id} targets another checkout; split multi-repository work into per-repo tasks`, 'verification')], { receiptId: '', completed: false, checks })
      }
      await scope.checkPath(step.cwd)
      if (step.kind === 'manual') {
        const proof = evidence.get(step.id)
        if (!proof || !proof.observer.trim() || !proof.observation.trim()) {
          return fail(run, [diag('CAPABILITY_UNAVAILABLE', `manual step ${step.id} needs operator evidence (observer plus actual observation); no check is auto-passed`, 'verification')], { receiptId: '', completed: false, checks })
        }
        checks.push({ id: step.id, kind: 'manual', required: step.required, status: 'passed', repoId: step.repoId, summary: proof.observation.slice(0, SUMMARY_LIMIT), performedBy: proof.observer })
        continue
      }
      const outcome = await ports.command(step, opts?.signal)
      checks.push({
        id: step.id, kind: 'command', required: step.required, repoId: step.repoId,
        command: { program: step.program as string, args: (step.args ?? []) as string[], cwd: step.cwd },
        status: outcome.ok && outcome.exitCode === 0 && !outcome.timedOut ? 'passed' : 'failed',
        ...(Number.isInteger(outcome.exitCode) ? { exitCode: outcome.exitCode as number } : {}),
        summary: (outcome.summary || 'Command produced no output').slice(0, SUMMARY_LIMIT),
        performedBy: implementor,
      })
    }
  } catch (error) {
    if (opts?.signal?.aborted) await pauseTaskRun(root, runId, token)
    return fail(run, hostError(error), { receiptId: '', completed: false, checks })
  }
  const criteria: DesktopReviewCriterion[] = snapshot.work.acceptanceRefs.map((ref) => ({
    uri: ref.uri,
    criterionId: ref.criterionId,
    criterionHash: (snapshot.criterionHashes.find(([uri]) => uri === ref.uri)?.[1].find(([id]) => id === ref.criterionId)?.[1] ?? '') as string,
  }))
  if (criteria.some((item) => !item.criterionHash)) {
    return fail(run, [diag('NOT_FOUND', 'an acceptance reference resolves to no hashed criterion; re-adopt the task contract', 'acceptanceRefs')], { receiptId: '', completed: false, checks })
  }
  let claim: { verdict: 'approved' | 'needs-fix' | 'blocked'; coverage: ReceiptCoverage[] }
  try {
    opts?.signal?.throwIfAborted()
    claim = await ports.review({ manifest, manifestHash, checks, criteria, history }, opts?.signal)
  } catch (error) {
    if (opts?.signal?.aborted) await pauseTaskRun(root, runId, token)
    await noteAttempt({ checks })
    return fail(run, hostError(error), { receiptId: '', completed: false, checks })
  }
  if (claim.verdict !== 'approved' && claim.verdict !== 'needs-fix' && claim.verdict !== 'blocked') {
    await noteAttempt({ checks })
    return fail(run, [diag('SCHEMA_INVALID', 'self-review verdict must be approved, needs-fix, or blocked; refusing completion', 'review.verdict')], { receiptId: '', completed: false, checks })
  }
  const criterionMap = new Map(criteria.map((item) => [`${item.uri}#${item.criterionId}`, item.criterionHash]))
  const passed = new Set(checks.filter((check) => check.status === 'passed').map((check) => check.id))
  const coverageProblems = checkCoverageClaims(claim.coverage, criterionMap, passed)
  if (coverageProblems.length > 0) {
    await noteAttempt({ checks })
    return fail(run, coverageProblems, { receiptId: '', completed: false, checks })
  }
  let receipt: Receipt = {
    schema: 'harness-receipt/1', id: randomUUID(), taskUri: run.taskUri, mode: 'xdo', attempt: run.attempt,
    taskContractHash: run.baseline.taskContractHash, inputs: run.baseline.inputs, codeManifest: manifest,
    checks, coverage: claim.coverage,
    review: { kind: 'self', verdict: claim.verdict, reviewedManifestHash: manifestHash, actor: implementor },
    createdAt: new Date().toISOString(), actor: implementor,
  }
  let current: Receipt['codeManifest']
  try {
    current = await scope.manifest()
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', completed: false, checks })
  }
  // Drift during checks or review invalidates the evidence itself, but the
  // blocked receipt still lands as immutable history for the next attempt.
  if (codeManifestHash(current) !== manifestHash) {
    receipt = { ...receipt, review: { ...receipt.review, verdict: 'blocked' } }
    const stored = await recordTaskReceipt(root, runId, token, receipt)
    if (!stored.ok) return fail(stored.run ?? run, stored.errors, { receiptId: receipt.id, completed: false, checks })
    await noteAttempt({ reviewVerdict: 'blocked', receiptId: receipt.id, checks })
    return fail(stored.run ?? run, [diag('STALE_BASELINE', 'scoped code changed during verification or review; the blocked receipt is recorded, fix and re-run', 'codeManifest')], { receiptId: receipt.id, completed: false, checks })
  }
  const stored = await recordTaskReceipt(root, runId, token, receipt)
  if (!stored.ok) return fail(stored.run ?? run, stored.errors, { receiptId: receipt.id, completed: false, checks })
  await noteAttempt({ reviewVerdict: receipt.review.verdict, receiptId: receipt.id, checks })
  let live: Awaited<ReturnType<typeof collectLiveSnapshot>>
  try {
    live = await collectLiveSnapshot(root, run.taskUri, implementor, current.map((row) => [codeKey(row.repoId, row.path), row.deleted === true ? null : (row.sha256 as string)]))
  } catch (error) {
    return fail(stored.run ?? run, hostError(error), { receiptId: receipt.id, completed: false, checks })
  }
  if (!live.ok) return fail(stored.run ?? run, live.errors, { receiptId: receipt.id, completed: false, checks })
  const finished = await finishTaskRun(root, runId, token, receipt.id, live.live)
  if (!finished.ok) return fail(finished.run ?? run, finished.errors, { receiptId: receipt.id, completed: false, checks })
  return { ok: true, run: finished.run ?? run, errors: [], data: { receiptId: receipt.id, completed: true, checks } }
}

/** Validates a raw model review text into a port output. Parse failures refuse; they never approve. */
export function reviewClaimFromText(text: string): { ok: true; claim: { verdict: 'approved' | 'needs-fix' | 'blocked'; coverage: ReceiptCoverage[] } } | { ok: false; errors: Diagnostic[] } {
  const parsed = parseDesktopReviewClaim(text)
  if (!parsed.ok) return { ok: false, errors: parsed.errors as Diagnostic[] }
  return { ok: true, claim: { verdict: parsed.claim.verdict, coverage: parsed.claim.coverage } }
}
