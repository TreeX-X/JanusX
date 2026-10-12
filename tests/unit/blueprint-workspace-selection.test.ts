import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessWorkspaceStatus } from '../../src/shared/ipc/harness'

const mocks = vi.hoisted(() => ({ status: vi.fn(), load: vi.fn(), activeId: 'a', workspaces: [
  { id: 'a', name: 'A', path: 'C:/A' }, { id: 'b', name: 'B', path: 'C:/B' }, { id: 'c', name: 'C', path: 'C:/C' },
] }))
vi.mock('@/services/blueprint', () => ({ loadBlueprint: mocks.load, listBlueprintSummaries: vi.fn(), focusNode: vi.fn() }))
vi.mock('@/stores/workspace', () => ({ useWorkspaceStore: { getState: () => ({ workspaces: mocks.workspaces,
  activeWorkspaceId: mocks.activeId, setActiveWorkspace: (id: string) => { mocks.activeId = id } }) } }))
import { useBlueprintStore } from '../../src/renderer/src/stores/blueprint'
import { useBlueprintReviewStore } from '../../src/renderer/src/stores/blueprint-review'

function status(root: string, state: HarnessWorkspaceStatus['state'] = 'ok'): HarnessWorkspaceStatus {
  return { root, state, noteCount: state === 'ok' ? 1 : 0, diagnostics: [], ...(state === 'ok' ? { projectId: `harness:project:${root}` } : {}) }
}
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(async () => {
  vi.stubGlobal('window', { electron: { harness: { workspaceStatus: mocks.status } } })
  mocks.activeId = 'a'
  mocks.status.mockReset().mockImplementation(async (path: string) => status(path))
  mocks.load.mockReset().mockImplementation(async (_path: string, id: string) => ({ id, nodeIds: ['node'], nodes: {} }))
  await useBlueprintStore.getState().loadWorkspace(null)
  useBlueprintStore.setState({ workspaceStates: {}, blueprintWorkspace: {} })
})

afterEach(async () => { await useBlueprintStore.getState().loadWorkspace(null); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('workspace-first blueprint selection', () => {
  it('reads again after a pre-write request and exposes the new source hash', async () => {
    await useBlueprintStore.getState().loadWorkspace('a')
    const pending = deferred<unknown>(), id = 'harness:project:C:/A'
    mocks.load.mockReturnValueOnce(pending.promise)
    const oldRead = useBlueprintStore.getState().loadWorkspace('a')
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
    mocks.load.mockResolvedValue({ id, nodeIds: ['node'], nodes: {}, noteSnapshot: { entries: [{ relPath: '.agents/notes/topic.md', sourceHash: 'after-write' }] } })
    const refresh = useBlueprintStore.getState().refreshAfterAnalysis()
    pending.resolve({ id, nodeIds: ['node'], nodes: {}, noteSnapshot: { entries: [{ relPath: '.agents/notes/topic.md', sourceHash: 'before-write' }] } })
    await Promise.all([oldRead, refresh])
    expect(mocks.load).toHaveBeenCalledTimes(3)
    expect(useBlueprintStore.getState().currentBlueprint?.noteSnapshot?.entries[0].sourceHash).toBe('after-write')
  })
  it('does not return to the old workspace during a post-write refresh', async () => {
    const pending = deferred<unknown>()
    mocks.load.mockReturnValueOnce(pending.promise)
    const oldRead = useBlueprintStore.getState().loadWorkspace('a')
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalled())
    const refresh = useBlueprintStore.getState().refreshAfterAnalysis()
    await useBlueprintStore.getState().switchWorkspace('b')
    pending.resolve({ id: 'old', nodes: {}, nodeIds: [] })
    await Promise.all([oldRead, refresh])
    expect(useBlueprintStore.getState().selectedWorkspaceId).toBe('b')
    expect(useBlueprintStore.getState().currentBlueprint?.id).toBe('harness:project:C:/B')
  })
  it('does not label a busy background status read as a workspace failure', async () => {
    await useBlueprintStore.getState().loadWorkspace('a')
    mocks.status.mockResolvedValue({ state: 'error', root: 'C:/A', noteCount: 0, diagnostics: [{ code: 'BUSY', message: 'notes busy: lock held' }] })
    await useBlueprintStore.getState().refreshWorkspaceStates()
    expect(useBlueprintStore.getState().workspaceStates.a.state).toBe('ok')
    expect(useBlueprintStore.getState().workspaceStates.b).toBeUndefined()
  })
  it('joins a startup load while status and graph are pending', async () => {
    const pending = deferred<HarnessWorkspaceStatus>()
    const discovery = vi.spyOn(useBlueprintReviewStore.getState(), 'refresh').mockResolvedValue()
    mocks.status.mockReturnValue(pending.promise)
    const startup = useBlueprintStore.getState().loadWorkspace('a')
    const entry = useBlueprintStore.getState().loadWorkspace('a')
    await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1))
    expect(discovery).toHaveBeenCalledExactlyOnceWith('C:/A')
    discovery.mockRestore()
    pending.resolve(status('C:/A'))
    await Promise.all([startup, entry])
    expect(mocks.load).toHaveBeenCalledTimes(1)
    expect(useBlueprintStore.getState().currentBlueprint?.id).toBe('harness:project:C:/A')
  })

  it('keeps a busy cold checkout loading and automatically recovers', async () => {
    vi.useFakeTimers()
    mocks.status.mockResolvedValueOnce({ root: 'C:/A', state: 'error', noteCount: 0, diagnostics: [{ code: 'BUSY', message: 'notes busy: lock held' }] })
    const pending = useBlueprintStore.getState().loadWorkspace('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(useBlueprintStore.getState()).toMatchObject({ loading: true, loadState: 'waiting', error: null })
    await vi.advanceTimersByTimeAsync(250)
    await pending
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(useBlueprintStore.getState()).toMatchObject({ loading: false, loadState: 'idle', error: null })
    expect(useBlueprintStore.getState().currentBlueprint).not.toBeNull()
  })

  it('retains the canvas while a transported busy error is retried', async () => {
    await useBlueprintStore.getState().loadWorkspace('a')
    const graph = useBlueprintStore.getState().currentBlueprint
    vi.useFakeTimers()
    mocks.load.mockRejectedValueOnce(new Error("Error invoking remote method 'janus:load': Error: notes busy: lock held"))
    const pending = useBlueprintStore.getState().loadWorkspace('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(useBlueprintStore.getState()).toMatchObject({ loading: true, loadState: 'waiting', error: null })
    expect(useBlueprintStore.getState().currentBlueprint).toBe(graph)
    await vi.advanceTimersByTimeAsync(250)
    await pending
    expect(useBlueprintStore.getState()).toMatchObject({ loading: false, error: null })
  })

  it('ends repeated BUSY responses at the overall deadline and allows a fresh retry', async () => {
    await useBlueprintStore.getState().loadWorkspace('a')
    const graph = useBlueprintStore.getState().currentBlueprint
    vi.useFakeTimers()
    mocks.load.mockRejectedValue(Object.assign(new Error('notes busy: lock held'), { code: 'BUSY' }))
    const pending = useBlueprintStore.getState().loadWorkspace('a')
    await vi.advanceTimersByTimeAsync(15001)
    expect(useBlueprintStore.getState()).toMatchObject({ loading: false, loadState: 'error' })
    expect(useBlueprintStore.getState().currentBlueprint).toBe(graph)
    await pending
    mocks.load.mockResolvedValue(graph)
    await useBlueprintStore.getState().loadWorkspace('a')
    expect(useBlueprintStore.getState()).toMatchObject({ loading: false, loadState: 'idle', error: null })
  })

  it('cancels busy retries when the user changes workspace', async () => {
    vi.useFakeTimers()
    mocks.status.mockImplementation(async (path: string) => {
      if (path === 'C:/A') throw Object.assign(new Error('busy'), { code: 'BUSY' })
      return status(path)
    })
    const old = useBlueprintStore.getState().loadWorkspace('a')
    await vi.advanceTimersByTimeAsync(0)
    await useBlueprintStore.getState().switchWorkspace('b')
    await old
    await vi.advanceTimersByTimeAsync(10000)
    expect(mocks.status.mock.calls.filter(([path]) => path === 'C:/A')).toHaveLength(1)
    expect(useBlueprintStore.getState().currentBlueprint?.id).toBe('harness:project:C:/B')
  })

  it('keeps the last canvas on a permanent refresh failure without retrying it', async () => {
    await useBlueprintStore.getState().loadWorkspace('a')
    const graph = useBlueprintStore.getState().currentBlueprint
    mocks.load.mockRejectedValue(new Error('Read denied'))
    await useBlueprintStore.getState().loadWorkspace('a')
    expect(useBlueprintStore.getState().currentBlueprint).toBe(graph)
    expect(useBlueprintStore.getState()).toMatchObject({ loading: false, loadState: 'error', error: 'Read denied' })
    expect(mocks.load).toHaveBeenCalledTimes(2)
  })
  it('retains all registered workspaces including empty and failed ones', async () => {
    mocks.status.mockImplementation(async (path: string) => { if (path === 'C:/C') throw new Error('Read denied'); return status(path, path === 'C:/B' ? 'not-found' : 'ok') })
    await useBlueprintStore.getState().refreshWorkspaceStates()
    expect(Object.keys(useBlueprintStore.getState().workspaceStates)).toEqual(['a', 'b', 'c'])
    expect(useBlueprintStore.getState().workspaceStates.b.state).toBe('not-found')
    expect(useBlueprintStore.getState().workspaceStates.c.diagnostics[0].message).toBe('Read denied')
  })

  it('switches to an uninitialized workspace without showing a different blueprint', async () => {
    await useBlueprintStore.getState().loadWorkspace('a')
    mocks.status.mockImplementation(async (path: string) => status(path, 'not-found'))
    await useBlueprintStore.getState().switchWorkspace('b')
    expect(mocks.activeId).toBe('b')
    expect(useBlueprintStore.getState()).toMatchObject({ selectedWorkspaceId: 'b', currentBlueprint: null, loading: false })
    expect(mocks.load).toHaveBeenCalledTimes(1)
  })

  it('discards a late status response from a previous workspace', async () => {
    const pending = deferred<HarnessWorkspaceStatus>()
    mocks.status.mockImplementation((path: string) => path === 'C:/A' ? pending.promise : Promise.resolve(status(path, 'empty')))
    const first = useBlueprintStore.getState().loadWorkspace('a')
    await useBlueprintStore.getState().switchWorkspace('b')
    pending.resolve(status('C:/A')); await first
    expect(useBlueprintStore.getState()).toMatchObject({ selectedWorkspaceId: 'b', currentBlueprint: null })
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('discards a late graph response when the new workspace has no graph', async () => {
    const pending = deferred<unknown>()
    mocks.load.mockReturnValue(pending.promise)
    const first = useBlueprintStore.getState().loadWorkspace('a')
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalled())
    mocks.status.mockImplementation(async (path: string) => status(path, 'not-found'))
    await useBlueprintStore.getState().switchWorkspace('b')
    pending.resolve({ id: 'old', nodes: {}, nodeIds: ['old'] }); await first
    expect(useBlueprintStore.getState()).toMatchObject({ selectedWorkspaceId: 'b', currentBlueprint: null })
  })

  it('keeps graph read failures on their selected workspace', async () => {
    await useBlueprintStore.getState().loadWorkspace('a')
    mocks.load.mockRejectedValue(new Error('Broken checkout'))
    await useBlueprintStore.getState().switchWorkspace('b')
    expect(useBlueprintStore.getState().currentBlueprint).toBeNull()
    expect(useBlueprintStore.getState().workspaceStates.b).toMatchObject({ state: 'error', diagnostics: [{ message: 'Broken checkout' }] })
  })

  it('does not overwrite a refreshed status with an older background scan', async () => {
    const pending = deferred<HarnessWorkspaceStatus>()
    mocks.status.mockImplementation((path: string) => path === 'C:/B' ? pending.promise : Promise.resolve(status(path)))
    const background = useBlueprintStore.getState().refreshWorkspaceStates()
    mocks.status.mockImplementation(async (path: string) => status(path, 'empty'))
    await useBlueprintStore.getState().switchWorkspace('b')
    pending.resolve(status('C:/B', 'not-found')); await background
    expect(useBlueprintStore.getState().workspaceStates.b.state).toBe('empty')
  })
})
