import { describe, expect, it } from 'vitest'
import {
  getEstimatedContextWindow,
  getRegistryContextWindow,
  mergeRuntimeTelemetrySnapshot,
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

  it('lets history telemetry advance context after an initial value exists', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        updatedAt: 1_000,
        contextTokens: 24_000,
        inputTokens: 12_000,
        outputTokens: 3_000,
      },
      {
        updatedAt: 1_500,
        contextTokens: 31_000,
        inputTokens: 16_000,
        outputTokens: 4_000,
      },
      'history'
    )).toEqual({
      updatedAt: 1_500,
      contextTokens: 31_000,
      inputTokens: 16_000,
      outputTokens: 4_000,
    })
  })

  it('does not regress context from a lower history snapshot', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        updatedAt: 1_000,
        contextTokens: 31_000,
        inputTokens: 16_000,
        outputTokens: 4_000,
      },
      {
        updatedAt: 900,
        contextTokens: 8_000,
        inputTokens: 4_000,
        outputTokens: 1_000,
      },
      'history'
    )).toEqual({})
  })

  it('refreshes input and output tokens from newer history without lowering context', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        updatedAt: 1_000,
        contextTokens: 31_000,
        inputTokens: 16_000,
        outputTokens: 4_000,
      },
      {
        updatedAt: 1_500,
        contextTokens: 8_000,
        inputTokens: 15_000,
        outputTokens: 3_800,
      },
      'history'
    )).toEqual({
      updatedAt: 1_500,
      inputTokens: 15_000,
      outputTokens: 3_800,
    })
  })
})
