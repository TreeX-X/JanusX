import { describe, expect, it, vi } from 'vitest'
import { workbenchPhaseReducer } from '../../../src/renderer/src/components/shared/CardFrame'

describe('workbenchPhaseReducer (shared card-frame lifecycle)', () => {
  it('opens from hidden and closes on request or parent close', () => {
    expect(workbenchPhaseReducer('hidden', { type: 'open' })).toBe('open')
    expect(workbenchPhaseReducer('open', { type: 'request-close' })).toBe('closing')
    expect(workbenchPhaseReducer('open', { type: 'parent-closed' })).toBe('closing')
  })

  it('emits hidden exactly once when the exit finishes', () => {
    const onHidden = vi.fn()
    expect(workbenchPhaseReducer('closing', { type: 'exit-finished' }, { onHidden })).toBe('hidden')
    expect(onHidden).toHaveBeenCalledTimes(1)
  })

  it('ignores exit-finished unless closing', () => {
    const onHidden = vi.fn()
    expect(workbenchPhaseReducer('open', { type: 'exit-finished' }, { onHidden })).toBe('open')
    expect(workbenchPhaseReducer('hidden', { type: 'exit-finished' }, { onHidden })).toBe('hidden')
    expect(onHidden).not.toHaveBeenCalled()
  })

  it('reopening while closing returns to open without emitting hidden', () => {
    const onHidden = vi.fn()
    const events = { onHidden }
    expect(workbenchPhaseReducer('closing', { type: 'open' }, events)).toBe('open')
    expect(workbenchPhaseReducer('closing', { type: 'parent-closed' }, events)).toBe('closing')
    expect(onHidden).not.toHaveBeenCalled()
  })

  it('request-close on hidden stays hidden', () => {
    expect(workbenchPhaseReducer('hidden', { type: 'request-close' })).toBe('hidden')
  })
})
