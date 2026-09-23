import { beforeEach, describe, expect, it } from 'vitest'
import { worktreeListSignature } from '../../src/main/git/worktrees'
import { sameScopePath, useWorktreeStore } from '../../src/renderer/src/stores/worktree'
import type { WorktreeInfo } from '../../src/shared/ipc/worktree'

function entry(overrides: Partial<WorktreeInfo> & { path: string }): WorktreeInfo {
  return {
    id: overrides.path,
    workspaceId: 'ws-1',
    branch: 'main',
    detached: false,
    isMain: false,
    external: true,
    ...overrides,
  }
}

const MAIN = entry({ path: 'C:\\repo', branch: 'main', isMain: true, external: false })
const LINKED = entry({ path: 'C:\\repo-feat', branch: 'feat' })

describe('worktreeListSignature', () => {
  it('separates add, remove, and branch switches', () => {
    const base = worktreeListSignature([MAIN])
    expect(worktreeListSignature([MAIN])).toBe(base)
    expect(worktreeListSignature([MAIN, LINKED])).not.toBe(base)
    expect(worktreeListSignature([MAIN, { ...LINKED, branch: 'feat-2' }])).not.toBe(
      worktreeListSignature([MAIN, LINKED]),
    )
  })
})

describe('sameScopePath', () => {
  it('matches across separators, casing, and trailing slashes', () => {
    expect(sameScopePath('C:\\repo\\feat', 'C:/repo/feat/')).toBe(true)
    expect(sameScopePath('C:\\REPO\\feat', 'c:/repo/feat')).toBe(true)
    expect(sameScopePath('C:\\repo\\feat', 'C:\\repo\\other')).toBe(false)
    expect(sameScopePath('', 'C:\\repo')).toBe(false)
  })
})

describe('applyExternalWorktrees', () => {
  beforeEach(() => {
    useWorktreeStore.setState({
      worktreesByWorkspace: { 'ws-1': [MAIN, LINKED] },
      activePaths: { 'ws-1': LINKED.path },
    })
  })

  it('replaces the list without stealing the active scope on external add', () => {
    const added = entry({ path: 'C:\\repo-docs', branch: 'docs' })
    useWorktreeStore.getState().applyExternalWorktrees('ws-1', MAIN.path, [MAIN, LINKED, added])
    const state = useWorktreeStore.getState()
    expect(state.worktreesByWorkspace['ws-1']).toHaveLength(3)
    expect(state.activePaths['ws-1']).toBe(LINKED.path)
  })

  it('falls back to the workspace root when the active path vanished', () => {
    useWorktreeStore.getState().applyExternalWorktrees('ws-1', MAIN.path, [MAIN])
    const state = useWorktreeStore.getState()
    expect(state.worktreesByWorkspace['ws-1']).toEqual([MAIN])
    expect(state.activePaths['ws-1']).toBe(MAIN.path)
  })

  it('keeps a main-scoped active path untouched', () => {
    useWorktreeStore.setState({ activePaths: { 'ws-1': MAIN.path } })
    useWorktreeStore.getState().applyExternalWorktrees('ws-1', MAIN.path, [MAIN])
    expect(useWorktreeStore.getState().activePaths['ws-1']).toBe(MAIN.path)
  })
})
