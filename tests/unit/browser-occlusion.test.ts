import { beforeEach, describe, expect, it } from 'vitest'
import { acquireBrowserOcclusion, useBrowserOcclusionStore } from '../../src/renderer/src/stores/browser-occlusion'

describe('browser dialog occlusion', () => {
  beforeEach(() => useBrowserOcclusionStore.setState({ count: 0 }))

  it('keeps views hidden until the last overlapping dialog closes', () => {
    const closeSettings = acquireBrowserOcclusion()
    const closeConfirmation = acquireBrowserOcclusion()
    expect(useBrowserOcclusionStore.getState().count).toBe(2)
    closeConfirmation()
    expect(useBrowserOcclusionStore.getState().count).toBe(1)
    closeConfirmation()
    expect(useBrowserOcclusionStore.getState().count).toBe(1)
    closeSettings()
    expect(useBrowserOcclusionStore.getState().count).toBe(0)
  })
})
