import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  avatarUrlFor,
  fetchRepoAvatar,
  isAvatarFresh,
  parseGitRemote,
  parseWorktreeList,
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
