import { describe, expect, it } from 'vitest'
import { shouldSuppressIslandDismiss } from '../../../src/renderer/src/components/janus/islandInteraction'

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
