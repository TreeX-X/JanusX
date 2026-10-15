import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceRefreshQueue } from '../../src/renderer/src/features/workspace/refresh-queue'

describe('workspace refresh pressure', () => {
  it('merges 1000 events into one trailing refresh and retains multi-file invalidation', async () => {
    let release!: () => void
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
      .mockResolvedValue(undefined)
    const queue = createWorkspaceRefreshQueue(refresh)
    queue.enqueue('root', 'first.ts')
    for (let i = 0; i < 1000; i++) queue.enqueue('root', `${i}.ts`)
    expect(refresh).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    expect(refresh).toHaveBeenLastCalledWith('root', null)
  })

  it('keeps the newest workspace and drops queued work on disposal', async () => {
    let release!: () => void
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
      .mockResolvedValue(undefined)
    const queue = createWorkspaceRefreshQueue(refresh)
    queue.enqueue('old', null)
    queue.enqueue('old', 'old.ts')
    queue.enqueue('new', 'new.ts')
    release()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    expect(refresh).toHaveBeenLastCalledWith('new', 'new.ts')
    queue.dispose()
    queue.enqueue('new', null)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('continues after a failed refresh', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(undefined)
    const queue = createWorkspaceRefreshQueue(refresh)
    queue.enqueue('root', null)
    queue.enqueue('root', 'next.ts')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  })
})
