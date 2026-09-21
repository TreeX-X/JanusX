import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  avatarUrlFor,
  createWorktree,
  deleteBranch,
  fetchRepoAvatar,
  isAvatarFresh,
  isWorktreeDirty,
  parseGitRemote,
  parseWorktreeList,
  removeWorktree,
  slugifyWorktreeName,
  worktreeDirFor,
  worktreeBranch,
} from '../../src/main/git/worktrees'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

describe('parseGitRemote', () => {
  it.each([
    ['https://github.com/TreeX-X/JanusX.git', { host: 'github.com', owner: 'TreeX-X', repo: 'JanusX' }],
    ['https://github.com/TreeX-X/JanusX', { host: 'github.com', owner: 'TreeX-X', repo: 'JanusX' }],
    ['git@github.com:TreeX-X/JanusX.git', { host: 'github.com', owner: 'TreeX-X', repo: 'JanusX' }],
    ['ssh://git@github.com/TreeX-X/JanusX.git', { host: 'github.com', owner: 'TreeX-X', repo: 'JanusX' }],
    ['https://gitlab.example.com/team/app.git', { host: 'gitlab.example.com', owner: 'team', repo: 'app' }],
    ['git@gitlab.example.com:team/app.git', { host: 'gitlab.example.com', owner: 'team', repo: 'app' }],
  ])('parses %s', (url, expected) => {
    expect(parseGitRemote(url)).toEqual(expected)
  })

  it.each([[''], ['not-a-url'], ['/local/path.git'], ['https://github.com/only-owner']])(
    'rejects %s',
    (url) => {
      expect(parseGitRemote(url)).toBeNull()
    },
  )
})

describe('parseWorktreeList', () => {
  it('parses main plus linked entries with flags', () => {
    const output = [
      'worktree /repo',
      'branch refs/heads/main',
      '',
      'worktree /repo-a',
      'branch refs/heads/feature-a',
      '',
      'worktree /repo-b',
      'detached',
      '',
      'worktree /repo-c',
      'branch refs/heads/feature-c',
      'locked',
      '',
      'worktree /repo-d',
      'bare',
      '',
    ].join('\n')
    const entries = parseWorktreeList(output)
    expect(entries).toHaveLength(5)
    expect(entries[0]).toMatchObject({ path: '/repo', branch: 'main' })
    expect(entries[1]).toMatchObject({ path: '/repo-a', branch: 'feature-a' })
    expect(entries[2]).toMatchObject({ path: '/repo-b', detached: true })
    expect(entries[3]).toMatchObject({ path: '/repo-c', locked: true })
    expect(entries[4]).toMatchObject({ path: '/repo-d', bare: true })
  })

  it('returns empty for empty output', () => {
    expect(parseWorktreeList('')).toEqual([])
  })
})

describe('avatarUrlFor', () => {
  it('builds the login-free owner URL for github.com only', () => {
    expect(avatarUrlFor('github.com', 'octocat')).toBe('https://github.com/octocat.png')
    expect(avatarUrlFor('GITHUB.COM', 'octocat')).toBe('https://github.com/octocat.png')
    expect(avatarUrlFor('gitlab.example.com', 'team')).toBeNull()
    expect(avatarUrlFor('github.com', '')).toBeNull()
  })
})

describe('fetchRepoAvatar', () => {
  it('returns null without fetching where unsupported', async () => {
    const fetchImpl = vi.fn()
    expect(await fetchRepoAvatar('/tmp', 'gitlab.example.com', 'team', fetchImpl)).toEqual({
      dataUrl: null,
      cached: false,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('caches downloads and serves them offline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-avatars-'))
    roots.push(dir)
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    const first = await fetchRepoAvatar(dir, 'github.com', 'octocat', fetchImpl)
    expect(first.cached).toBe(false)
    expect(first.dataUrl?.startsWith('data:image/png;base64,')).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const failingFetch = vi.fn().mockRejectedValue(new Error('offline'))
    const second = await fetchRepoAvatar(dir, 'github.com', 'octocat', failingFetch)
    expect(second).toEqual({ dataUrl: first.dataUrl, cached: true })
  })

  it('rejects oversized payloads', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-avatars-'))
    roots.push(dir)
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024 * 1024),
    })
    expect(await fetchRepoAvatar(dir, 'github.com', 'octocat', fetchImpl)).toEqual({
      dataUrl: null,
      cached: false,
    })
  })
})

describe('isAvatarFresh', () => {
  it('expires after seven days', () => {
    const now = Date.now()
    expect(isAvatarFresh(now - 1000, now)).toBe(true)
    expect(isAvatarFresh(now - 8 * 24 * 60 * 60 * 1000, now)).toBe(false)
  })
})

describe('slugifyWorktreeName', () => {
  it.each([
    ['登录重试', 'worktree'],
    ['Auth Retry', 'auth-retry'],
    ['  Feature_X  ', 'feature-x'],
    ['a/b', 'a/b'],
    ['---', 'worktree'],
    ['', 'worktree'],
  ])('slugifies %s', (name, expected) => {
    expect(slugifyWorktreeName(name)).toBe(expected)
  })
})

const execFileAsync = promisify(execFile)

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wt-repo-'))
  roots.push(dir)
  const git = (args: string[]) =>
    execFileAsync('git', ['-c', 'user.email=test@local', '-c', 'user.name=test', ...args], { cwd: dir })
  await git(['init', '-b', 'main'])
  const { writeFile, mkdir } = await import('node:fs/promises')
  // Realistic checkout: dependencies and secrets stay untracked.
  await writeFile(join(dir, '.gitignore'), 'node_modules/\n.env\n.env.local\n')
  await writeFile(join(dir, 'README.md'), '# repo\n')
  await mkdir(join(dir, 'node_modules'))
  await writeFile(join(dir, 'node_modules', 'pkg.json'), '{}')
  await writeFile(join(dir, '.env'), 'SECRET=1\n')
  await git(['add', '-A'])
  await git(['commit', '-m', 'init'])
  return dir
}

describe.skipIf(!gitAvailable())('worktree create/remove against real git', () => {
  it('creates on a new branch with shared deps, then removes disk and branch', async () => {
    const repo = await initRepo()
    const created = await createWorktree(repo, { name: 'Auth Retry', startFrom: 'HEAD' })
    roots.push(created.worktree.path)
    expect(created.worktree.branch).toBe('auth-retry')
    expect(created.shared).toEqual(['node_modules'])
    expect(created.copied).toEqual(['.env'])

    // Unmerged branch survives disk removal for review.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(created.worktree.path, 'work.txt'), 'x')
    const git = (args: string[]) =>
      execFileAsync('git', ['-c', 'user.email=test@local', '-c', 'user.name=test', ...args], {
        cwd: created.worktree.path,
      })
    await git(['add', '-A'])
    await git(['commit', '-m', 'work'])
    const removed = await removeWorktree(repo, created.worktree.path)
    expect(removed.branchKept).toBe('auth-retry')
    expect(removed.branchDeleted).toBe(false)

    await deleteBranch(repo, 'auth-retry', true)
    const branches = await execFileAsync('git', ['branch', '--list', 'auth-retry'], { cwd: repo })
    expect(branches.stdout.trim()).toBe('')
  })

  it('deletes merged branches with the disk', async () => {
    const repo = await initRepo()
    const created = await createWorktree(repo, { name: 'fix', branch: 'fix-1', startFrom: 'HEAD' })
    roots.push(created.worktree.path)
    await execFileAsync('git', ['merge', '--no-ff', 'fix-1', '-m', 'merge'], { cwd: repo })
    const removed = await removeWorktree(repo, created.worktree.path)
    expect(removed).toMatchObject({ branch: 'fix-1', branchDeleted: true })
  })

  it('refuses the main checkout and reports dirtiness', async () => {
    const repo = await initRepo()
    await expect(removeWorktree(repo, repo)).rejects.toThrow('主盘')
    expect(await isWorktreeDirty(repo)).toBe(false)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(repo, 'dirty.txt'), 'x')
    expect(await isWorktreeDirty(repo)).toBe(true)
    expect(await worktreeBranch(repo)).toBe('main')
  })

  it('dedupes worktree directories on collision', async () => {
    const repo = await initRepo()
    const first = await worktreeDirFor(repo, 'fix')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(first, { recursive: true })
    const second = await worktreeDirFor(repo, 'fix')
    expect(second).not.toBe(first)
    expect(second.endsWith('-2')).toBe(true)
  })
})
