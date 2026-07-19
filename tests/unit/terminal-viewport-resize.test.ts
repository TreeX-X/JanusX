import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureTerminalViewport,
  createLatestTimeoutScheduler,
  fitTerminalViewportAndSync,
  hasTerminalGeometryChanged,
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
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

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

  it('replaces a pending transition catch-up instead of accumulating timers', () => {
    const scheduler = createLatestTimeoutScheduler()
    const stale = vi.fn()
    const latest = vi.fn()
    const stable = vi.fn()

    scheduler.schedule('transition-catch-up', 220, stale)
    scheduler.schedule('transition-catch-up', 220, latest)
    scheduler.schedule('transition-stable', 420, stable)

    vi.advanceTimersByTime(220)
    expect(stale).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
    expect(stable).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(stable).toHaveBeenCalledOnce()
    scheduler.clear()
  })

  it('clears every pending callback before teardown', () => {
    const scheduler = createLatestTimeoutScheduler()
    const mount = vi.fn()
    const replay = vi.fn()

    scheduler.schedule('mount:50', 50, mount)
    scheduler.schedule('replay:120', 120, replay)
    scheduler.clear()
    vi.runAllTimers()

    expect(mount).not.toHaveBeenCalled()
    expect(replay).not.toHaveBeenCalled()
  })

  it('keeps distinct mount, replay, and transition timers independent', () => {
    const scheduler = createLatestTimeoutScheduler()
    const mount = vi.fn()
    const replay = vi.fn()
    const transition = vi.fn()

    scheduler.schedule('mount:50', 50, mount)
    scheduler.schedule('replay:120', 120, replay)
    scheduler.schedule('transition:stable', 420, transition)
    vi.runAllTimers()

    expect(mount).toHaveBeenCalledOnce()
    expect(replay).toHaveBeenCalledOnce()
    expect(transition).toHaveBeenCalledOnce()
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
})
