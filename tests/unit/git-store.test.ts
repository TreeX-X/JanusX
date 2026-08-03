import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGitStore } from '../../src/renderer/src/stores/git'

const cleanStatus = {
  branch: { name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 },
  changes: [],
  clean: true,
}

describe('Git store actions', () => {
  beforeEach(() => {
    useGitStore.setState({
      status: null,
      statusCwd: null,
      commits: [],
      loading: false,
      error: null,
    })
  })

  it('coalesces overlapping refreshes and commits only the latest result', async () => {
    let resolveFirst!: (value: typeof cleanStatus) => void
    const first = new Promise<typeof cleanStatus>((resolve) => { resolveFirst = resolve })
    const changedStatus = { ...cleanStatus, clean: false, changes: [{ path: 'a.ts', status: 'M' as const, staged: false, additions: 1, deletions: 0 }] }
    const status = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(changedStatus)
    vi.stubGlobal('window', { electron: { git: { status } } })

    const initialRefresh = useGitStore.getState().fetchStatus('C:\\workspace')
    const followupRefresh = useGitStore.getState().fetchStatus('C:\\workspace')
    resolveFirst(cleanStatus)
    await Promise.all([initialRefresh, followupRefresh])

    expect(status).toHaveBeenCalledTimes(2)
    expect(useGitStore.getState().status).toEqual(changedStatus)
  })

  it('preserves the last successful status when a refresh fails', async () => {
    const status = vi.fn().mockResolvedValueOnce(cleanStatus).mockRejectedValueOnce(new Error('temporary failure'))
    vi.stubGlobal('window', { electron: { git: { status } } })

    await useGitStore.getState().fetchStatus('C:\\workspace')
    await useGitStore.getState().fetchStatus('C:\\workspace')

    expect(useGitStore.getState()).toMatchObject({ status: cleanStatus, error: 'temporary failure' })
  })

  it('does not let a previous workspace overwrite the active workspace', async () => {
    let resolvePrevious!: (value: typeof cleanStatus) => void
    const previous = new Promise<typeof cleanStatus>((resolve) => { resolvePrevious = resolve })
    const activeStatus = { ...cleanStatus, branch: { ...cleanStatus.branch, name: 'active' } }
    const status = vi.fn().mockReturnValueOnce(previous).mockResolvedValueOnce(activeStatus)
    vi.stubGlobal('window', { electron: { git: { status } } })

    const previousRefresh = useGitStore.getState().fetchStatus('C:\\previous')
    await useGitStore.getState().fetchStatus('C:\\active')
    resolvePrevious(cleanStatus)
    await previousRefresh

    expect(useGitStore.getState()).toMatchObject({ status: activeStatus, statusCwd: 'c:/active' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['commitChanges', 'commit'],
    ['pushChanges', 'push'],
    ['pullChanges', 'pull'],
  ] as const)('returns true and refreshes status after %s succeeds', async (storeAction, apiAction) => {
    const api = {
      commit: vi.fn().mockResolvedValue(cleanStatus),
      push: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue(cleanStatus),
    }
    vi.stubGlobal('window', { electron: { git: api } })

    const succeeded = storeAction === 'commitChanges'
      ? await useGitStore.getState()[storeAction]('C:\\workspace', 'message')
      : await useGitStore.getState()[storeAction]('C:\\workspace')

    expect(succeeded).toBe(true)
    expect(api[apiAction]).toHaveBeenCalled()
    expect(useGitStore.getState()).toMatchObject({
      status: cleanStatus,
      loading: false,
      error: null,
    })
    if (storeAction !== 'commitChanges') expect(api.status).toHaveBeenCalledWith('C:\\workspace')
  })

  it.each([
    ['commitChanges', 'commit'],
    ['pushChanges', 'push'],
    ['pullChanges', 'pull'],
  ] as const)('returns false and preserves the error after %s fails', async (storeAction, apiAction) => {
    const api = {
      commit: vi.fn().mockResolvedValue(cleanStatus),
      push: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue(cleanStatus),
    }
    api[apiAction].mockRejectedValue(new Error(`${apiAction} failed`))
    vi.stubGlobal('window', { electron: { git: api } })

    const succeeded = storeAction === 'commitChanges'
      ? await useGitStore.getState()[storeAction]('C:\\workspace', 'message')
      : await useGitStore.getState()[storeAction]('C:\\workspace')

    expect(succeeded).toBe(false)
    expect(useGitStore.getState()).toMatchObject({
      loading: false,
      error: `${apiAction} failed`,
    })
  })
})
