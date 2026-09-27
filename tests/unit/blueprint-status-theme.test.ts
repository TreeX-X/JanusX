import { describe, expect, it } from 'vitest'
import { getBlueprintStatusVisual, STATUS_VISUALS } from '../../src/renderer/src/components/blueprint/blueprintStatus'

describe('blueprint status visuals (theme-aware)', () => {
  it('keeps dark values byte-identical to the legacy snapshot', () => {
    expect(getBlueprintStatusVisual('in-progress', 'dark')).toEqual(STATUS_VISUALS['in-progress'])
    expect(getBlueprintStatusVisual('done', 'dark').color).toBe('#d7d7db')
    expect(getBlueprintStatusVisual('unknown-status' as never, 'dark').color)
      .toBe(STATUS_VISUALS['not-started'].color)
  })

  it('maps paper-readable colors on light bases without new call sites', () => {
    expect(getBlueprintStatusVisual('in-progress', 'planche').color).toBe('#D43D2A')
    expect(getBlueprintStatusVisual('done', 'planche').color).toBe('#2E6B5E')
    expect(getBlueprintStatusVisual('blocked', 'planche').color).toBe('#1C343B')
    // labels stay identical across themes (only color adapts)
    expect(getBlueprintStatusVisual('done', 'planche').labelKey).toBe(STATUS_VISUALS.done.labelKey)
    // 未知主题回落默认（石板色浅底），取纸面 not-started
    expect(getBlueprintStatusVisual('nope' as never, 'unknown').color).toBe('rgba(28, 52, 59, 0.38)')
  })
})
