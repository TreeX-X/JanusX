// Note: offline worktree discovery plus login-free repo avatars — see
// .agents/notes/implemented/feature/2026-09-21-worktree-sidebar-scoping.md
// Note: background creation, scoped deletion, and branch review — see
// .agents/notes/implemented/feature/2026-09-21-worktree-create-delete.md
// Note: creation metadata plus local Ship diff/merge/abort — see
// .agents/notes/implemented/feature/2026-09-21-worktree-ship-merge.md
import { execFile, spawn, type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { access, copyFile, lstat, mkdir, readFile, rm, stat, symlink, writeFile } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import { promisify } from 'util'
import type { RepoIdentity, WorktreeInfo } from '../../shared/ipc/worktree'
import { worktreeMetaStore } from './worktree-meta'

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
    /^https?:\/\/([^/:]+)(?::\d+)?\/(.+)\/([^/]+)$/,
    /^ssh:\/\/[^@]*@([^/:]+)(?::\d+)?\/(.+)\/([^/]+)$/,
    /^[^@/:]+@([^:]+):(.+)\/([^/]+)$/,
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

/** Remote URL for callers outside this module (hosted detection); null when absent. */
export async function gitRemoteUrl(cwd: string, name: string): Promise<string | null> {
  return remoteUrl(cwd, name)
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
  const linked = await Promise.all(
    parseWorktreeList(output)
      .filter((entry) => !entry.bare && entry.path !== workspacePath)
      .map(async (entry): Promise<WorktreeInfo> => {
        const meta = await worktreeMetaStore.get(entry.path).catch(() => null)
        return {
          id: entry.path,
          workspaceId,
          path: entry.path,
          branch: entry.branch,
          detached: entry.detached,
          isMain: false,
          external: !meta,
          ...(meta ? { startFrom: meta.startFrom } : {}),
          ...(meta?.provider ? { provider: meta.provider } : {}),
          ...(meta?.linkedIssue ? { linkedIssue: meta.linkedIssue } : {}),
          ...(meta?.linkedReview !== undefined ? { linkedReview: meta.linkedReview } : {}),
          ...(meta?.pushTarget ? { pushTarget: meta.pushTarget } : {}),
          ...(entry.locked ? { locked: true } : {}),
          ...(entry.prunable ? { prunable: true } : {}),
        }
      }),
  )
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

/** Display name to branch slug: lowercase, dash-joined, git-safe. */
export function slugifyWorktreeName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-./]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[./-]+|[./-]+$/g, '')
  return slug || 'worktree'
}

/** Sibling directory for a new worktree; numeric suffix on collision. */
export async function worktreeDirFor(workspacePath: string, slug: string): Promise<string> {
  const base = `${basename(resolve(workspacePath))}-${slug}`
  const parent = dirname(resolve(workspacePath))
  let candidate = join(parent, base)
  for (let attempt = 2; ; attempt++) {
    try {
      await access(candidate)
      candidate = join(parent, `${base}-${attempt}`)
    } catch {
      return candidate
    }
  }
}

export interface CreateWorktreeInput {
  name: string
  branch?: string
  startFrom?: string
}

export interface CreateWorktreeResult {
  worktree: WorktreeInfo
  shared: string[]
  copied: string[]
}

async function verifyStartPoint(workspacePath: string, startFrom: string): Promise<void> {
  const checked = await runGit(workspacePath, ['rev-parse', '--verify', startFrom])
  if (!checked) throw new Error(`起始点不存在：${startFrom}`)
}

/**
 * Minimal dependency sharing for a fresh checkout. Large rebuildable
 * directories arrive as links, local secrets as owned copies; every step
 * is best-effort and reported rather than failing creation.
 */
async function shareNewWorktreeDeps(workspacePath: string, worktreePath: string): Promise<{ shared: string[]; copied: string[] }> {
  const shared: string[] = []
  const copied: string[] = []
  const nodeModulesSrc = join(workspacePath, 'node_modules')
  const nodeModulesDst = join(worktreePath, 'node_modules')
  try {
    const stats = await lstat(nodeModulesSrc).catch(() => null)
    if (stats?.isDirectory() && !(await lstat(nodeModulesDst).catch(() => null))) {
      await symlink(nodeModulesSrc, nodeModulesDst, process.platform === 'win32' ? 'junction' : 'dir')
      shared.push('node_modules')
    }
  } catch {
    // Rebuildable: a missing link only costs an install.
  }
  for (const file of ['.env', '.env.local']) {
    try {
      await access(join(workspacePath, file))
      await copyFile(join(workspacePath, file), join(worktreePath, file))
      copied.push(file)
    } catch {
      // Absent secrets are normal; never fail creation for them.
    }
  }
  return { shared, copied }
}

/** Create a linked worktree on a new branch; failures throw with git output. */
export async function createWorktree(
  workspacePath: string,
  input: CreateWorktreeInput,
  creationId?: string,
): Promise<CreateWorktreeResult> {
  const root = resolve(workspacePath)
  const branch = (input.branch?.trim() || slugifyWorktreeName(input.name))
  const startFrom = input.startFrom?.trim() || 'origin/main'
  if (!input.name.trim()) throw new Error('任务盘名称不能为空')
  await verifyStartPoint(root, startFrom)
  const path = await worktreeDirFor(root, slugifyWorktreeName(branch))
  await runWorktreeAdd(root, branch, path, startFrom, creationId)
  const { shared, copied } = await shareNewWorktreeDeps(root, path)
  // Metadata must never fail creation; the base falls back to origin/main.
  await worktreeMetaStore
    .set(path, { startFrom, branch, createdAt: new Date().toISOString() })
    .catch(() => undefined)
  return {
    worktree: {
      id: path,
      workspaceId: '',
      path,
      branch,
      detached: false,
      isMain: false,
      external: false,
    },
    shared,
    copied,
  }
}

const pendingCreations = new Map<string, { child: ChildProcess; path: string }>()

function runWorktreeAdd(
  root: string,
  branch: string,
  path: string,
  startFrom: string,
  creationId?: string,
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('git', ['worktree', 'add', '-b', branch, path, startFrom], {
      cwd: root,
      timeout: LOCAL_GIT_TIMEOUT_MS,
    })
    if (creationId) pendingCreations.set(creationId, { child, path })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      if (creationId) pendingCreations.delete(creationId)
      rejectPromise(err)
    })
    child.on('close', (code, signal) => {
      if (creationId) pendingCreations.delete(creationId)
      if (code === 0) resolvePromise()
      else if (signal) rejectPromise(new Error(`创建已取消：${branch}`))
      else rejectPromise(new Error(stderr.trim() || `git worktree add 失败：${branch}`))
    })
  })
}

/** Cancel a running creation; best-effort prune of partial state. */
export async function cancelCreateWorktree(workspacePath: string, creationId: string): Promise<boolean> {
  const pending = pendingCreations.get(creationId)
  if (!pending) return false
  pendingCreations.delete(creationId)
  try {
    pending.child.kill('SIGTERM')
  } catch {
    return false
  }
  const root = resolve(workspacePath)
  await runGit(root, ['worktree', 'prune'])
  await rm(pending.path, { recursive: true, force: true }).catch(() => undefined)
  return true
}

export interface RemoveWorktreeResult {
  branch: string | null
  branchDeleted: boolean
  /** Set when git refuses to drop the branch (unmerged commits). */
  branchKept?: string
}

/** Current branch of a checkout; null when detached or unresolvable. */
export async function worktreeBranch(worktreePath: string): Promise<string | null> {
  return currentBranch(worktreePath)
}

/** True when the worktree has uncommitted changes. */
export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  const output = await runGit(worktreePath, ['status', '--porcelain'])
  return output !== null && output.trim().length > 0
}

/**
 * Remove disk plus branch. The main checkout refuses here; branches git
 * will not drop stay listed via branchKept for explicit review instead of
 * force-deletion. Protected names (the main checkout's own branch) are
 * never deleted.
 */
export async function removeWorktree(
  workspacePath: string,
  worktreePath: string,
  force = false,
): Promise<RemoveWorktreeResult> {
  const root = resolve(workspacePath)
  const target = resolve(worktreePath)
  if (target === root) throw new Error('主盘不能在这里删除')
  const branch = await currentBranch(target)
  const remove = await runGit(root, force ? ['worktree', 'remove', '--force', target] : ['worktree', 'remove', target])
  if (remove === null) throw new Error(`git worktree remove 失败：${target}`)
  await runGit(root, ['worktree', 'prune'])
  await worktreeMetaStore.remove(target).catch(() => undefined)
  if (!branch) return { branch: null, branchDeleted: false }
  const mainBranch = await currentBranch(root)
  if (mainBranch && branch === mainBranch) return { branch, branchDeleted: false }
  const deleted = await runGit(root, ['branch', '-d', branch])
  if (deleted === null) return { branch, branchDeleted: false, branchKept: branch }
  return { branch, branchDeleted: true }
}

/** Explicit branch deletion for the preserved-branches review list. */
export async function deleteBranch(workspacePath: string, branch: string, force = false): Promise<void> {
  const removed = await runGit(resolve(workspacePath), ['branch', force ? '-D' : '-d', branch])
  if (removed === null) throw new Error(`删除分支失败：${branch}`)
}

export interface BranchFileDiff {
  path: string
  additions: number | null
  deletions: number | null
}

export interface BranchDiff {
  base: string
  branch: string
  files: BranchFileDiff[]
  additions: number
  deletions: number
}

/** Committed diff of a branch against its base (three-dot range). */
export async function diffBranchToBase(mainPath: string, base: string, branch: string): Promise<BranchDiff> {
  const root = resolve(mainPath)
  const output = await runGit(root, ['diff', '--numstat', `${base}...${branch}`])
  if (output === null) throw new Error(`读取分支差异失败：${branch} → ${base}`)
  const files: BranchFileDiff[] = []
  let additions = 0
  let deletions = 0
  for (const line of output.split('\n')) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (!match) continue
    const additionsForFile = match[1] === '-' ? null : Number(match[1])
    const deletionsForFile = match[2] === '-' ? null : Number(match[2])
    files.push({ path: match[3], additions: additionsForFile, deletions: deletionsForFile })
    additions += additionsForFile ?? 0
    deletions += deletionsForFile ?? 0
  }
  return { base, branch, files, additions, deletions }
}

export interface MergeResult {
  merged: boolean
  upToDate: boolean
  conflicts: string[]
}

/**
 * Merge a worktree branch into the main checkout's current branch.
 * Conflicts return as a list for explicit abort; nothing merges silently.
 */
export async function mergeBranchToBase(mainPath: string, branch: string): Promise<MergeResult> {
  const root = resolve(mainPath)
  const current = await currentBranch(root)
  if (current && current === branch) throw new Error('不能把分支合并到自己')
  const dirty = await runGit(root, ['status', '--porcelain'])
  if (dirty === null) throw new Error('读取主盘状态失败')
  if (dirty.trim()) throw new Error('主盘有未提交改动，先提交或清理后再合并')
  const output = await runGit(root, ['merge', '--no-ff', branch, '-m', `Merge branch '${branch}'`])
  if (output !== null) {
    return { merged: true, upToDate: /already up to date/i.test(output), conflicts: [] }
  }
  const conflicted = await runGit(root, ['diff', '--name-only', '--diff-filter=U'])
  return {
    merged: false,
    upToDate: false,
    conflicts: conflicted ? conflicted.split('\n').map((line) => line.trim()).filter(Boolean) : [],
  }
}

/** Abort an in-progress conflicted merge in the main checkout. */
export async function abortMerge(mainPath: string): Promise<void> {
  const aborted = await runGit(resolve(mainPath), ['merge', '--abort'])
  if (aborted === null) throw new Error('中止合并失败')
}
