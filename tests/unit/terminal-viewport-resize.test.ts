import { describe, expect, it, vi } from 'vitest'
import {
  captureTerminalViewport,
  createTerminalRecoveryScheduler,
  finalizeTerminalReplay,
  fitTerminalViewportAndSync,
  hasTerminalGeometryChanged,
  recoverTerminalViewportAndSync,
  restoreTerminalViewport,
  type TerminalGeometrySize,
  type TerminalViewportController,
} from '../../src/renderer/src/lib/terminal-viewport-resize'

function createTerminal(
  type: 'normal' | 'alternate',
  viewportY: number,
  baseY: number,
) {
  const bufferState = { type, viewportY, baseY }
  return {
    buffer: { active: bufferState },
    bufferState,
    cols: 120,
    rows: 40,
    scrollToBottom: vi.fn(),
    scrollToLine: vi.fn(),
  }
}

describe('terminal viewport resize', () => {
  it('keeps a normal buffer following the bottom after fit', () => {
    const terminal = createTerminal('normal', 120, 120)
    const snapshot = captureTerminalViewport(terminal)

    terminal.buffer.active.viewportY = 0
    terminal.buffer.active.baseY = 140
    restoreTerminalViewport(terminal, snapshot)

    expect(terminal.scrollToBottom).toHaveBeenCalledOnce()
    expect(terminal.scrollToLine).not.toHaveBeenCalled()
  })

  it('restores the visible top-line anchor while reading normal-buffer scrollback', () => {
    const terminal = createTerminal('normal', 42, 120)
    const snapshot = captureTerminalViewport(terminal)

    terminal.buffer.active.viewportY = 0
    terminal.buffer.active.baseY = 140
    restoreTerminalViewport(terminal, snapshot)

    expect(terminal.scrollToLine).toHaveBeenCalledWith(42)
    expect(terminal.scrollToBottom).not.toHaveBeenCalled()
  })

  it('does not manipulate the alternate-buffer viewport', () => {
    const terminal = createTerminal('alternate', 0, 0)
    const snapshot = captureTerminalViewport(terminal)

    restoreTerminalViewport(terminal, snapshot)

    expect(terminal.scrollToBottom).not.toHaveBeenCalled()
    expect(terminal.scrollToLine).not.toHaveBeenCalled()
  })

  it('emits geometry only when rows or columns actually change', () => {
    const emitted: TerminalGeometrySize[] = []
    let previous: TerminalGeometrySize | null = null

    for (const next of [
      { cols: 120, rows: 40 },
      { cols: 120, rows: 40 },
      { cols: 120, rows: 32 },
      { cols: 120, rows: 32 },
    ]) {
      if (!hasTerminalGeometryChanged(previous, next)) continue
      emitted.push(next)
      previous = next
    }

    expect(emitted).toEqual([
      { cols: 120, rows: 40 },
      { cols: 120, rows: 32 },
    ])
  })

  it('coalesces repeated signals into the latest callback after two frames', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    const scheduler = createTerminalRecoveryScheduler(requestFrame, (id) => frames.delete(id))
    const stale = vi.fn()
    const latest = vi.fn()

    scheduler.schedule(stale)
    scheduler.schedule(latest)
    expect(requestFrame).toHaveBeenCalledOnce()
    frames.get(1)?.(0)
    frames.delete(1)
    expect(latest).not.toHaveBeenCalled()
    frames.get(2)?.(16)

    expect(stale).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
  })

  it('cancels a pending recovery before teardown', () => {
    const frames = new Map<number, FrameRequestCallback>()
    const callback = vi.fn()
    const scheduler = createTerminalRecoveryScheduler(
      (frame) => { frames.set(1, frame); return 1 },
      (id) => frames.delete(id),
    )

    scheduler.schedule(callback)
    scheduler.cancel()
    frames.get(1)?.(0)

    expect(callback).not.toHaveBeenCalled()
  })

  it.each([
    ['bottom', 'normal' as const, 120, 120, 'bottom'],
    ['scrollback', 'normal' as const, 42, 120, 'line'],
    ['alternate buffer', 'alternate' as const, 0, 0, 'none'],
  ])(
    'runs the production fit coordinator in order for %s',
    (_, type, viewportY, baseY, expectedScroll) => {
      const terminal = createTerminal(type, viewportY, baseY)
      const order: string[] = []
      const fit = vi.fn(() => {
        order.push('fit')
        terminal.bufferState.viewportY = 0
      })
      terminal.scrollToBottom.mockImplementation(() => order.push('scroll-bottom'))
      terminal.scrollToLine.mockImplementation(() => order.push('scroll-line'))
      const resizePty = vi.fn(() => order.push('resize'))

      Object.defineProperty(terminal.buffer, 'active', {
        configurable: true,
        get() {
          order.push('capture-or-restore')
          return { type, viewportY: terminal.bufferState.viewportY, baseY }
        },
      })

      const result = fitTerminalViewportAndSync({
        terminal: terminal as TerminalViewportController,
        fit,
        previousGeometry: null,
        reportGeometry: vi.fn(),
        resizePty,
      })

      expect(result.geometry).toEqual({ cols: 120, rows: 40 })
      expect(order.indexOf('capture-or-restore')).toBeLessThan(order.indexOf('fit'))
      expect(order.lastIndexOf('capture-or-restore')).toBeGreaterThan(order.indexOf('fit'))
      if (expectedScroll === 'bottom') {
        expect(terminal.scrollToBottom).toHaveBeenCalledOnce()
        expect(terminal.scrollToLine).not.toHaveBeenCalled()
      } else if (expectedScroll === 'line') {
        expect(terminal.scrollToLine).toHaveBeenCalledWith(42)
        expect(terminal.scrollToBottom).not.toHaveBeenCalled()
      } else {
        expect(terminal.scrollToBottom).not.toHaveBeenCalled()
        expect(terminal.scrollToLine).not.toHaveBeenCalled()
      }
      const restoreIndex = Math.max(order.indexOf('scroll-bottom'), order.indexOf('scroll-line'))
      if (restoreIndex >= 0) expect(order.indexOf('fit')).toBeLessThan(restoreIndex)
      expect(Math.max(restoreIndex, order.lastIndexOf('capture-or-restore'))).toBeLessThan(
        order.indexOf('resize'),
      )
    },
  )

  it('deduplicates unchanged mount, force, and replay fits but syncs changed rows', () => {
    const terminal = createTerminal('normal', 120, 120)
    const resizePty = vi.fn()
    let previousGeometry: TerminalGeometrySize | null = null

    const runFit = () => {
      const result = fitTerminalViewportAndSync({
        terminal,
        fit: vi.fn(),
        previousGeometry,
        reportGeometry: vi.fn(),
        resizePty,
      })
      if (result.sizeChanged) previousGeometry = result.geometry
    }

    runFit() // mount
    runFit() // force-fit burst
    runFit() // replay catch-up
    expect(resizePty).toHaveBeenCalledTimes(1)
    expect(resizePty).toHaveBeenLastCalledWith(120, 40)

    terminal.rows = 32
    runFit()
    expect(resizePty).toHaveBeenCalledTimes(2)
    expect(resizePty).toHaveBeenLastCalledWith(120, 32)
  })

  it.each(['normal', 'alternate'] as const)(
    'refreshes a visible unchanged %s buffer without resizing the PTY',
    (bufferType) => {
      const atBottom = bufferType === 'normal' ? 120 : 0
      const terminal = createTerminal(bufferType, atBottom, atBottom)
      const fit = vi.fn()
      const refresh = vi.fn()
      const resizePty = vi.fn()
      const result = recoverTerminalViewportAndSync({
        visible: true,
        hostWidth: 800,
        hostHeight: 500,
        terminal,
        fit,
        refresh,
        previousGeometry: { cols: 120, rows: 40 },
        reportGeometry: vi.fn(),
        resizePty,
      })

      expect(result.sizeChanged).toBe(false)
      expect(fit).toHaveBeenCalledOnce()
      expect(refresh).toHaveBeenCalledWith(0, 39)
      expect(resizePty).not.toHaveBeenCalled()
    },
  )

  it('does no work while hidden or when the host is degenerate', () => {
    const terminal = createTerminal('normal', 0, 0)
    const fit = vi.fn()
    const refresh = vi.fn()
    const options = {
      visible: false,
      hostWidth: 800,
      hostHeight: 500,
      terminal,
      fit,
      refresh,
      previousGeometry: null,
      reportGeometry: vi.fn(),
      resizePty: vi.fn(),
    }
    recoverTerminalViewportAndSync(options)
    recoverTerminalViewportAndSync({ ...options, visible: true, hostWidth: 1 })

    expect(fit).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('uses one replay finalization path for input release, flushing, and recovery', () => {
    const order: string[] = []
    finalizeTerminalReplay({
      releaseInput: () => order.push('release'),
      markReady: () => order.push('ready'),
      flushLiveOutput: () => order.push('flush'),
      scheduleRecovery: () => order.push('recover'),
    })

    expect(order).toEqual(['release', 'ready', 'flush', 'recover'])
  })
})
