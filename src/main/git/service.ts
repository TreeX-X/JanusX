import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const LOCAL_GIT_TIMEOUT_MS = 10000
const REMOTE_GIT_TIMEOUT_MS = 120000

async function runGit(cwd: string, args: string[], timeout: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout })
    return stdout.trim()
  } catch (err: any) {
    throw new Error(err.stderr?.trim() || err.message)
  }
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return runGit(cwd, args, LOCAL_GIT_TIMEOUT_MS)
}

async function remoteGit(cwd: string, ...args: string[]): Promise<string> {
  return runGit(cwd, args, REMOTE_GIT_TIMEOUT_MS)
}

export async function getStatus(cwd: string) {
  const [branchLine, upstreamLine, aheadBehind, rawStatus] = await Promise.all([
    git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'),
    git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}').catch(() => ''),
    git(cwd, 'rev-list', '--left-right', '--count', 'HEAD...@{upstream}').catch(() => '0\t0'),
    git(cwd, 'status', '--porcelain', '-b'),
  ])

  const [ahead, behind] = aheadBehind.split('\t').map(Number)

  const changes: { path: string; status: string; staged: boolean }[] = []
  const lines = rawStatus.split('\n').slice(1) // skip branch info line
  for (const line of lines) {
    if (!line.trim()) continue
    const indexStatus = line[0]
    const worktreeStatus = line[1]
    const filePath = line.substring(3).trim()

    if (indexStatus !== ' ' && indexStatus !== '?') {
      changes.push({ path: filePath, status: mapStatus(indexStatus), staged: true })
    }
    if (worktreeStatus !== ' ' && worktreeStatus !== '?') {
      changes.push({ path: filePath, status: mapStatus(worktreeStatus), staged: false })
    }
    if (indexStatus === '?' && worktreeStatus === '?') {
      changes.push({ path: filePath, status: '??', staged: false })
    }
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

function mapStatus(code: string): string {
  switch (code) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case 'U': return 'UU'
    default: return code
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
