// Note: task-bound persistent threads — see .agents/notes/implemented/architecture/2026-09-18-persistent-task-threads.md
/**
 * @file Task-bound thread store (S8-JanusX, persistent-subagent P1).
 * @description Persists one thread per run under `.agents/.local/runs/<runId>/`:
 *  the review model endpoint, plus one entry per attempt carrying the tested
 *  manifest hash, check outcomes, review verdict, receipt id, and repair
 *  packet. Re-entry loads the same thread, so repairs continue with context
 *  instead of re-reading the world. The thread is auxiliary: the run record,
 *  the task Note, and the receipts stay the truth, and every write here is
 *  atomic (temp file plus rename) with loader-tolerant recovery.
 *  No Electron import, so unit tests drive real temp checkouts.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface TaskThreadModel {
  providerId: string
  modelId: string
}

export interface TaskThreadAttempt {
  attempt: number
  manifestHash: string
  checks: Array<{ id: string; kind: string; status: string }>
  reviewVerdict?: 'approved' | 'needs-fix' | 'blocked'
  receiptId?: string
  repair?: { failureReceiptId: string; summary: string; auto: boolean }
  at: string
}

export interface TaskThreadEvaluation {
  attempt: number
  reviewer: string
  verdict: 'approved' | 'needs-fix' | 'blocked'
  receiptId: string
  at: string
}

export interface TaskThread {
  schema: 'harness-thread/1'
  runId: string
  taskUri: string
  mode: string
  model?: TaskThreadModel
  attempts: TaskThreadAttempt[]
  evaluations: TaskThreadEvaluation[]
  createdAt: string
  updatedAt: string
}

function threadFile(root: string, runId: string): string {
  return join(root, '.agents', '.local', 'runs', runId, 'thread.json')
}

function isThread(value: unknown): value is TaskThread {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.schema === 'harness-thread/1'
    && typeof record.runId === 'string'
    && typeof record.taskUri === 'string'
    && Array.isArray(record.attempts)
}

/** Loads the thread for a run, or null when none was ever recorded. */
export async function loadTaskThread(root: string, runId: string): Promise<TaskThread | null> {
  let raw: string
  try {
    raw = await readFile(threadFile(root, runId), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error(`IO_ERROR: cannot read task thread for run ${runId}: ${(error as Error).message}`)
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isThread(parsed) || parsed.runId !== runId) return null
    if (!Array.isArray(parsed.evaluations)) parsed.evaluations = []
    return parsed
  } catch {
    return null
  }
}

async function writeThread(root: string, thread: TaskThread): Promise<void> {
  const file = threadFile(root, thread.runId)
  await mkdir(join(root, '.agents', '.local', 'runs', thread.runId), { recursive: true })
  const body = JSON.stringify({ ...thread, updatedAt: new Date().toISOString() }, null, 2)
  const tmp = `${file}.${process.pid}.tmp`
  try {
    await writeFile(tmp, body, 'utf8')
    await rename(tmp, file)
  } catch (error) {
    throw new Error(`IO_ERROR: cannot persist task thread for run ${thread.runId}: ${(error as Error).message}`)
  }
}

/** Loads the thread for a run, creating it when this is the first touch. */
export async function ensureTaskThread(root: string, input: { runId: string; taskUri: string; mode: string }): Promise<TaskThread> {
  const existing = await loadTaskThread(root, input.runId)
  if (existing) return existing
  const now = new Date().toISOString()
  const created: TaskThread = {
    schema: 'harness-thread/1',
    runId: input.runId,
    taskUri: input.taskUri,
    mode: input.mode,
    attempts: [],
    evaluations: [],
    createdAt: now,
    updatedAt: now,
  }
  await writeThread(root, created)
  return created
}

/** Records the review model endpoint so recovery reuses it instead of asking again. */
export async function setThreadModel(root: string, runId: string, model: TaskThreadModel): Promise<TaskThread> {
  const thread = await loadTaskThread(root, runId)
  if (!thread) throw new Error(`IO_ERROR: no task thread for run ${runId}`)
  const next: TaskThread = { ...thread, model }
  await writeThread(root, next)
  return next
}

/** Appends one attempt entry to the same thread; repairs never open a new thread. */
export async function recordThreadAttempt(root: string, runId: string, entry: Omit<TaskThreadAttempt, 'at'>): Promise<TaskThread> {
  const thread = await loadTaskThread(root, runId)
  if (!thread) throw new Error(`IO_ERROR: no task thread for run ${runId}`)
  const kept = thread.attempts.filter((item) => item.attempt !== entry.attempt)
  const next: TaskThread = { ...thread, attempts: [...kept, { ...entry, at: new Date().toISOString() }] }
  await writeThread(root, next)
  return next
}

/** Records one independent evaluation beside implementor attempts, never merged into them. */
export async function recordThreadEvaluation(root: string, runId: string, entry: Omit<TaskThreadEvaluation, 'at'>): Promise<TaskThread> {
  const thread = await loadTaskThread(root, runId)
  if (!thread) throw new Error(`IO_ERROR: no task thread for run ${runId}`)
  const next: TaskThread = { ...thread, evaluations: [...thread.evaluations, { ...entry, at: new Date().toISOString() }] }
  await writeThread(root, next)
  return next
}

/**
 * Reads the desktop concurrency budget from the app config. Returns null when
 * the config is absent or unreadable, in which case callers run unguarded and
 * say so. Nested delegation never applies to direct xdo turns.
 */
export async function readDesktopConcurrency(appRoot: string): Promise<{ maxThreads: number } | null> {
  let raw: string
  try {
    raw = await readFile(join(appRoot, '.codex', 'config.toml'), 'utf8')
  } catch {
    return null
  }
  const section = raw.split(/^\[(.+)\]\s*$/m)
  for (let i = 1; i < section.length; i += 2) {
    if (section[i]?.trim() !== 'agents') continue
    const match = (section[i + 1] ?? '').match(/^\s*max_threads\s*=\s*(\d+)\s*$/m)
    if (match) {
      const maxThreads = Number.parseInt(match[1] as string, 10)
      if (Number.isInteger(maxThreads) && maxThreads > 0) return { maxThreads }
    }
  }
  return null
}
