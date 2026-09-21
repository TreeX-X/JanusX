import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  abortMerge,
  avatarUrlFor,
  createWorktree,
  deleteBranch,
  diffBranchToBase,
  fetchRepoAvatar,
  isAvatarFresh,
  isWorktreeDirty,
  listWorktrees,
  mergeBranchToBase,
  normalizeFsPath,
  parseGitRemote,
  parseWorktreeList,
  removeWorktree,
  samePath,
  slugifyWorktreeName,
  worktreeDirFor,
  worktreeBranch,
} from '../../src/main/git/worktrees'
import { WorktreeMetaStore } from '../../src/main/git/worktree-meta'

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
    ['https://git.company.com:8443/team/app.git', { host: 'git.company.com', owner: 'team', repo: 'app' }],
    ['https://gitlab.example.com/group/sub/app.git', { host: 'gitlab.example.com', owner: 'group/sub', repo: 'app' }],
    ['git@gitlab.example.com:group/sub/app.git', { host: 'gitlab.example.com', owner: 'group/sub', repo: 'app' }],
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

describe('samePath', () => {
  it('unifies git and native spellings so main never duplicates', () => {
    expect(samePath('C:/Users/Tree/Desktop/git/JanusX', 'C:\\Users\\Tree\\Desktop\\git\\JanusX')).toBe(true)
    expect(samePath('C:\\Users\\Tree\\Desktop\\git\\JanusX', 'C:\\Users\\Tree\\Desktop\\git\\Other')).toBe(false)
    expect(normalizeFsPath('C:/a/b/../b')).toBe(normalizeFsPath('C:\\a\\b'))
  })
})

describe.skipIf(!gitAvailable())('listWorktrees against real git', () => {
  it('lists a lone checkout exactly once', async () => {
    const repo = await initRepo()
    const worktrees = await listWorktrees('ws-1', repo)
    expect(worktrees).toHaveLength(1)
    expect(worktrees[0]).toMatchObject({ isMain: true, path: repo })
  })

  it('normalizes linked paths to native separators', async () => {
    const repo = await initRepo()
    const created = await createWorktree(repo, { name: 'fix', branch: 'fix-1', startFrom: 'HEAD' })
    roots.push(created.worktree.path)
    const worktrees = await listWorktrees('ws-1', repo)
    expect(worktrees).toHaveLength(2)
    expect(worktrees[1].path).not.toContain('/')
    await removeWorktree(repo, created.worktree.path)
  })
})

describe('parseWorktreeList', () => {  it('parses main plus linked entries with flags', () => {
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

describe('worktree meta store', () => {
  it('round-trips per-path metadata without electron', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wt-meta-'))
    roots.push(dir)
    const store = new WorktreeMetaStore(dir)
    expect(await store.get('/wt/a')).toBeNull()
    await store.set('/wt/a', { startFrom: 'origin/main', branch: 'a', createdAt: 't' })
    expect(await store.get('/wt/a')).toMatchObject({ startFrom: 'origin/main', branch: 'a' })
    const reloaded = new WorktreeMetaStore(dir)
    expect(await reloaded.get('/wt/a')).toMatchObject({ branch: 'a' })
    await reloaded.remove('/wt/a')
    expect(await reloaded.get('/wt/a')).toBeNull()
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

  async function commitFile(dir: string, name: string, content: string, message: string) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, name), content)
    await execFileAsync('git', ['-c', 'user.email=test@local', '-c', 'user.name=test', 'add', '-A'], { cwd: dir })
    await execFileAsync('git', ['-c', 'user.email=test@local', '-c', 'user.name=test', 'commit', '-m', message], {
      cwd: dir,
    })
  }

  it('diffs a branch against its base with line counts', async () => {
    const repo = await initRepo()
    await commitFile(repo, 'a.txt', 'one\ntwo\n', 'base file')
    await execFileAsync('git', ['checkout', '-b', 'feat'], { cwd: repo })
    await commitFile(repo, 'a.txt', 'one\nTWO\nthree\n', 'change')
    await execFileAsync('git', ['checkout', 'main'], { cwd: repo })
    const diff = await diffBranchToBase(repo, 'main', 'feat')
    expect(diff).toMatchObject({ base: 'main', branch: 'feat', additions: 2, deletions: 1 })
    expect(diff.files).toHaveLength(1)
    expect(diff.files[0]).toMatchObject({ path: 'a.txt', additions: 2, deletions: 1 })
  })

  it('merges cleanly and reports up-to-date reruns', async () => {
    const repo = await initRepo()
    await commitFile(repo, 'a.txt', 'v1\n', 'base')
    await execFileAsync('git', ['checkout', '-b', 'feat'], { cwd: repo })
    await commitFile(repo, 'a.txt', 'v2\n', 'change')
    await execFileAsync('git', ['checkout', 'main'], { cwd: repo })
    const first = await mergeBranchToBase(repo, 'feat')
    expect(first).toMatchObject({ merged: true, conflicts: [] })
    const second = await mergeBranchToBase(repo, 'feat')
    expect(second.upToDate).toBe(true)
  })

  it('returns conflicts instead of merging silently', async () => {
    const repo = await initRepo()
    await commitFile(repo, 'a.txt', 'base\n', 'base')
    await execFileAsync('git', ['checkout', '-b', 'feat'], { cwd: repo })
    await commitFile(repo, 'a.txt', 'feat-side\n', 'feat change')
    await execFileAsync('git', ['checkout', 'main'], { cwd: repo })
    await commitFile(repo, 'a.txt', 'main-side\n', 'main change')
    const result = await mergeBranchToBase(repo, 'feat')
    expect(result.merged).toBe(false)
    expect(result.conflicts).toEqual(['a.txt'])
    await abortMerge(repo)
    const { readFile } = await import('node:fs/promises')
    const restored = await readFile(join(repo, 'a.txt'), 'utf8')
    expect(restored.replace(/\r\n/g, '\n')).toBe('main-side\n')
  })

  it('refuses dirty main checkouts and self merges', async () => {
    const repo = await initRepo()
    await execFileAsync('git', ['checkout', '-b', 'feat'], { cwd: repo })
    await execFileAsync('git', ['checkout', 'main'], { cwd: repo })
    const { writeFile, rm } = await import('node:fs/promises')
    await writeFile(join(repo, 'dirty.txt'), 'x')
    await expect(mergeBranchToBase(repo, 'feat')).rejects.toThrow('未提交改动')
    // Self-merge guard fires before the dirty check by construction.
    await rm(join(repo, 'dirty.txt'), { force: true })
    await expect(mergeBranchToBase(repo, 'main')).rejects.toThrow('自己')
  })
})
