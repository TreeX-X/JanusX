import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 10000 })
    return stdout.trim()
  } catch (err: any) {
    throw new Error(err.stderr?.trim() || err.message)
  }
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
  await git(cwd, 'push')
}

export async function pull(cwd: string) {
  await git(cwd, 'pull')
}

export async function getCurrentBranch(cwd: string) {
  return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
}
