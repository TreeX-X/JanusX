import { describe, expect, it, vi } from 'vitest'
import { createTerminalScrollIntentController } from '../../src/renderer/src/lib/terminal-scroll-intent'

function createTarget(viewportY: number, baseY: number) {
  const normal = { type: 'normal' as const, viewportY, baseY }
  return {
    buffer: { active: normal as { type: 'normal' | 'alternate'; viewportY: number; baseY: number }, normal },
    scrollLines: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollToLine: vi.fn(),
  }
}

describe('terminal scroll intent', () => {
  it('follows output when the user is at the bottom', () => {
    const target = createTarget(100, 100)
    const intent = createTerminalScrollIntentController(target)
    const snapshot = intent.capture()
    target.buffer.active.baseY = 120
    intent.enforce(snapshot)
    expect(target.scrollToBottom).toHaveBeenCalledOnce()
    expect(target.scrollToLine).not.toHaveBeenCalled()
  })

  it('preserves a pinned viewport across output and fit', () => {
    const target = createTarget(42, 100)
    const intent = createTerminalScrollIntentController(target)
    const snapshot = intent.capture()
    target.buffer.active.baseY = 120
    intent.enforce(snapshot)
    expect(target.scrollToLine).toHaveBeenCalledWith(42)
    expect(target.scrollLines.mock.calls).toEqual([[-1], [1]])
  })

  it('lets a user interaction supersede an in-flight output restore', () => {
    const deferred: Array<() => void> = []
    const target = createTarget(100, 100)
    const intent = createTerminalScrollIntentController(target, (callback) => deferred.push(callback))
    const stale = intent.capture()
    target.buffer.active.viewportY = 60
    intent.recordUserScroll()
    deferred.splice(0).forEach((callback) => callback())
    intent.enforce(stale)
    expect(target.scrollToBottom).not.toHaveBeenCalled()
    expect(intent.capture().kind).toBe('pinnedViewport')
  })

  it('does not restore output over an active native scrollbar drag', () => {
    const target = createTarget(100, 100)
    const intent = createTerminalScrollIntentController(target)
    const stale = intent.capture()
    intent.beginUserScroll()
    target.buffer.active.viewportY = 40
    intent.enforce(stale)
    expect(target.scrollToBottom).not.toHaveBeenCalled()

    intent.commitUserScroll()
    expect(intent.capture().kind).toBe('pinnedViewport')
  })

  it('does not impose normal scrollback semantics on alternate buffers', () => {
    const target = createTarget(42, 100)
    const intent = createTerminalScrollIntentController(target)
    target.buffer.active = { type: 'alternate', viewportY: 0, baseY: 0 }
    intent.handleBufferChange('alternate')
    intent.enforceCurrent()
    expect(target.scrollToBottom).not.toHaveBeenCalled()
    expect(target.scrollToLine).not.toHaveBeenCalled()
  })

  it('restores a pinned normal viewport after leaving an alternate buffer', () => {
    const target = createTarget(42, 100)
    const intent = createTerminalScrollIntentController(target)
    target.buffer.active = { type: 'alternate', viewportY: 0, baseY: 0 }
    intent.handleBufferChange('alternate')

    target.buffer.active = target.buffer.normal
    intent.handleBufferChange('normal')

    expect(target.scrollToLine).toHaveBeenCalledWith(42)
    expect(target.scrollToBottom).not.toHaveBeenCalled()
  })
})
