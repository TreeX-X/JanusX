import { execFile } from 'child_process'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'util'
import type { GitFileChange } from '../../shared/ipc/git'

const execFileAsync = promisify(execFile)
const LOCAL_GIT_TIMEOUT_MS = 10000
const REMOTE_GIT_TIMEOUT_MS = 120000
const CONFLICT_STATUS_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

async function runGit(cwd: string, args: string[], timeout: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout })
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

async function remoteGit(cwd: string, ...args: string[]): Promise<string> {
  return (await runGit(cwd, args, REMOTE_GIT_TIMEOUT_MS)).trim()
}

export async function getStatus(cwd: string) {
  const [branchLine, upstreamLine, aheadBehind, rawStatus, hasHead] = await Promise.all([
    git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'),
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
  await git(cwd, 'add', ...paths)
}

export async function unstage(cwd: string, paths: string[]) {
  await git(cwd, 'reset', 'HEAD', ...paths)
}

export async function commit(cwd: string, message: string) {
  await git(cwd, 'commit', '-m', message)
}

export async function push(cwd: string) {
  const upstream = await git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}').catch(() => '')
  if (upstream) {
    await remoteGit(cwd, 'push')
    return
  }

  const remotes = (await git(cwd, 'remote')).split(/\r?\n/).filter(Boolean)
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  if (!remote) throw new Error('No Git remote is configured for this repository')
  await remoteGit(cwd, 'push', '--set-upstream', remote, 'HEAD')
}

export async function pull(cwd: string) {
  await remoteGit(cwd, 'pull')
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
