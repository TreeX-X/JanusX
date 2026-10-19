import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXTERNAL_SESSION_SYNC_MS, startExternalSessionSync } from '../../src/renderer/src/lib/external-session-sync'

afterEach(() => vi.useRealTimers())

function surface() {
  const target = new EventTarget()
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  return Object.assign(target, { document }) as unknown as Pick<Window, 'document' | 'addEventListener' | 'removeEventListener'>
}

describe('visible external session sync', () => {
  it('keeps the polling deadline across inactive tab switches without scanning hidden panels', async () => {
    vi.useFakeTimers()
    const target = surface()
    let active = true
    const scan = vi.fn().mockResolvedValue(undefined)
    const stop = startExternalSessionSync(scan, target, () => active)
    await vi.advanceTimersByTimeAsync(120)
    expect(scan).toHaveBeenCalledTimes(1)
    for (let cycle = 0; cycle < 8; cycle++) {
      active = false
      await vi.advanceTimersByTimeAsync(40)
      active = true
      await vi.advanceTimersByTimeAsync(160)
    }
    expect(scan).toHaveBeenCalledTimes(1)
    active = false
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS)
    target.dispatchEvent(new Event('focus'))
    expect(scan).toHaveBeenCalledTimes(1)
    active = true
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS)
    expect(scan).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS)
    expect(scan).toHaveBeenCalledTimes(2)
  })

  it('polls without overlap, wakes on focus and stops even with a pending request', async () => {
    vi.useFakeTimers()
    const target = surface()
    let finish!: () => void
    const scan = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const stop = startExternalSessionSync(scan, target)
    await vi.advanceTimersByTimeAsync(120)
    expect(scan).toHaveBeenCalledTimes(1)
    target.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS * 2)
    expect(scan).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS)
    expect(scan).toHaveBeenCalledTimes(2)
    stop()
    finish()
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS * 2)
    target.dispatchEvent(new Event('focus'))
    expect(scan).toHaveBeenCalledTimes(2)
  })

  it('pauses hidden windows and retries failed requests after becoming visible', async () => {
    vi.useFakeTimers()
    const target = surface()
    Object.defineProperty(target.document, 'visibilityState', { value: 'hidden', configurable: true })
    const scan = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue(undefined)
    const stop = startExternalSessionSync(scan, target)
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS * 2)
    expect(scan).not.toHaveBeenCalled()
    Object.defineProperty(target.document, 'visibilityState', { value: 'visible', configurable: true })
    target.document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(scan).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(EXTERNAL_SESSION_SYNC_MS)
    expect(scan).toHaveBeenCalledTimes(2)
    stop()
  })
})
