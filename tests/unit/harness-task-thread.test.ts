import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureTaskThread,
  loadTaskThread,
  readDesktopConcurrency,
  recordThreadAttempt,
  setThreadModel,
  setThreadReviewer,
} from '../../src/main/harness/task-thread'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'task-thread-'))
  roots.push(root)
  return root
}

describe('task-bound thread store', () => {
  it('creates, reloads, and appends attempts on the same thread', async () => {
    const root = await makeRoot()
    expect(await loadTaskThread(root, 'run-1')).toBeNull()
    const created = await ensureTaskThread(root, { runId: 'run-1', taskUri: 'note://r/t', mode: 'xdo' })
    expect(created.attempts).toEqual([])
    await setThreadModel(root, 'run-1', { providerId: 'p', modelId: 'm' })
    await setThreadReviewer(root, 'run-1', { providerId: 'review-p', modelId: 'review-m' }, 'auditor')
    await recordThreadAttempt(root, 'run-1', { attempt: 1, manifestHash: 'h1', checks: [{ id: 'V-1', kind: 'command', status: 'failed' }] })
    await recordThreadAttempt(root, 'run-1', { attempt: 1, manifestHash: 'h1', checks: [{ id: 'V-1', kind: 'command', status: 'passed' }], reviewVerdict: 'approved', receiptId: 'r-1' })
    const reloaded = await ensureTaskThread(root, { runId: 'run-1', taskUri: 'note://r/t', mode: 'xdo' })
    expect(reloaded.model).toEqual({ providerId: 'p', modelId: 'm' })
    expect(reloaded.reviewerModel).toEqual({ providerId: 'review-p', modelId: 'review-m' })
    expect(reloaded.reviewer).toBe('auditor')
    expect(reloaded.attempts).toHaveLength(1)
    expect(reloaded.attempts[0]).toMatchObject({ attempt: 1, receiptId: 'r-1', reviewVerdict: 'approved' })
  })

  it('recovers loader-tolerantly from corrupt thread files', async () => {
    const root = await makeRoot()
    await ensureTaskThread(root, { runId: 'run-1', taskUri: 'note://r/t', mode: 'xdo' })
    await writeFile(join(root, '.agents', '.local', 'runs', 'run-1', 'thread.json'), '{broken')
    expect(await loadTaskThread(root, 'run-1')).toBeNull()
  })

  it('refuses model and attempt writes without a thread', async () => {
    const root = await makeRoot()
    await expect(setThreadModel(root, 'nope', { providerId: 'p', modelId: 'm' })).rejects.toThrow('IO_ERROR')
    await expect(recordThreadAttempt(root, 'nope', { attempt: 1, manifestHash: 'h', checks: [] })).rejects.toThrow('IO_ERROR')
  })
})

describe('desktop concurrency budget', () => {
  it('reads max_threads from the agents section only', async () => {
    const root = await makeRoot()
    await mkdir(join(root, '.codex'), { recursive: true })
    await writeFile(join(root, '.codex', 'config.toml'), '[agents]\nmax_threads = 6\nmax_depth = 1\n\n[memories]\nmax_threads = 99\n')
    await expect(readDesktopConcurrency(root)).resolves.toEqual({ maxThreads: 6 })
  })

  it('runs unguarded without a readable config instead of inventing a budget', async () => {
    const root = await makeRoot()
    await expect(readDesktopConcurrency(root)).resolves.toBeNull()
    await mkdir(join(root, '.codex'), { recursive: true })
    await writeFile(join(root, '.codex', 'config.toml'), '[agents]\nmax_depth = 1\n')
    await expect(readDesktopConcurrency(root)).resolves.toBeNull()
  })
})
