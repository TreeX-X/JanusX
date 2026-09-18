// Note: desktop xdo self-review evidence — see .agents/notes/implemented/architecture/2026-09-18-desktop-xdo-executor.md
/**
 * @file Desktop xdo self-review prompt and strict JSON parsing (S8-JanusX host).
 * @description Builds the read-only review prompt from the tested manifest,
 *  executed checks, and acceptance criteria, then parses the model's coverage
 *  claim without ever inventing approval. Malformed or incomplete model output
 *  is a refusal, never a pass. Coverage identity is re-checked by the caller
 *  against the live snapshot; this module only enforces shape.
 *  Electron-free: the model text arrives through an injected function so unit
 *  tests drive refusals without singletons.
 */
import type { Receipt, ReceiptCheck, ReceiptCoverage } from '@janus-agent/harness-core'

export interface DesktopReviewCriterion {
  uri: string
  criterionId: string
  criterionHash: string
}

export interface DesktopReviewPromptInput {
  taskUri: string
  attempt: number
  manifestHash: string
  manifest: Receipt['codeManifest']
  checks: ReceiptCheck[]
  criteria: DesktopReviewCriterion[]
}

export type DesktopReviewVerdict = 'approved' | 'needs-fix' | 'blocked'

export interface DesktopReviewClaim {
  verdict: DesktopReviewVerdict
  coverage: ReceiptCoverage[]
  summary: string
}

function diag(code: 'SCHEMA_INVALID' | 'NOT_READY', message: string, path?: string) {
  return path === undefined ? { code, message } : { code, message, path }
}

/** Read-only review prompt: the model maps executed checks onto criteria. */
export function buildDesktopReviewPrompt(input: DesktopReviewPromptInput): string {
  const manifestLines = input.manifest
    .map((row) => `- ${row.repoId} ${row.path}${row.deleted === true ? ' (deleted)' : ` sha256:${row.sha256}`}`)
    .join('\n')
  const checkLines = input.checks
    .map((check) => `- ${check.id} [${check.kind}/${check.status}]${check.required ? ' required' : ''} repo:${check.repoId}${check.command ? ` ${check.command.program} ${(check.command.args ?? []).join(' ')} (cwd ${check.command.cwd})` : ''} exit:${check.exitCode ?? '-'} :: ${check.summary}`)
    .join('\n')
  const criteriaLines = input.criteria
    .map((item) => `- ${item.uri}#${item.criterionId} hash:${item.criterionHash}`)
    .join('\n')
  return [
    'Task-bound self-review. You did not implement this task; you review the tested manifest below.',
    'Rules: only PASSED checks prove criteria. Every coverage entry must name a criterion from the list with its exact hash and at least one passed check id. If any required check failed, or no passed check demonstrates a criterion, verdict is needs-fix, never approved. Model prose never changes run state.',
    `Task: ${input.taskUri} attempt ${input.attempt}`,
    `Tested manifest sha (canonical, order-independent): ${input.manifestHash}`,
    'Manifest:',
    manifestLines || '(empty manifest)',
    'Checks:',
    checkLines || '(no checks ran)',
    'Acceptance criteria:',
    criteriaLines || '(no criteria)',
    'Reply with exactly one JSON object and no other text: {"verdict":"approved"|"needs-fix"|"blocked","coverage":[{"uri":"...","criterionId":"AC-1","criterionHash":"...","checkIds":["V-1"]}],"summary":"one sentence"}.',
  ].join('\n')
}

/** Extracts the first top-level JSON object from model text. Refuses anything else. */
export function parseDesktopReviewClaim(text: string): { ok: true; claim: DesktopReviewClaim } | { ok: false; errors: Array<{ code: string; message: string; path?: string }> } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return { ok: false, errors: [diag('SCHEMA_INVALID', 'self-review returned no JSON object; refusing approval', 'review')] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { ok: false, errors: [diag('SCHEMA_INVALID', 'self-review JSON does not parse; refusing approval', 'review')] }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [diag('SCHEMA_INVALID', 'self-review must be a JSON object', 'review')] }
  }
  const verdict = (raw as Record<string, unknown>).verdict
  if (verdict !== 'approved' && verdict !== 'needs-fix' && verdict !== 'blocked') {
    return { ok: false, errors: [diag('SCHEMA_INVALID', 'self-review verdict must be approved, needs-fix, or blocked', 'review.verdict')] }
  }
  const coverage = (raw as Record<string, unknown>).coverage
  if (!Array.isArray(coverage)) {
    return { ok: false, errors: [diag('SCHEMA_INVALID', 'self-review coverage must be an array', 'review.coverage')] }
  }
  const claims: ReceiptCoverage[] = []
  for (let i = 0; i < coverage.length; i += 1) {
    const entry = coverage[i] as Record<string, unknown>
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, errors: [diag('SCHEMA_INVALID', `coverage entry ${i} must be an object`, `review.coverage[${i}]`)] }
    }
    const { uri, criterionId, criterionHash, checkIds } = entry
    if (typeof uri !== 'string' || !uri || typeof criterionId !== 'string' || !criterionId || typeof criterionHash !== 'string' || !criterionHash) {
      return { ok: false, errors: [diag('SCHEMA_INVALID', `coverage entry ${i} needs uri, criterionId, and criterionHash`, `review.coverage[${i}]`)] }
    }
    if (!Array.isArray(checkIds) || checkIds.length === 0 || checkIds.some((id) => typeof id !== 'string' || !id)) {
      return { ok: false, errors: [diag('NOT_READY', `coverage entry ${i} needs at least one passed check id; partial evidence never composes a pass`, `review.coverage[${i}].checkIds`)] }
    }
    claims.push({ uri, criterionId, criterionHash, checkIds: [...new Set(checkIds as string[])] })
  }
  const summary = (raw as Record<string, unknown>).summary
  return { ok: true, claim: { verdict, coverage: claims, summary: typeof summary === 'string' ? summary : '' } }
}
