import { execFile, spawn } from 'child_process'
import { lstat, readFile, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'util'
import type { GitFileChange } from '../../shared/ipc/git'

const execFileAsync = promisify(execFile)
const LOCAL_GIT_TIMEOUT_MS = 10000
const REMOTE_GIT_TIMEOUT_MS = 120000
const DEFAULT_GIT_OUTPUT_BYTES = 1024 * 1024
const CONFLICT_STATUS_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

async function runGit(
  cwd: string,
  args: string[],
  timeout: number,
  maxBuffer = DEFAULT_GIT_OUTPUT_BYTES,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout, maxBuffer, signal })
    return stdout
  } catch (err: any) {
    throw new Error(err.stderr?.trim() || err.message)
  }
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await runGit(cwd, args, LOCAL_GIT_TIMEOUT_MS)).trim()
}

async function rawGit(cwd: string, ...args: string[]): Promise<string> {
  return runGit(cwd, args, LOCAL_GIT_TIMEOUT_MS)
}

async function remoteGit(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  return (await runGit(cwd, args, REMOTE_GIT_TIMEOUT_MS, DEFAULT_GIT_OUTPUT_BYTES, signal)).trim()
}

export async function getStatus(cwd: string) {
  const [branchLine, upstreamLine, aheadBehind, rawStatus, hasHead] = await Promise.all([
    git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => git(cwd, 'symbolic-ref', '--short', 'HEAD')),
    git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}').catch(() => ''),
    git(cwd, 'rev-list', '--left-right', '--count', 'HEAD...@{upstream}').catch(() => '0\t0'),
    rawGit(cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=all'),
    git(cwd, 'rev-parse', '--verify', 'HEAD').then(() => true, () => false),
  ])

  const [ahead, behind] = aheadBehind.split('\t').map(Number)
  const changes = parsePorcelainStatus(rawStatus)
  const rawNumstat = hasHead
    ? await rawGit(cwd, 'diff', '--numstat', '-z', 'HEAD', '--').catch(() => '')
    : await rawGit(cwd, 'diff', '--cached', '--numstat', '-z', '--').catch(() => '')
  const lineStats = parseNumstat(rawNumstat)

  for (let offset = 0; offset < changes.length; offset += 32) {
    await Promise.all(changes.slice(offset, offset + 32).map(async (change) => {
      const stats = lineStats.get(change.path)
        ?? (change.status === '??' ? await getUntrackedLineStats(cwd, change.path) : null)
      change.additions = stats?.additions ?? null
      change.deletions = stats?.deletions ?? null
    }))
  }

  return {
    branch: {
      name: branchLine,
      upstream: upstreamLine || null,
      ahead,
      behind,
    },
    changes,
    clean: changes.length === 0,
  }
}

function parsePorcelainStatus(raw: string): GitFileChange[] {
  const records = raw.split('\0')
  const changes: GitFileChange[] = []

  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (!record) continue

    const indexStatus = record[0]
    const worktreeStatus = record[1]
    const path = record.slice(3)
    if (indexStatus === 'R' || indexStatus === 'C') index++

    if (CONFLICT_STATUS_PAIRS.has(`${indexStatus}${worktreeStatus}`)) {
      changes.push(createFileChange(path, 'UU', indexStatus !== ' '))
      continue
    }
    if (indexStatus !== ' ' && indexStatus !== '?') {
      changes.push(createFileChange(path, mapStatus(indexStatus), true))
    }
    if (worktreeStatus !== ' ' && worktreeStatus !== '?') {
      changes.push(createFileChange(path, mapStatus(worktreeStatus), false))
    }
    if (indexStatus === '?' && worktreeStatus === '?') {
      changes.push(createFileChange(path, '??', false))
    }
  }

  return changes
}

function createFileChange(
  path: string,
  status: GitFileChange['status'],
  staged: boolean,
): GitFileChange {
  return { path, status, staged, additions: null, deletions: null }
}

function mapStatus(code: string): GitFileChange['status'] {
  switch (code) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case 'C': return 'R'
    case 'U': return 'UU'
    default: return 'M'
  }
}

interface LineStats {
  additions: number | null
  deletions: number | null
}

function parseNumstat(raw: string): Map<string, LineStats> {
  const stats = new Map<string, LineStats>()
  let cursor = 0

  while (cursor < raw.length) {
    const recordEnd = raw.indexOf('\0', cursor)
    if (recordEnd < 0) break

    const record = raw.slice(cursor, recordEnd)
    cursor = recordEnd + 1
    const firstTab = record.indexOf('\t')
    const secondTab = record.indexOf('\t', firstTab + 1)
    if (firstTab < 0 || secondTab < 0) continue

    const additions = parseLineCount(record.slice(0, firstTab))
    const deletions = parseLineCount(record.slice(firstTab + 1, secondTab))
    let path = record.slice(secondTab + 1)

    if (!path) {
      const previousPathEnd = raw.indexOf('\0', cursor)
      if (previousPathEnd < 0) break
      cursor = previousPathEnd + 1
      const nextPathEnd = raw.indexOf('\0', cursor)
      if (nextPathEnd < 0) break
      path = raw.slice(cursor, nextPathEnd)
      cursor = nextPathEnd + 1
    }

    stats.set(path, { additions, deletions })
  }

  return stats
}

function parseLineCount(value: string): number | null {
  return value === '-' ? null : Number(value)
}

async function getUntrackedLineStats(cwd: string, path: string): Promise<LineStats | null> {
  try {
    const absolutePath = resolve(cwd, path)
    const fileStats = await lstat(absolutePath)
    if (!fileStats.isFile() || fileStats.isSymbolicLink()) return null

    const content = await readFile(absolutePath)
    const sample = content.subarray(0, 8000)
    if (sample.includes(0)) return { additions: null, deletions: null }
    if (content.length === 0) return { additions: 0, deletions: 0 }

    let additions = content[content.length - 1] === 10 ? 0 : 1
    for (const byte of content) if (byte === 10) additions++
    return { additions, deletions: 0 }
  } catch {
    return null
  }
}

export async function getLog(cwd: string, maxCount = 50) {
  const hasHead = await git(cwd, 'rev-parse', '--verify', 'HEAD').then(() => true, () => false)
  if (!hasHead) return []
  const raw = await git(
    cwd, 'log', `--max-count=${maxCount}`,
    '--pretty=format:%H|%h|%s|%an|%ai'
  )
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [hash, shortHash, message, author, date] = line.split('|')
    return { hash, shortHash, message, author, date }
  })
}

export async function stage(cwd: string, paths: string[]) {
  await git(cwd, 'add', '--', ...paths)
}

export async function unstage(cwd: string, paths: string[]) {
  const hasHead = await git(cwd, 'rev-parse', '--verify', 'HEAD').then(() => true, () => false)
  await (hasHead
    ? git(cwd, 'reset', 'HEAD', '--', ...paths)
    : git(cwd, 'rm', '--cached', '--', ...paths))
}

export async function discard(cwd: string, relativePath: string) {
  const absolutePath = resolve(cwd, relativePath)
  const safePath = relative(resolve(cwd), absolutePath)
  if (!safePath || safePath === '..' || safePath.startsWith(`..${sep}`) || isAbsolute(safePath)) {
    throw new Error('Git file path is outside the workspace')
  }
  const status = await getStatus(cwd)
  const change = status.changes.find((item) => item.path === relativePath)
  if (!change) throw new Error('File is no longer changed')
  if (change.status === '??') {
    await rm(absolutePath, { recursive: true, force: true })
  } else if (change.staged) {
    await git(cwd, 'restore', '--staged', '--worktree', '--', relativePath)
  } else {
    await git(cwd, 'restore', '--', relativePath)
  }
  return getStatus(cwd)
}

export async function commit(cwd: string, message: string) {
  await git(cwd, 'commit', '-m', message)
}

export async function push(cwd: string, signal?: AbortSignal) {
  const upstream = await git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}').catch(() => '')
  if (upstream) {
    await remoteGit(cwd, ['push'], signal)
    return
  }

  const remotes = (await git(cwd, 'remote')).split(/\r?\n/).filter(Boolean)
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  if (!remote) throw new Error('No Git remote is configured for this repository')
  await remoteGit(cwd, ['push', '--set-upstream', remote, 'HEAD'], signal)
}

export async function pull(cwd: string, signal?: AbortSignal) {
  await remoteGit(cwd, ['pull'], signal)
}

export async function getWorkingDiff(
  cwd: string,
  options: { staged?: boolean; path?: string; maxBytes: number; signal?: AbortSignal },
): Promise<{ content: string; truncated: boolean }> {
  const args = ['diff', '--no-color']
  if (options.staged) args.push('--cached')
  args.push('--')
  if (options.path) args.push(options.path)

  return runBoundedGit(cwd, args, options.maxBytes, options.signal)
}

function runBoundedGit(cwd: string, args: string[], maxBytes: number, signal?: AbortSignal): Promise<{ content: string; truncated: boolean }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    let bytes = 0
    let errorBytes = 0
    let truncated = false
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, LOCAL_GIT_TIMEOUT_MS)
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      const remaining = maxBytes - bytes
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
      bytes += Math.min(chunk.length, Math.max(remaining, 0))
      if (chunk.length > remaining) truncated = true
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const remaining = 64 * 1024 - errorBytes
      if (remaining > 0) errors.push(chunk.subarray(0, remaining))
      errorBytes += Math.min(chunk.length, Math.max(remaining, 0))
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) {
        reject(new Error('Git command cancelled'))
        return
      }
      if (timedOut) {
        reject(new Error('Git command timed out'))
        return
      }
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString('utf-8').trim() || `Git exited with code ${code}`))
        return
      }
      resolveResult({ content: Buffer.concat(chunks).toString('utf-8'), truncated })
    })
  })
}

export async function getFileBaseline(cwd: string, relativePath: string): Promise<{ content: string; tracked: boolean; available: boolean }> {
  if (!relativePath || relativePath.includes('\0') || isAbsolute(relativePath)) {
    throw new Error('Invalid Git file path')
  }
  const absolutePath = resolve(cwd, relativePath)
  const safePath = relative(resolve(cwd), absolutePath)
  if (!safePath || safePath === '..' || safePath.startsWith(`..${sep}`)) {
    throw new Error('Git file path is outside the workspace')
  }
  const available = await git(cwd, 'rev-parse', '--is-inside-work-tree').then(
    (value) => value === 'true',
    () => false,
  )
  if (!available) return { content: '', tracked: false, available: false }
  try {
    return { content: await rawGit(cwd, 'show', `HEAD:${safePath.replace(/\\/g, '/')}`), tracked: true, available: true }
  } catch {
    return { content: '', tracked: false, available: true }
  }
}

export async function getCurrentBranch(cwd: string) {
  return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
}

/** Janus Analyzer 需要的 commit 区间条目。字段与 getLog 返回保持一致。 */
export interface CommitRangeItem {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
}

/** 判断某个 commit SHA 是否存在于当前仓库（用于校验分析游标是否仍有效）。 */
export async function commitExists(cwd: string, sha: string): Promise<boolean> {
  try {
    await git(cwd, 'cat-file', '-e', `${sha}^{commit}`)
    return true
  } catch {
    return false
  }
}

/** 取 [from, to) 区间内的 commit 列表（from 为 null 时从最早开始），按时间倒序，最多 limit 条。 */
export async function getCommitRange(
  cwd: string,
  from: string | null,
  to: string,
  limit: number
): Promise<CommitRangeItem[]> {
  const range = from ? `${from}..${to}` : to
  const raw = await git(
    cwd,
    'log',
    `--max-count=${limit}`,
    '--pretty=format:%H|%h|%s|%an|%ai',
    range
  ).catch(() => '')
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [hash, shortHash, message, author, date] = line.split('|')
    return { hash, shortHash, message, author, date }
  })
}

/** 取某个 commit 的完整 diff 文本（patch 形式，含改动内容，不含 commit message）。 */
export async function getCommitDiff(cwd: string, hash: string): Promise<string> {
  return git(cwd, 'diff-tree', '-p', '--no-color', '--root', hash).catch(() => '')
}

export async function getCommitChanges(cwd: string, hash: string) {
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) throw new Error('Invalid commit hash')
  const raw = await git(cwd, 'show', '--format=', '--numstat', '--find-renames', hash)
  if (!raw) return []
  return raw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [add, del, ...pathParts] = line.split('\t')
    const path = pathParts.join('\t')
    const status = add === '0' && del !== '0' ? 'D' : add !== '0' && del === '0' ? 'A' : 'M'
    return { path, status, additions: add === '-' ? null : Number(add), deletions: del === '-' ? null : Number(del) }
  })
}
