import { describe, expect, it } from 'vitest'
import { getContextPopoverPosition } from '../../src/renderer/src/components/context-popover-position'

const popover = { width: 270, height: 160 }
const viewport = { width: 1000, height: 700 }

describe('context popover anchor position', () => {
  it('centers above the hovered trigger when space is available', () => {
    expect(getContextPopoverPosition(
      { top: 300, bottom: 320, left: 400, width: 100 },
      popover,
      viewport,
    )).toEqual({ top: 132, left: 315, placement: 'above' })
  })

  it('opens below a trigger near the top edge', () => {
    expect(getContextPopoverPosition(
      { top: 20, bottom: 40, left: 400, width: 100 },
      popover,
      viewport,
    )).toEqual({ top: 48, left: 315, placement: 'below' })
  })

  it('clamps horizontally at both viewport edges', () => {
    expect(getContextPopoverPosition(
      { top: 300, bottom: 320, left: 0, width: 20 },
      popover,
      viewport,
    ).left).toBe(8)
    expect(getContextPopoverPosition(
      { top: 300, bottom: 320, left: 980, width: 20 },
      popover,
      viewport,
    ).left).toBe(722)
  })

  it('chooses the roomier side and vertically clamps when neither side fits', () => {
    expect(getContextPopoverPosition(
      { top: 100, bottom: 120, left: 400, width: 100 },
      { width: 270, height: 600 },
      viewport,
    )).toEqual({ top: 92, left: 315, placement: 'below' })
  })
})
