// Note: offline worktree discovery plus login-free repo avatars — see
// .agents/notes/implemented/feature/2026-09-21-worktree-sidebar-scoping.md
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { promisify } from 'util'
import type { RepoIdentity, WorktreeInfo } from '../../shared/ipc/worktree'

const execFileAsync = promisify(execFile)
const LOCAL_GIT_TIMEOUT_MS = 10000
const AVATAR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface ParsedRemote {
  host: string
  owner: string
  repo: string
}

/**
 * Parse https, ssh, and scp-like remote URLs into host/owner/repo.
 * Returns null for unparseable values instead of throwing.
 */
export function parseGitRemote(url: string): ParsedRemote | null {
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  const withoutGit = trimmed.endsWith('.git') ? trimmed.slice(0, -4) : trimmed
  const patterns = [
    /^https?:\/\/([^/:]+)\/([^/]+)\/([^/]+)$/,
    /^ssh:\/\/[^@]*@([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+)$/,
    /^[^@/:]+@([^:]+):([^/]+)\/([^/]+)$/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(withoutGit)
    if (match) return { host: match[1].toLowerCase(), owner: match[2], repo: match[3] }
  }
  return null
}

export interface ParsedWorktree {
  path: string
  branch: string | null
  detached: boolean
  bare: boolean
  locked: boolean
  prunable: boolean
}

/** Parse `git worktree list --porcelain` output without throwing. */
export function parseWorktreeList(output: string): ParsedWorktree[] {
  const entries: ParsedWorktree[] = []
  let current: ParsedWorktree | null = null
  const flush = () => {
    if (current) entries.push(current)
    current = null
  }
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      current = { path: line.slice(9).trim(), branch: null, detached: false, bare: false, locked: false, prunable: false }
    } else if (!current) {
      continue
    } else if (line.startsWith('branch ')) {
      const ref = line.slice(7).trim()
      current.branch = ref.startsWith('refs/heads/') ? ref.slice(11) : ref
    } else if (line === 'detached') {
      current.detached = true
    } else if (line === 'bare') {
      current.bare = true
    } else if (line === 'locked') {
      current.locked = true
    } else if (line === 'prunable') {
      current.prunable = true
    }
  }
  flush()
  return entries
}

async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: LOCAL_GIT_TIMEOUT_MS })
    return stdout
  } catch {
    return null
  }
}

async function remoteUrl(cwd: string, name: string): Promise<string | null> {
  const output = await runGit(cwd, ['remote', 'get-url', name])
  const url = output?.trim()
  return url ? url : null
}

/**
 * Offline repo identity: origin remote plus an upstream fork hint.
 * Never touches the network; unresolvable checkouts yield null.
 */
export async function getRepoIdentity(cwd: string): Promise<RepoIdentity | null> {
  const origin = await remoteUrl(cwd, 'origin')
  const parsed = origin ? parseGitRemote(origin) : null
  if (!parsed) return null
  const upstream = await remoteUrl(cwd, 'upstream')
  const upstreamParsed = upstream ? parseGitRemote(upstream) : null
  const upstreamOwner =
    upstreamParsed && upstreamParsed.owner.toLowerCase() !== parsed.owner.toLowerCase()
      ? upstreamParsed.owner
      : undefined
  const avatarOwner = upstreamOwner ?? parsed.owner
  return {
    host: parsed.host,
    owner: parsed.owner,
    repo: parsed.repo,
    ...(upstreamOwner ? { upstreamOwner } : {}),
    avatarUrl: avatarUrlFor(parsed.host, avatarOwner),
  }
}

/**
 * Login-free avatar URL. Only GitHub exposes an unauthenticated owner
 * image path; every other host returns null and keeps letter fallback.
 */
export function avatarUrlFor(host: string, owner: string): string | null {
  if (host.toLowerCase() === 'github.com' && owner) return `https://github.com/${owner}.png`
  return null
}

/** List linked worktrees; the main checkout is always first. */
export async function listWorktrees(workspaceId: string, workspacePath: string): Promise<WorktreeInfo[]> {
  const main: WorktreeInfo = {
    id: workspacePath,
    workspaceId,
    path: workspacePath,
    branch: await currentBranch(workspacePath),
    detached: false,
    isMain: true,
    external: false,
  }
  const output = await runGit(workspacePath, ['worktree', 'list', '--porcelain'])
  if (!output) return [main]
  const linked = parseWorktreeList(output)
    .filter((entry) => !entry.bare && entry.path !== workspacePath)
    .map((entry) => ({
      id: entry.path,
      workspaceId,
      path: entry.path,
      branch: entry.branch,
      detached: entry.detached,
      isMain: false,
      external: true,
      ...(entry.locked ? { locked: true } : {}),
      ...(entry.prunable ? { prunable: true } : {}),
    }))
  return [main, ...linked]
}

async function currentBranch(cwd: string): Promise<string | null> {
  const output = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = output?.trim()
  return branch && branch !== 'HEAD' ? branch : null
}

function avatarCachePath(userDataDir: string, host: string, owner: string): string {
  const digest = createHash('sha1').update(`${host}/${owner.toLowerCase()}`).digest('hex')
  return join(userDataDir, 'janusx', 'repo-avatars', `${digest}.png`)
}

export type FetchImpl = (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>

/**
 * Download-once owner avatar with a 7-day disk cache. Failures resolve to
 * null so callers fall back to the letter avatar; nothing here throws for
 * network states.
 */
export async function fetchRepoAvatar(
  userDataDir: string,
  host: string,
  owner: string,
  fetchImpl: FetchImpl = globalThis.fetch,
): Promise<{ dataUrl: string | null; cached: boolean }> {
  const url = avatarUrlFor(host, owner)
  if (!url) return { dataUrl: null, cached: false }
  const cachePath = avatarCachePath(userDataDir, host, owner)
  try {
    const [cached, stats] = await Promise.all([
      readFile(cachePath).catch(() => null),
      stat(cachePath).catch(() => null),
    ])
    if (cached && stats && isAvatarFresh(stats.mtimeMs)) {
      return { dataUrl: `data:image/png;base64,${cached.toString('base64')}`, cached: true }
    }
    try {
      const response = await fetchImpl(url)
      if (!response.ok) throw new Error('avatar fetch failed')
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength === 0 || buffer.byteLength > 512 * 1024) throw new Error('avatar empty')
      await mkdir(dirname(cachePath), { recursive: true })
      await writeFile(cachePath, buffer).catch(() => undefined)
      return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}`, cached: false }
    } catch {
      // Offline with a stale cache still beats the letter fallback.
      if (cached) return { dataUrl: `data:image/png;base64,${cached.toString('base64')}`, cached: true }
      return { dataUrl: null, cached: false }
    }
  } catch {
    return { dataUrl: null, cached: false }
  }
}

export function isAvatarFresh(mtimeMs: number, nowMs = Date.now()): boolean {
  return nowMs - mtimeMs < AVATAR_CACHE_TTL_MS
}
