import { describe, expect, it } from 'vitest'
import {
  getEstimatedContextWindow,
  getRegistryContextWindow,
  stabilizeContextTokens,
} from '../../src/renderer/src/lib/runtime-telemetry'

describe('runtime telemetry model context lookup', () => {
  it('uses the model registry before heuristic estimates', () => {
    expect(getRegistryContextWindow('gpt-5.5')).toBe(1_050_000)
    expect(getEstimatedContextWindow('codex', 'GPT-5.5')).toBe(1_050_000)
  })

  it('keeps context usage stable when partial telemetry reports a smaller value', () => {
    expect(stabilizeContextTokens(undefined, 24_000)).toBe(24_000)
    expect(stabilizeContextTokens(24_000, 31_000)).toBe(31_000)
    expect(stabilizeContextTokens(31_000, 8_000)).toBe(31_000)
  })
})
