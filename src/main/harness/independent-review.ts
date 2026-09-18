// Note: independent review and limited repair — see .agents/notes/implemented/architecture/2026-09-18-independent-review-repair.md
/**
 * @file Independent review host (S8-JanusX, delegated-review P1).
 * @description Audits pinned evidence through a read-only evaluator turn that
 *  never saw the implementor's working history: only the brief without prior
 *  attempts, the tested manifest, the recorded checks, and the criteria. The
 *  reviewer identity must differ from the run owner; the verdict lands as a
 *  separate immutable receipt plus a thread evaluation beside implementor
 *  attempts. Repairs spend the kernel budget through explicit packets and
 *  finish always re-validates against a live snapshot. No Electron import.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  codeKey,
  codeManifestHash,
  validateReceiptShape,
  type Diagnostic,
  type Receipt,
  type ReceiptCoverage,
} from '@janus-agent/harness-core'
import { collectLiveSnapshot, collectTaskSnapshot } from '@janus-agent/harness-node'
import { finishTaskRun, getTaskRun, recordTaskReceipt } from './execution-adapter'
import { checkCoverageClaims } from './desktop-executor'
import { ensureTaskThread, recordThreadEvaluation } from './task-thread'
import { buildTaskBrief, renderBriefSection, saveBriefCopy, verifyBriefFiles } from './task-brief'
import type { DesktopReviewCriterion } from './desktop-review'

type DesktopRun = NonNullable<Awaited<ReturnType<typeof getTaskRun>>['run']>

export interface IndependentReviewPorts {
  review(
    input: {
      manifest: Receipt['codeManifest']
      manifestHash: string
      checks: Receipt['checks']
      criteria: DesktopReviewCriterion[]
      brief: Parameters<typeof renderBriefSection>[0]
    },
    signal?: AbortSignal,
  ): Promise<{ verdict: 'approved' | 'needs-fix' | 'blocked'; coverage: ReceiptCoverage[] }>
}

export interface IndependentReviewOptions {
  reviewer: string
  receiptId?: string
  signal?: AbortSignal
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

function hostError(error: unknown): Diagnostic[] {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.split(':')[0]?.trim() as Diagnostic['code']
  if (KNOWN_CODES.has(code)) return [diag(code, message)]
  return [diag('IO_ERROR', `independent review failed: ${message}`)]
}

function sameInputs(a: Array<{ uri: string; contentHash: string; criteria?: string[] }>, b: Array<{ uri: string; contentHash: string; criteria?: string[] }>): boolean {
  const key = (row: { uri: string; contentHash: string; criteria?: string[] }): string =>
    `${row.uri}${row.contentHash}${[...(row.criteria ?? [])].sort().join(',')}`
  const left = a.map(key).sort()
  const right = b.map(key).sort()
  return left.length === right.length && left.every((value, index) => value === right[index])
}

async function loadPriorReceipt(root: string, taskUri: string, receiptId: string): Promise<Receipt> {
  let raw: string
  try {
    raw = await readFile(join(root, '.agents', 'evidence', `${receiptId}.json`), 'utf8')
  } catch {
    throw new Error(`NOT_FOUND: recorded receipt is missing: ${receiptId}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`SCHEMA_INVALID: recorded receipt does not parse: ${receiptId}`)
  }
  const shape = validateReceiptShape(parsed)
  if (shape.length > 0) throw new Error(`SCHEMA_INVALID: recorded receipt is malformed: ${shape[0]?.message ?? receiptId}`)
  const receipt = parsed as Receipt
  if (receipt.id !== receiptId) throw new Error(`SCHEMA_INVALID: receipt file mismatches its id: ${receiptId}`)
  if (receipt.taskUri !== undefined && receipt.taskUri !== taskUri) {
    throw new Error(`SCHEMA_INVALID: receipt targets another task: ${receiptId}`)
  }
  return receipt
}

/**
 * Audits the pinned checks of a verifying run through an independent turn
 * and records the verdict as its own receipt. The evaluator inherits no
 * implementor history: its brief carries an empty prior.
 */
export async function requestIndependentReview(
  root: string,
  runId: string,
  token: string,
  ports: IndependentReviewPorts,
  opts: IndependentReviewOptions,
): Promise<OpResult<{ receiptId: string; verdict: 'approved' | 'needs-fix' | 'blocked' }>> {
  const fail = <T>(run: DesktopRun | null, errors: Diagnostic[], data: T): OpResult<T> => ({ ok: false, run, errors, data })
  let loaded: Awaited<ReturnType<typeof getTaskRun>>
  try {
    loaded = await getTaskRun(root, runId)
  } catch (error) {
    return fail(null, hostError(error), { receiptId: '', verdict: 'blocked' as const })
  }
  const run = loaded.run
  if (!run) return fail(null, loaded.errors, { receiptId: '', verdict: 'blocked' as const })
  if (run.state !== 'verifying') {
    return fail(run, [diag('NOT_READY', `independent review audits a verifying run (now ${run.state}); verify the pinned manifest first`, 'state')], { receiptId: '', verdict: 'blocked' as const })
  }
  const implementor = run.lease?.owner
  if (!implementor) return fail(run, [diag('BUSY', 'run has no owner lease; start it before review', 'lease')], { receiptId: '', verdict: 'blocked' as const })
  const reviewer = opts.reviewer.trim()
  if (!reviewer) return fail(run, [diag('SCHEMA_INVALID', 'independent review needs a reviewer identity distinct from the implementor', 'review.actor')], { receiptId: '', verdict: 'blocked' as const })
  if (reviewer === implementor) {
    return fail(run, [diag('SCHEMA_INVALID', 'independent reviewer must differ from the implementor; self-review already covers own work', 'review.actor')], { receiptId: '', verdict: 'blocked' as const })
  }
  const priorId = opts.receiptId ?? run.receipts[run.receipts.length - 1]
  if (!priorId) return fail(run, [diag('NOT_READY', 'no recorded checks to audit; run the declared verification first', 'receipts')], { receiptId: '', verdict: 'blocked' as const })
  const pinned = run.verification?.codeManifest
  if (!pinned) return fail(run, [diag('NOT_READY', 'no pinned manifest on this run; verify before review', 'codeManifest')], { receiptId: '', verdict: 'blocked' as const })
  let prior: Receipt
  try {
    prior = await loadPriorReceipt(root, run.taskUri, priorId)
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', verdict: 'blocked' as const })
  }
  if (prior.attempt !== run.attempt) {
    return fail(run, [diag('STALE_BASELINE', `receipt ${priorId} belongs to attempt ${prior.attempt}, run is at ${run.attempt}; re-run explicitly`, 'receipts')], { receiptId: '', verdict: 'blocked' as const })
  }
  if (codeManifestHash(prior.codeManifest) !== codeManifestHash(pinned)) {
    return fail(run, [diag('STALE_BASELINE', `receipt ${priorId} pins different files than the verified manifest`, 'codeManifest')], { receiptId: '', verdict: 'blocked' as const })
  }
  let snapshot: Awaited<ReturnType<typeof collectTaskSnapshot>>
  try {
    snapshot = await collectTaskSnapshot(root, run.taskUri)
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', verdict: 'blocked' as const })
  }
  if (!snapshot.ok) return fail(run, snapshot.errors, { receiptId: '', verdict: 'blocked' as const })
  if (snapshot.baseline.taskContractHash !== run.baseline.taskContractHash || !sameInputs(snapshot.baseline.inputs, run.baseline.inputs)) {
    return fail(run, [diag('STALE_BASELINE', 'task contract or inputs moved; pause and rebaseline explicitly', 'baseline')], { receiptId: '', verdict: 'blocked' as const })
  }
  const manifestHash = codeManifestHash(pinned)
  const criteria: DesktopReviewCriterion[] = snapshot.work.acceptanceRefs.map((ref) => ({
    uri: ref.uri,
    criterionId: ref.criterionId,
    criterionHash: (snapshot.criterionHashes.find(([uri]) => uri === ref.uri)?.[1].find(([id]) => id === ref.criterionId)?.[1] ?? '') as string,
  }))
  if (criteria.some((item) => !item.criterionHash)) {
    return fail(run, [diag('NOT_FOUND', 'an acceptance reference resolves to no hashed criterion', 'acceptanceRefs')], { receiptId: '', verdict: 'blocked' as const })
  }
  const brief = buildTaskBrief({
    runId,
    taskUri: run.taskUri,
    attempt: run.attempt,
    goalText: snapshot.notes.find((note) => note.uri === run.taskUri)?.sections.find((section) => section.name === 'Scope')?.text ?? '',
    constraintText: '',
    criteria: criteria.map((item) => ({ uri: item.uri, criterionId: item.criterionId })),
    manifest: pinned,
    history: [],
  })
  const briefProblems = verifyBriefFiles(brief, pinned)
  if (briefProblems.length > 0) return fail(run, briefProblems, { receiptId: '', verdict: 'blocked' as const })
  try {
    await saveBriefCopy(root, runId, `attempt-${run.attempt}-eval`, renderBriefSection(brief))
  } catch {
    // Audit-only; the live brief above is what the review uses.
  }
  let claim: { verdict: 'approved' | 'needs-fix' | 'blocked'; coverage: ReceiptCoverage[] }
  try {
    opts.signal?.throwIfAborted()
    claim = await ports.review({ manifest: pinned, manifestHash, checks: prior.checks, criteria, brief }, opts.signal)
  } catch (error) {
    return fail(run, hostError(error), { receiptId: '', verdict: 'blocked' as const })
  }
  if (claim.verdict !== 'approved' && claim.verdict !== 'needs-fix' && claim.verdict !== 'blocked') {
    return fail(run, [diag('SCHEMA_INVALID', 'independent verdict must be approved, needs-fix, or blocked; refusing completion', 'review.verdict')], { receiptId: '', verdict: 'blocked' as const })
  }
  const criterionMap = new Map(criteria.map((item) => [`${item.uri}#${item.criterionId}`, item.criterionHash]))
  const passed = new Set(prior.checks.filter((check) => check.status === 'passed').map((check) => check.id))
  const coverageProblems = checkCoverageClaims(claim.coverage, criterionMap, passed)
  if (coverageProblems.length > 0) return fail(run, coverageProblems, { receiptId: '', verdict: 'blocked' as const })
  const receipt: Receipt = {
    schema: 'harness-receipt/1', id: randomUUID(), taskUri: run.taskUri, mode: run.mode, attempt: run.attempt,
    taskContractHash: run.baseline.taskContractHash, inputs: run.baseline.inputs, codeManifest: pinned,
    checks: prior.checks, coverage: claim.coverage,
    review: { kind: 'independent', verdict: claim.verdict, reviewedManifestHash: manifestHash, actor: reviewer },
    createdAt: new Date().toISOString(), actor: reviewer,
  }
  const stored = await recordTaskReceipt(root, runId, token, receipt)
  if (!stored.ok) return fail(stored.run ?? run, stored.errors, { receiptId: receipt.id, verdict: claim.verdict })
  try {
    const thread = await ensureTaskThread(root, { runId, taskUri: run.taskUri, mode: run.mode })
    void thread
    await recordThreadEvaluation(root, runId, { attempt: run.attempt, reviewer, verdict: claim.verdict, receiptId: receipt.id })
  } catch {
    // Evaluations are auxiliary; the receipt dwarfs them.
  }
  return { ok: true, run: stored.run ?? run, errors: [], data: { receiptId: receipt.id, verdict: claim.verdict } }
}

/**
 * Finishes a verifying run against its latest receipt and a live snapshot.
 * Used after any review kind when the operator accepts the verdict.
 */
export async function finishWithLatestReceipt(
  root: string,
  runId: string,
  token: string,
): Promise<OpResult<{ receiptId: string; completed: boolean }>> {
  const fail = <T>(run: DesktopRun | null, errors: Diagnostic[], data: T): OpResult<T> => ({ ok: false, run, errors, data })
  let loaded: Awaited<ReturnType<typeof getTaskRun>>
  try {
    loaded = await getTaskRun(root, runId)
  } catch (error) {
    return fail(null, hostError(error), { receiptId: '', completed: false })
  }
  const run = loaded.run
  if (!run) return fail(null, loaded.errors, { receiptId: '', completed: false })
  if (run.state !== 'verifying') {
    return fail(run, [diag('NOT_READY', `finish runs from verifying (now ${run.state})`, 'state')], { receiptId: '', completed: false })
  }
  const receiptId = run.receipts[run.receipts.length - 1]
  if (!receiptId) return fail(run, [diag('NOT_READY', 'no receipt recorded; review before finishing', 'receipts')], { receiptId: '', completed: false })
  const manifest = run.verification?.codeManifest
  if (!manifest) return fail(run, [diag('NOT_READY', 'no pinned manifest on this run', 'codeManifest')], { receiptId, completed: false })
  const implementor = run.lease?.owner ?? 'desktop'
  let live: Awaited<ReturnType<typeof collectLiveSnapshot>>
  try {
    live = await collectLiveSnapshot(root, run.taskUri, implementor, manifest.map((row) => [codeKey(row.repoId, row.path), row.deleted === true ? null : (row.sha256 as string)]))
  } catch (error) {
    return fail(run, hostError(error), { receiptId, completed: false })
  }
  if (!live.ok) return fail(run, live.errors, { receiptId, completed: false })
  const finished = await finishTaskRun(root, runId, token, receiptId, live.live)
  if (!finished.ok) return fail(finished.run ?? run, finished.errors, { receiptId, completed: false })
  return { ok: true, run: finished.run ?? run, errors: [], data: { receiptId, completed: true } }
}
