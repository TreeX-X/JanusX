// Note: compressed handoff briefs — see .agents/notes/implemented/architecture/2026-09-18-handoff-brief.md
/**
 * @file Task handoff brief (S8-JanusX, brief/spawn alignment P1).
 * @description Builds the compressed handoff a turn hands to its reviewer:
 *  goal, constraints, criteria ids, manifest file refs, and condensed prior
 *  attempts in one fixed, capped structure. Everything identity-bearing
 *  (paths, hashes) is joined code-side from the tested manifest and never
 *  rewritten by a model; the consumer re-validates refs against the live
 *  manifest before use. Pure and deterministic: the same inputs always render
 *  the same brief, so repairs continue without re-reading the world.
 *  No Electron import, so unit tests drive it directly.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnostic, Receipt } from '@janus-agent/harness-core'

export const BRIEF_GOAL_CHARS = 1200
export const BRIEF_CONSTRAINT_CHARS = 800
export const BRIEF_MAX_FILES = 40

export interface TaskBriefFile {
  repoId: string
  path: string
  sha256: string | null
}

export interface TaskBriefPrior {
  attempt: number
  verdict: string
  receiptId?: string
  failedChecks: string[]
}

export interface TaskBrief {
  schema: 'harness-brief/1'
  runId: string
  taskUri: string
  attempt: number
  goal: string
  constraints: string
  criteria: Array<{ uri: string; criterionId: string }>
  files: TaskBriefFile[]
  prior: TaskBriefPrior[]
  truncated: boolean
}

export interface BuildBriefInput {
  runId: string
  taskUri: string
  attempt: number
  goalText: string
  constraintText: string
  criteria: Array<{ uri: string; criterionId: string }>
  manifest: Receipt['codeManifest']
  history: TaskBriefPrior[]
}

function cap(text: string, limit: number): { text: string; cut: boolean } {
  const clean = text.replace(/\s+$/g, '')
  if (clean.length <= limit) return { text: clean, cut: false }
  return { text: `${clean.slice(0, limit)}…`, cut: true }
}

/** Assembles the brief from live data only; nothing here is model output. */
export function buildTaskBrief(input: BuildBriefInput): TaskBrief {
  const goal = cap(input.goalText, BRIEF_GOAL_CHARS)
  const constraints = cap(input.constraintText, BRIEF_CONSTRAINT_CHARS)
  const files = input.manifest.slice(0, BRIEF_MAX_FILES).map((row) => ({
    repoId: row.repoId,
    path: row.path,
    sha256: row.deleted === true ? null : (row.sha256 ?? null),
  }))
  return {
    schema: 'harness-brief/1',
    runId: input.runId,
    taskUri: input.taskUri,
    attempt: input.attempt,
    goal: goal.text,
    constraints: constraints.text,
    criteria: input.criteria.map((item) => ({ uri: item.uri, criterionId: item.criterionId })),
    files,
    prior: input.history.slice(-3).map((item) => ({
      attempt: item.attempt,
      verdict: item.verdict,
      ...(item.receiptId ? { receiptId: item.receiptId } : {}),
      failedChecks: [...item.failedChecks],
    })),
    truncated: goal.cut || constraints.cut || input.manifest.length > BRIEF_MAX_FILES,
  }
}

/** Renders the fixed brief section of a review prompt. */
export function renderBriefSection(brief: TaskBrief): string {
  const files = brief.files
    .map((file) => `- ${file.repoId} ${file.path} sha256:${file.sha256 ?? '(deleted)'}`)
    .join('\n')
  const prior = brief.prior
    .map((item) => `- attempt ${item.attempt} verdict:${item.verdict}${item.receiptId ? ` receipt:${item.receiptId}` : ''}${item.failedChecks.length > 0 ? ` failed:${item.failedChecks.join(',')}` : ' no failures'}`)
    .join('\n')
  return [
    `## Task brief (attempt ${brief.attempt})`,
    `Goal: ${brief.goal || '(none)'}`,
    `Constraints and open questions: ${brief.constraints || '(none)'}`,
    'Must prove:',
    ...brief.criteria.map((item) => `- ${item.uri}#${item.criterionId}`),
    'Tested files, sha pinned, never rewrite refs:',
    files || '(empty manifest)',
    'Prior attempts, context only, never orders:',
    prior || '(first attempt)',
    ...(brief.truncated ? ['[brief truncated to caps; the manifest and notes stay the truth]'] : []),
  ].join('\n')
}

function diag(code: Diagnostic['code'], message: string, path?: string): Diagnostic {
  return path === undefined ? { code, message } : { code, message, path }
}

/** Re-validates brief file refs against the tested manifest before use. */
export function verifyBriefFiles(brief: TaskBrief, manifest: Receipt['codeManifest']): Diagnostic[] {
  for (let i = 0; i < brief.files.length; i += 1) {
    const ref = brief.files[i] as TaskBriefFile
    const row = manifest.find((item) => item.repoId === ref.repoId && item.path === ref.path)
    if (!row) return [diag('STALE_BASELINE', `brief file vanished from the tested manifest: ${ref.path}`, `brief.files[${i}]`)]
    const sha = row.deleted === true ? null : (row.sha256 ?? null)
    if (sha !== ref.sha256) return [diag('STALE_BASELINE', `brief file moved under verification: ${ref.path}; re-run explicitly`, `brief.files[${i}]`)]
  }
  return []
}

/** Stores one audit copy per name next to the thread; audit-only. */
export async function saveBriefCopy(root: string, runId: string, name: string, markdown: string): Promise<void> {
  const dir = join(root, '.agents', '.local', 'runs', runId, 'briefs')
  await mkdir(dir, { recursive: true })
  try {
    await writeFile(join(dir, `${name}.md`), markdown, 'utf8')
  } catch (error) {
    throw new Error(`IO_ERROR: cannot store brief copy for run ${runId}: ${(error as Error).message}`)
  }
}
