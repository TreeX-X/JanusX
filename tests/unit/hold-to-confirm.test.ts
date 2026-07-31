import { describe, expect, it, vi } from 'vitest'
import { createHoldToConfirmController, isHoldConfirmKey } from '../../src/renderer/src/lib/hold-to-confirm'

describe('hold-to-confirm controller', () => {
  it('confirms only after the full hold duration', () => {
    vi.useFakeTimers()
    const onConfirm = vi.fn()
    const controller = createHoldToConfirmController({
      durationMs: 1000, onStart: vi.fn(), onCancel: vi.fn(), onConfirm,
    })

    controller.start()
    vi.advanceTimersByTime(999)
    expect(onConfirm).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onConfirm).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('cancels a partial hold without confirming', () => {
    vi.useFakeTimers()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const controller = createHoldToConfirmController({
      durationMs: 1000, onStart: vi.fn(), onCancel, onConfirm,
    })

    controller.start()
    vi.advanceTimersByTime(500)
    controller.cancel()
    vi.advanceTimersByTime(500)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('silently clears a pending hold when the control is removed', () => {
    vi.useFakeTimers()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const controller = createHoldToConfirmController({
      durationMs: 1000, onStart: vi.fn(), onCancel, onConfirm,
    })

    controller.start()
    controller.dispose()
    vi.advanceTimersByTime(1000)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('accepts only the standard keyboard activation keys', () => {
    expect(isHoldConfirmKey('Enter')).toBe(true)
    expect(isHoldConfirmKey(' ')).toBe(true)
    expect(isHoldConfirmKey('Escape')).toBe(false)
  })
})
