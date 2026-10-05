import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessWorkspaceStatus } from '../../src/shared/ipc/harness'

const mocks = vi.hoisted(() => ({ status: vi.fn(), load: vi.fn(), activeId: 'a', workspaces: [
  { id: 'a', name: 'A', path: 'C:/A' }, { id: 'b', name: 'B', path: 'C:/B' }, { id: 'c', name: 'C', path: 'C:/C' },
] }))
vi.mock('@/services/blueprint', () => ({ loadBlueprint: mocks.load, listBlueprintSummaries: vi.fn(), focusNode: vi.fn() }))
vi.mock('@/stores/workspace', () => ({ useWorkspaceStore: { getState: () => ({ workspaces: mocks.workspaces,
  activeWorkspaceId: mocks.activeId, setActiveWorkspace: (id: string) => { mocks.activeId = id } }) } }))
import { useBlueprintStore } from '../../src/renderer/src/stores/blueprint'

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

describe('workspace-first blueprint selection', () => {
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
