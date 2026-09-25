import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessChangedEvent } from '../../src/shared/ipc/harness'
const mocks = vi.hoisted(() => ({
  callback: null as null | ((event: HarnessChangedEvent) => void),
  off: vi.fn(), load: vi.fn(), set: vi.fn(), current: 'graph', loading: null as string | null,
  checkouts: [] as Array<{ path: string }>,
}))
vi.mock('@/services/harness', () => ({ onHarnessChanged: (callback: typeof mocks.callback) => { mocks.callback = callback; return mocks.off } }))
vi.mock('@/stores/blueprint', () => ({ useBlueprintStore: {
  getState: () => ({ currentBlueprint: { id: mocks.current, composition: { checkouts: mocks.checkouts } }, loadBlueprint: mocks.load, loadingBlueprintId: mocks.loading }),
  setState: mocks.set,
} }))
import { subscribeNoteRefresh } from '../../src/renderer/src/components/blueprint/useNoteRefresh'
let stop: (() => void) | undefined
const send = (root = 'C:/work/notes', error?: string): void => { mocks.callback?.({ root, rev: 1, kinds: [], error }) }
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', new EventTarget())
  vi.clearAllMocks()
  mocks.current = 'graph'; mocks.loading = null; mocks.load.mockResolvedValue(undefined)
  mocks.checkouts = []
})
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
describe('mounted Note view refresh', () => {
  it('refreshes the architecture graph when an explicitly bound checkout changes', async () => {
    mocks.checkouts = [{ path: 'C:/work/dependency' }]
    stop = subscribeNoteRefresh('graph', 'C:/work/notes')
    send('C:/work/dependency'); await vi.advanceTimersByTimeAsync(160)
    expect(mocks.load).toHaveBeenCalledWith('graph')
  })
  it('coalesces bursts, normalizes checkout spelling, and ignores other roots', async () => {
    stop = subscribeNoteRefresh('graph', 'c:/work/notes/')
    send('C:/work/other'); await vi.advanceTimersByTimeAsync(160)
    expect(mocks.load).not.toHaveBeenCalled()
    send('C:\work\notes'); send(); send()
    await vi.advanceTimersByTimeAsync(160)
    expect(mocks.load).toHaveBeenCalledTimes(1)
    expect(mocks.load).toHaveBeenCalledWith('graph')
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(160)
    expect(mocks.load).toHaveBeenCalledTimes(2)
  })
  it('replays invalidation received during a load and during an existing store load', async () => {
    let complete!: () => void
    mocks.load.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve }))
    stop = subscribeNoteRefresh('graph', 'C:/work/notes')
    send(); await vi.advanceTimersByTimeAsync(160)
    send(); await vi.advanceTimersByTimeAsync(160)
    expect(mocks.load).toHaveBeenCalledTimes(1)
    complete(); await vi.advanceTimersByTimeAsync(1)
    expect(mocks.load).toHaveBeenCalledTimes(2)
    mocks.loading = 'graph'
    mocks.load.mockImplementationOnce(async () => { mocks.loading = null })
    send(); await vi.advanceTimersByTimeAsync(160)
    expect(mocks.load).toHaveBeenCalledTimes(4)
  })
  it('surfaces watcher errors, avoids switching views, and cleans up pending refresh', async () => {
    stop = subscribeNoteRefresh('graph', 'C:/work/notes')
    send(undefined, 'read failed')
    expect(mocks.set).toHaveBeenCalledWith({ error: 'read failed', loadState: 'error' })
    mocks.current = 'other'
    send(); await vi.advanceTimersByTimeAsync(160)
    expect(mocks.load).not.toHaveBeenCalled()
    mocks.current = 'graph'
    send(); stop(); stop = undefined
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(160)
    expect(mocks.off).toHaveBeenCalledOnce()
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
