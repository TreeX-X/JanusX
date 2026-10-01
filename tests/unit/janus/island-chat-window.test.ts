import { describe, expect, it } from 'vitest'
import {
  clampIslandDragOffset,
  ISLAND_DRAG_KEEP_X,
  shouldSuppressIslandDismiss,
} from '../../../src/renderer/src/components/janus/islandInteraction'

describe('clampIslandDragOffset', () => {
  const viewport = { width: 1280, height: 720 }

  it('keeps small offsets untouched', () => {
    expect(clampIslandDragOffset({ x: 120, y: 60 }, viewport)).toEqual({ x: 120, y: 60 })
  })

  it('falls back to conservative centered bounds without a panel size', () => {
    expect(clampIslandDragOffset({ x: 900, y: 0 }, viewport)).toEqual({ x: 500, y: 0 })
    expect(clampIslandDragOffset({ x: -900, y: 0 }, viewport)).toEqual({ x: -500, y: 0 })
    expect(clampIslandDragOffset({ x: 0, y: 900 }, viewport)).toEqual({ x: 0, y: 580 })
    expect(clampIslandDragOffset({ x: 0, y: -40 }, viewport)).toEqual({ x: 0, y: -8 })
  })

  it('lets a measured panel dock against the viewport edges', () => {
    const panel = { width: 880, height: 560 }
    const maxX = 1280 / 2 + 880 / 2 - ISLAND_DRAG_KEEP_X
    // Fully-visible right dock (left edge at 1280 - 880 - 24) stays put.
    expect(clampIslandDragOffset({ x: 376, y: 0 }, viewport, panel)).toEqual({ x: 376, y: 0 })
    // Beyond the grab strip it clamps; mirrored on the left.
    expect(clampIslandDragOffset({ x: 2000, y: 0 }, viewport, panel)).toEqual({ x: maxX, y: 0 })
    expect(clampIslandDragOffset({ x: -2000, y: 0 }, viewport, panel)).toEqual({ x: -maxX, y: 0 })
    // Vertical travel keeps the topbar reachable.
    expect(clampIslandDragOffset({ x: 0, y: 900 }, viewport, panel)).toEqual({ x: 0, y: 720 - 12 - 64 })
  })

  it('resets non-finite or viewport-less offsets to centered', () => {
    expect(clampIslandDragOffset({ x: Number.NaN, y: 10 }, viewport)).toEqual({ x: 0, y: 0 })
    expect(clampIslandDragOffset({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('shouldSuppressIslandDismiss', () => {
  it('suppresses implicit dismiss for a pinned expanded island in any view', () => {
    expect(shouldSuppressIslandDismiss({ stage: 'expanded', islandPinned: true })).toBe(true)
  })

  it('lets every other stage/pin combination collapse', () => {
    expect(shouldSuppressIslandDismiss({ stage: 'expanded', islandPinned: false })).toBe(false)
    expect(shouldSuppressIslandDismiss({ stage: 'peek', islandPinned: true })).toBe(false)
    expect(shouldSuppressIslandDismiss({ stage: 'collapsed', islandPinned: true })).toBe(false)
  })
})
