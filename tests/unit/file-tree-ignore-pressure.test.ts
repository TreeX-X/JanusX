import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))

describe('file tree git process pressure', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); mocks.spawn.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  function child() {
    const process = Object.assign(new EventEmitter(), {
      pid: 123, stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
      stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }), kill: vi.fn(),
    })
    return process
  }

  it('batches 100 directories for a workspace into one git invocation', async () => {
    const git = child()
    mocks.spawn.mockReturnValue(git)
    const { getGitIgnoredPaths } = await import('../../src/main/ipc/file-tree-ignore')
    const pending = Array.from({ length: 100 }, (_, i) => getGitIgnoredPaths('root', [`dir${i}/file`]))
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    expect(git.stdin.end.mock.calls[0][0].split('\0').filter(Boolean)).toHaveLength(100)
    git.stdout.emit('data', 'dir3/file\0')
    git.emit('close', 0)
    const results = await Promise.all(pending)
    expect(results[3].has('dir3/file')).toBe(true)
  })

  it('limits independent workspaces to two active git checks', async () => {
    const children = Array.from({ length: 5 }, child)
    children.forEach(git => mocks.spawn.mockReturnValueOnce(git))
    const { getGitIgnoredPaths } = await import('../../src/main/ipc/file-tree-ignore')
    const pending = children.map((_, i) => getGitIgnoredPaths(`root${i}`, ['file']))
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.spawn).toHaveBeenCalledTimes(2)
    children[0].emit('close', 1)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.spawn).toHaveBeenCalledTimes(3)
    children[1].emit('close', 1)
    children[2].emit('close', 1)
    await vi.advanceTimersByTimeAsync(0)
    children[3].emit('close', 1)
    children[4].emit('close', 1)
    await Promise.all(pending)
  })

  it('times out a stalled check and terminates its Windows process tree', async () => {
    const git = child()
    mocks.spawn.mockReturnValue(git)
    const { getGitIgnoredPaths } = await import('../../src/main/ipc/file-tree-ignore')
    const pending = getGitIgnoredPaths('root', ['file'])
    await vi.advanceTimersByTimeAsync(3001)
    expect(await pending).toEqual(new Set())
    if (process.platform === 'win32') expect(mocks.spawn).toHaveBeenCalledWith('taskkill',
      ['/pid', '123', '/t', '/f'], expect.objectContaining({ windowsHide: true }))
    else expect(git.kill).toHaveBeenCalledWith('SIGKILL')
  })
})
