import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetTerminalGeometryForTests,
  clearTerminalGeometry,
  getTerminalGeometry,
  registerTerminalForceFit,
  reportTerminalGeometry,
  requestTerminalForceFit,
  requestTerminalForceFitBurst,
  unregisterTerminalForceFit,
  waitForTerminalGeometry,
} from '../../src/renderer/src/lib/terminal-geometry'

describe('terminal-geometry', () => {
  beforeEach(() => {
    __resetTerminalGeometryForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetTerminalGeometryForTests()
  })

  it('reports and reads geometry', () => {
    reportTerminalGeometry('t1', 120.8, 40.2)
    expect(getTerminalGeometry('t1')).toEqual({ cols: 120, rows: 40 })
  })

  it('ignores invalid geometry', () => {
    reportTerminalGeometry('t1', 0, 40)
    reportTerminalGeometry('t1', 80, 0)
    reportTerminalGeometry('t1', Number.NaN, 20)
    expect(getTerminalGeometry('t1')).toBeNull()
  })

  it('resolves wait immediately when geometry already acceptable', async () => {
    reportTerminalGeometry('t1', 100, 30)
    await expect(waitForTerminalGeometry('t1')).resolves.toEqual({ cols: 100, rows: 30 })
  })

  it('waits for geometry that meets min size', async () => {
    const pending = waitForTerminalGeometry('t1', { minCols: 40, minRows: 10, timeoutMs: 500 })

    reportTerminalGeometry('t1', 20, 8)
    await Promise.resolve()
    reportTerminalGeometry('t1', 80, 24)

    await expect(pending).resolves.toEqual({ cols: 80, rows: 24 })
  })

  it('falls back to latest geometry on timeout even below min', async () => {
    const pending = waitForTerminalGeometry('t1', { minCols: 40, minRows: 10, timeoutMs: 200 })
    reportTerminalGeometry('t1', 20, 8)

    await vi.advanceTimersByTimeAsync(200)
    await expect(pending).resolves.toEqual({ cols: 20, rows: 8 })
  })

  it('returns null on timeout when nothing was reported', async () => {
    const pending = waitForTerminalGeometry('t1', { timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toBeNull()
  })

  it('clears geometry and force-fit handlers', () => {
    const handler = vi.fn()
    reportTerminalGeometry('t1', 80, 24)
    registerTerminalForceFit('t1', handler)

    clearTerminalGeometry('t1')
    expect(getTerminalGeometry('t1')).toBeNull()
    requestTerminalForceFit('t1')
    expect(handler).not.toHaveBeenCalled()
  })

  it('invokes registered force-fit and burst', () => {
    const handler = vi.fn()
    registerTerminalForceFit('t1', handler)
    requestTerminalForceFit('t1')
    expect(handler).toHaveBeenCalledTimes(1)

    requestTerminalForceFitBurst('t1', [0, 10])
    vi.advanceTimersByTime(0)
    expect(handler).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(10)
    expect(handler).toHaveBeenCalledTimes(3)

    unregisterTerminalForceFit('t1')
    requestTerminalForceFit('t1')
    expect(handler).toHaveBeenCalledTimes(3)
  })
})
