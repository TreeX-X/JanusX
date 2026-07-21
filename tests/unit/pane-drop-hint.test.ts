import { describe, expect, it } from 'vitest'
import { getPaneDropHint, paneDropHintLabel, SPLIT_RATIO_EQUAL } from '../../src/renderer/src/lib/pane-drop-hint'

function fakeElement(width: number, height: number, left = 0, top = 0): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    }),
  } as HTMLElement
}

describe('getPaneDropHint', () => {
  /*-- 700x420 pane：zoneX = min(max(196, 56), 320) = 196，zoneY = min(max(117.6, 56), 320) ≈ 117.6 --*/
  const pane = fakeElement(700, 420)

  it('triggers left/right split zones generously (28% of width, min 56px)', () => {
    expect(getPaneDropHint(pane, 100, 300)).toBe('left')
    expect(getPaneDropHint(pane, 196, 300)).toBe('left')
    expect(getPaneDropHint(pane, 197, 300)).toBe('center')
    expect(getPaneDropHint(pane, 700 - 100, 300)).toBe('right')
    expect(getPaneDropHint(pane, 700 - 196, 300)).toBe('right')
    expect(getPaneDropHint(pane, 700 - 197, 300)).toBe('center')
  })

  it('triggers top/bottom zones below the tab strip', () => {
    expect(getPaneDropHint(pane, 350, 100)).toBe('top')
    expect(getPaneDropHint(pane, 350, 420 - 100)).toBe('bottom')
    expect(getPaneDropHint(pane, 350, 210)).toBe('center')
  })

  it('treats the tab strip as merge zone to avoid accidental top splits', () => {
    expect(getPaneDropHint(pane, 350, 10)).toBe('center')
    expect(getPaneDropHint(pane, 350, 36)).toBe('center')
  })

  it('prefers left/right over top/bottom in corners', () => {
    expect(getPaneDropHint(pane, 50, 60)).toBe('left')
    expect(getPaneDropHint(pane, 700 - 50, 60)).toBe('right')
  })

  it('keeps a usable zone on small panes via the 56px floor', () => {
    const small = fakeElement(160, 120)
    /*-- 28% = 44.8px < 56px 下限 → zoneX = 56；120px 高时上下 zone 各 56，仅 y∈(56,64) 为 center --*/
    expect(getPaneDropHint(small, 50, 80)).toBe('left')
    expect(getPaneDropHint(small, 70, 60)).toBe('center')
    expect(getPaneDropHint(small, 70, 80)).toBe('bottom')
  })

  it('labels each hint', () => {
    expect(paneDropHintLabel('left')).toBe('左右分屏')
    expect(paneDropHintLabel('right')).toBe('左右分屏')
    expect(paneDropHintLabel('top')).toBe('上下分屏')
    expect(paneDropHintLabel('bottom')).toBe('上下分屏')
    expect(paneDropHintLabel('center')).toBe('合并到此面板')
  })

  it('uses a fixed equal split ratio for edge drops (preview equals result)', () => {
    expect(SPLIT_RATIO_EQUAL).toBe(0.5)
  })
})
