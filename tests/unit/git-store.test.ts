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
      commits: [],
      loading: false,
      error: null,
    })
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
