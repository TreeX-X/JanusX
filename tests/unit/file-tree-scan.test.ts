import { describe, expect, it } from 'vitest'
import {
  resolveScanDurationMs,
  SCAN_BASE_MS,
  SCAN_MAX_MS,
} from '@/components/file-tree/scan-timing'

describe('resolveScanDurationMs', () => {
  it('keeps the tuned base duration for a tree that fits one viewport', () => {
    expect(resolveScanDurationMs(764, 764)).toBe(SCAN_BASE_MS)
    // .tree carries min-height:100%, so a short tree still measures at one viewport
    expect(resolveScanDurationMs(752, 764)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(400, 764)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(1, 764)).toBe(SCAN_BASE_MS)
  })

  it('scales with content height so the sweep speed stays constant', () => {
    const one = resolveScanDurationMs(764, 764)
    const half = resolveScanDurationMs(1146, 764)
    const two = resolveScanDurationMs(1528, 764)
    expect(half / one).toBeCloseTo(1.5, 5)
    expect(two / one).toBeCloseTo(2, 5)
  })

  it('holds the same speed per pixel of tree', () => {
    const pxPerMs = (content: number) => content / resolveScanDurationMs(content, 764)
    expect(pxPerMs(1146)).toBeCloseTo(pxPerMs(764), 5)
    expect(pxPerMs(1528)).toBeCloseTo(pxPerMs(764), 5)
  })

  it('starts capping only past the ceiling', () => {
    // 2600ms of base speed covers this much tree; below it nothing is capped
    const uncappedCeiling = (SCAN_MAX_MS / SCAN_BASE_MS) * 764
    expect(resolveScanDurationMs(Math.floor(uncappedCeiling), 764)).toBeLessThanOrEqual(SCAN_MAX_MS)
    expect(resolveScanDurationMs(Math.floor(uncappedCeiling), 764)).toBeGreaterThan(SCAN_BASE_MS)
    expect(resolveScanDurationMs(Math.ceil(uncappedCeiling) + 1, 764)).toBe(SCAN_MAX_MS)
  })

  it('caps the duration so a deep tree cannot stall the reveal', () => {
    expect(resolveScanDurationMs(20000, 764)).toBe(SCAN_MAX_MS)
    expect(resolveScanDurationMs(100000, 764)).toBe(SCAN_MAX_MS)
    // capped trees still sweep faster than the base speed, never slower
    expect(20000 / SCAN_MAX_MS).toBeGreaterThan(764 / SCAN_BASE_MS)
  })

  it('falls back to the base duration on unusable measurements', () => {
    expect(resolveScanDurationMs(Number.NaN, 764)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(764, Number.NaN)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(0, 764)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(764, 0)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(-10, 764)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(764, -10)).toBe(SCAN_BASE_MS)
    expect(resolveScanDurationMs(Number.POSITIVE_INFINITY, 764)).toBe(SCAN_BASE_MS)
  })
})
