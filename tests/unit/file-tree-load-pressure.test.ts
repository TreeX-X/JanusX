import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ workspace: {} as Record<string, any> }))
vi.mock('@/stores/workspace', () => ({ useWorkspaceStore: {
  getState: () => state.workspace,
  setState: (update: any) => Object.assign(state.workspace, typeof update === 'function' ? update(state.workspace) : update),
} }))
vi.mock('@/stores/worktree', () => ({ useWorktreeStore: { getState: () => ({ activePaths: {} }) } }))
vi.mock('@/stores/git', () => ({ useGitStore: { getState: () => ({}) } }))
vi.mock('@/stores/editor', () => ({ invalidateEditorFileCache: vi.fn() }))

afterEach(() => vi.unstubAllGlobals())

describe('file tree load pressure', () => {
  it('limits directory IPC to four workers and stops superseded scans', async () => {
    const { loadWorkspaceFileTree } = await import('../../src/renderer/src/features/workspace/actions')
    const directories = Array.from({ length: 30 }, (_, i) => ({
      name: `dir${i}`, path: `dir${i}`, type: 'directory', loaded: true, children: [],
    }))
    state.workspace = { activeWorkspaceId: 'w', workspaces: [{ id: 'w', path: 'root' }], fileTree: directories }
    const releases: Array<() => void> = []
    const children = vi.fn(() => new Promise<any[]>(resolve => { releases.push(() => resolve([])) }))
    const load = vi.fn().mockResolvedValue(directories)
    vi.stubGlobal('window', { electron: { fileTree: { load, children } } })
    let current = true
    const pending = loadWorkspaceFileTree('root', () => current)
    await vi.waitFor(() => expect(children).toHaveBeenCalledTimes(4))
    current = false
    releases.forEach(release => release())
    await pending
    expect(children).toHaveBeenCalledTimes(4)
    expect(state.workspace.fileTree).toBe(directories)
  })

  it('does not expand directories after an obsolete root response arrives', async () => {
    const { loadWorkspaceFileTree } = await import('../../src/renderer/src/features/workspace/actions')
    let release!: (nodes: any[]) => void
    const children = vi.fn()
    vi.stubGlobal('window', { electron: { fileTree: {
      load: () => new Promise<any[]>(resolve => { release = resolve }), children,
    } } })
    let current = true
    const pending = loadWorkspaceFileTree('root', () => current)
    current = false
    release([])
    await pending
    expect(children).not.toHaveBeenCalled()
  })
})
