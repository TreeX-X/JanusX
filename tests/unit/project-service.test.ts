import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectAPI } from '../../src/shared/ipc/project'
import { ProjectType, type RunningProjectSummary } from '../../src/shared/ipc/project'
import {
  createLatestRequestGuard,
  createProjectErrorTracker,
  executeCurrentTask,
  getProjectLauncherMode,
  getRunningProjectFailureState,
  getProjectValidationError,
  projectService,
  startProjectPolling,
} from '../../src/renderer/src/services/project'
import { installElectronApiFallback } from '../../src/renderer/src/lib/electron-api-fallback'

const projectApi = {
  list: vi.fn(),
  readConfig: vi.fn(),
} as unknown as ProjectAPI

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const runningProjects: RunningProjectSummary[] = [
  {
    id: 'C:\\old',
    pid: 1,
    type: ProjectType.Vite,
    name: 'old',
    startTime: '2026-07-17T00:00:00.000Z',
    uptime: 100,
  },
  {
    id: 'C:\\other',
    pid: 2,
    type: ProjectType.NextJs,
    name: 'other',
    startTime: '2026-07-17T00:00:00.000Z',
    uptime: 50,
  },
]

describe('projectService', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { electron: { project: projectApi } })
    vi.mocked(projectApi.list).mockReset()
    vi.mocked(projectApi.readConfig).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('preserves a successful null config and surfaces handler errors', async () => {
    vi.mocked(projectApi.readConfig).mockResolvedValueOnce({ success: true, data: null })
    await expect(projectService.readConfig('C:\\demo')).resolves.toBeNull()

    vi.mocked(projectApi.readConfig).mockResolvedValueOnce({ success: false, error: 'read failed' })
    await expect(projectService.readConfig('C:\\demo')).rejects.toThrow('read failed')
  })

  it('selects settings for null config and running for an existing config', () => {
    expect(getProjectLauncherMode(null)).toBe('settings')
    expect(getProjectLauncherMode({
      version: '0.1.0',
      projectType: ProjectType.Vite,
      projectName: 'demo',
      configurations: [],
    })).toBe('running')
  })

  it('keeps list/get failures visible while clearing stale state', () => {
    expect(getRunningProjectFailureState('list failed', runningProjects)).toEqual({
      projects: [],
      selectedProjectId: null,
      selectedOutput: [],
      error: 'list failed',
    })
    expect(getRunningProjectFailureState('get failed', runningProjects, 'C:\\old')).toEqual({
      projects: [runningProjects[1]],
      selectedProjectId: null,
      selectedOutput: [],
      error: 'get failed',
    })
  })

  it('uses validation errors only for an invalid successful result', () => {
    expect(getProjectValidationError({ valid: true, errors: [], warnings: [] })).toBeNull()
    expect(getProjectValidationError({
      valid: false,
      errors: [{ field: 'configurations', message: 'At least one configuration is required' }],
      warnings: [],
    })).toBe('Validation failed: At least one configuration is required')
  })

  it('filters running projects by the exact workspace ID segment', async () => {
    vi.mocked(projectApi.list).mockResolvedValueOnce({
      success: true,
      data: [
        { ...runningProjects[0], id: 'C:\\work::dev::1' },
        { ...runningProjects[1], id: 'C:\\workspace::dev::2' },
      ],
    })

    await expect(projectService.listByWorkspace('C:\\work')).resolves.toEqual([
      { ...runningProjects[0], id: 'C:\\work::dev::1' },
    ])
  })

  it('polls immediately and stops callbacks and active work on cleanup', async () => {
    vi.useFakeTimers()
    const activeChecks: Array<() => boolean> = []
    const refresh = vi.fn((isCurrent: () => boolean) => activeChecks.push(isCurrent))

    const stop = startProjectPolling(refresh, 100)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(activeChecks[0]()).toBe(true)

    await vi.advanceTimersByTimeAsync(200)
    expect(refresh).toHaveBeenCalledTimes(3)

    stop()
    expect(activeChecks[0]()).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('cleans old-target polling before immediately refreshing a changed target', async () => {
    vi.useFakeTimers()
    const events: string[] = []
    let oldIsCurrent: (() => boolean) | undefined

    const stopOld = startProjectPolling((isCurrent) => {
      oldIsCurrent = isCurrent
      events.push('old')
    }, 100)
    stopOld()
    const stopNew = startProjectPolling(() => events.push('new'), 100)

    expect(oldIsCurrent?.()).toBe(false)
    expect(events).toEqual(['old', 'new'])
    await vi.advanceTimersByTimeAsync(100)
    expect(events).toEqual(['old', 'new', 'new'])

    stopNew()
  })

  it('does not overlap polls while the current refresh is unresolved', async () => {
    vi.useFakeTimers()
    const first = deferred<void>()
    const refresh = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)

    const stop = startProjectPolling(refresh, 100)
    vi.advanceTimersByTime(300)
    expect(refresh).toHaveBeenCalledTimes(1)

    first.resolve()
    await first.promise
    await Promise.resolve()
    vi.advanceTimersByTime(100)
    expect(refresh).toHaveBeenCalledTimes(2)
    stop()
  })

  it('invalidates stale initialization work when a newer request begins', async () => {
    const guard = createLatestRequestGuard()
    const oldResult = deferred<string>()
    const newResult = deferred<string>()
    const commits: string[] = []
    const commitWhenCurrent = async (result: Promise<string>, isCurrent: () => boolean) => {
      const value = await result
      if (isCurrent()) commits.push(value)
    }

    const oldCommit = commitWhenCurrent(oldResult.promise, guard.begin())
    const newCommit = commitWhenCurrent(newResult.promise, guard.begin())
    oldResult.resolve('old path')
    newResult.resolve('new path')
    await Promise.all([oldCommit, newCommit])

    expect(commits).toEqual(['new path'])
  })

  it('clears only the displayed error owned by the same source and generation', () => {
    const tracker = createProjectErrorTracker()
    const staleListSuccess = tracker.checkpoint('list')
    tracker.record('list')
    const recoveredListSuccess = tracker.checkpoint('list')
    tracker.record('output')

    expect(tracker.clear(staleListSuccess)).toBe(false)
    expect(tracker.clear(recoveredListSuccess)).toBe(false)
    expect(tracker.clear(tracker.checkpoint('output'))).toBe(true)
  })

  it('invalidates old-workspace run and stop errors when the path resets', () => {
    const tracker = createProjectErrorTracker()
    tracker.record('run')
    const oldRunRecovery = tracker.checkpoint('run')
    tracker.reset()

    expect(tracker.clear(oldRunRecovery)).toBe(false)

    tracker.record('stop')
    const oldStopRecovery = tracker.checkpoint('stop')
    tracker.reset()

    expect(tracker.clear(oldStopRecovery)).toBe(false)
  })

  it('suppresses stale task error and finally callbacks after unmount', async () => {
    const guard = createLatestRequestGuard()
    const result = deferred<string>()
    const handlers = {
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onFinally: vi.fn(),
    }

    const task = executeCurrentTask(guard.begin(), () => result.promise, handlers)
    guard.cancel()
    result.reject(new Error('stale'))
    await task

    expect(handlers.onSuccess).not.toHaveBeenCalled()
    expect(handlers.onError).not.toHaveBeenCalled()
    expect(handlers.onFinally).not.toHaveBeenCalled()
  })

  it('allows only the newest retry task to commit', async () => {
    const guard = createLatestRequestGuard()
    const oldResult = deferred<string>()
    const newResult = deferred<string>()
    const commits: string[] = []
    const handlers = {
      onSuccess: (value: string) => commits.push(value),
      onError: vi.fn(),
    }

    const oldTask = executeCurrentTask(guard.begin(), () => oldResult.promise, handlers)
    const newTask = executeCurrentTask(guard.begin(), () => newResult.promise, handlers)
    newResult.resolve('new')
    oldResult.resolve('old')
    await Promise.all([oldTask, newTask])

    expect(commits).toEqual(['new'])
  })

  it('stops action refresh and callbacks when the path changes', async () => {
    const guard = createLatestRequestGuard()
    const action = deferred<void>()
    const refresh = vi.fn()
    const handlers = {
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onFinally: vi.fn(),
    }

    const task = executeCurrentTask(guard.begin(), async (isCurrent) => {
      await action.promise
      if (isCurrent()) await refresh(isCurrent)
    }, handlers)
    guard.cancel()
    action.resolve()
    await task

    expect(refresh).not.toHaveBeenCalled()
    expect(handlers.onSuccess).not.toHaveBeenCalled()
    expect(handlers.onFinally).not.toHaveBeenCalled()
  })

  it('does not continue a stale save from validation into write or callbacks', async () => {
    const guard = createLatestRequestGuard()
    const validation = deferred<void>()
    const write = vi.fn()
    const handlers = {
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onFinally: vi.fn(),
    }

    const task = executeCurrentTask(guard.begin(), async (isCurrent) => {
      await validation.promise
      if (isCurrent()) await write()
    }, handlers)
    guard.cancel()
    validation.resolve()
    await task

    expect(write).not.toHaveBeenCalled()
    expect(handlers.onSuccess).not.toHaveBeenCalled()
    expect(handlers.onFinally).not.toHaveBeenCalled()
  })

  it('installs safe browser fallback parity for Project operations', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    vi.stubGlobal('window', {})

    installElectronApiFallback()

    await expect(window.electron.project.list()).resolves.toEqual({
      success: false,
      error: 'Electron project API is unavailable',
    })
  })
})
