import { describe, expect, it } from 'vitest'
import {
  createTerminalWheelDistanceState,
  resolveTerminalTuiWheelReports,
} from '../../src/renderer/src/lib/terminal-tui-wheel'

describe('terminal TUI wheel distance', () => {
  it('carries fractional trackpad movement between events', () => {
    const state = createTerminalWheelDistanceState()
    expect(resolveTerminalTuiWheelReports({ deltaY: 5, deltaMode: 0 }, state, 20)).toBe(0)
    expect(resolveTerminalTuiWheelReports({ deltaY: 15, deltaMode: 0 }, state, 20)).toBe(1)
  })

  it('maps line and page deltas to bounded terminal reports', () => {
    const state = createTerminalWheelDistanceState()
    expect(resolveTerminalTuiWheelReports({ deltaY: 3, deltaMode: 1 }, state)).toBe(2)
    expect(resolveTerminalTuiWheelReports({ deltaY: 1, deltaMode: 2 }, state, 16, 40)).toBeLessThanOrEqual(9)
  })

  it('drops fractional momentum when direction changes', () => {
    const state = createTerminalWheelDistanceState()
    resolveTerminalTuiWheelReports({ deltaY: 10, deltaMode: 0 }, state, 16)
    expect(resolveTerminalTuiWheelReports({ deltaY: -8, deltaMode: 0 }, state, 16)).toBe(0)
  })
})
