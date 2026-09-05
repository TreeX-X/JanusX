import { describe, expect, it, vi } from 'vitest'
import { animatedOpenReducer, workbenchPhaseReducer } from '../../../src/renderer/src/components/shared/CardFrame'

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

describe('animatedOpenReducer (side-panel enter/exit without unmount pop)', () => {
  it('mounts hidden on open and shows on rAF', () => {
    const mounted = animatedOpenReducer({ rendered: false, visible: false }, { type: 'open' })
    expect(mounted).toEqual({ rendered: true, visible: false })
    expect(animatedOpenReducer(mounted, { type: 'opened' })).toEqual({ rendered: true, visible: true })
  })

  it('close only hides; unmount waits for exit-finished', () => {
    const hiding = animatedOpenReducer({ rendered: true, visible: true }, { type: 'close' })
    expect(hiding).toEqual({ rendered: true, visible: false })
    expect(animatedOpenReducer(hiding, { type: 'exit-finished' })).toEqual({ rendered: false, visible: false })
  })

  it('reopening mid-exit snaps back to visible without unmounting', () => {
    expect(animatedOpenReducer({ rendered: true, visible: false }, { type: 'open' })).toEqual({
      rendered: true,
      visible: true,
    })
  })

  it('exit-finished while visible and actions while hidden are no-ops', () => {
    expect(animatedOpenReducer({ rendered: true, visible: true }, { type: 'exit-finished' })).toEqual({
      rendered: true,
      visible: true,
    })
    expect(animatedOpenReducer({ rendered: false, visible: false }, { type: 'close' })).toEqual({
      rendered: false,
      visible: false,
    })
    expect(animatedOpenReducer({ rendered: false, visible: false }, { type: 'opened' })).toEqual({
      rendered: false,
      visible: false,
    })
  })
})
