import { describe, expect, it } from 'vitest'
import {
  createRuntimeTelemetryStreamParser,
  getEstimatedContextWindow,
  getRegistryContextWindow,
  mergeRuntimeTelemetrySnapshot,
  resolveContextWindows,
} from '../../src/renderer/src/lib/runtime-telemetry'

describe('runtime telemetry model context lookup', () => {
  it('uses the model registry before heuristic estimates', () => {
    expect(getRegistryContextWindow('gpt-5.5')).toBe(1_050_000)
    expect(getEstimatedContextWindow('codex', 'GPT-5.5')).toBe(1_050_000)
  })

  it('separates the active runtime window from the model capacity', () => {
    expect(resolveContextWindows('codex', 'gpt-5.6-sol', 258_400)).toEqual({
      runtimeWindow: 258_400,
      modelCapacity: 1_050_000,
      effectiveWindow: 258_400,
      effectiveSource: 'runtime',
    })
  })

  it('uses model capacity when the runtime does not report a window', () => {
    expect(resolveContextWindows('codex', 'gpt-5.6-sol')).toEqual({
      modelCapacity: 1_050_000,
      effectiveWindow: 1_050_000,
      effectiveSource: 'model-registry',
    })
  })

  it('accepts a newer lower context value after compaction', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        telemetryUpdatedAt: 1_000,
        telemetrySource: 'history',
        telemetryConfidence: 'authoritative',
        contextTokens: 31_000,
        inputTokens: 16_000,
      },
      {
        observedAt: 1_500,
        source: 'history',
        confidence: 'authoritative',
        contextTokens: 8_000,
        inputTokens: 15_000,
      }
    )).toEqual({
      contextTokens: 8_000,
      telemetrySource: 'history',
      telemetryConfidence: 'authoritative',
      telemetryUpdatedAt: 1_500,
    })
  })

  it('rejects an older history snapshot', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        telemetryUpdatedAt: 1_000,
        contextTokens: 31_000,
      },
      {
        observedAt: 900,
        source: 'history',
        contextTokens: 8_000,
      }
    )).toEqual({})
  })

  it('does not let estimated terminal text replace authoritative usage', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        telemetryUpdatedAt: 1_000,
        telemetryConfidence: 'authoritative',
        contextTokens: 31_000,
        totalTokens: 80_000,
      },
      {
        observedAt: 1_500,
        source: 'terminal-text',
        confidence: 'estimated',
        contextTokens: 8_000,
        totalTokens: 90_000,
      }
    )).toEqual({})
  })

  it('resets stale cumulative fields when the provider reports a new session', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        telemetrySessionId: 'old-session',
        telemetryUpdatedAt: 1_000,
        contextTokens: 31_000,
        inputTokens: 16_000,
        outputTokens: 4_000,
      },
      {
        sessionId: 'new-session',
        observedAt: 1_100,
        source: 'history',
        confidence: 'authoritative',
        contextTokens: 1_200,
      }
    )).toEqual({
      contextTokens: 1_200,
      inputTokens: undefined,
      outputTokens: undefined,
      telemetrySessionId: 'new-session',
      telemetrySource: 'history',
      telemetryConfidence: 'authoritative',
      telemetryUpdatedAt: 1_100,
    })
  })

  it('parses a structured telemetry line split across PTY chunks', () => {
    let now = 2_000
    const parser = createRuntimeTelemetryStreamParser(() => now++)
    expect(parser.push('{"payload":{"type":"token_')).toEqual([])
    const [snapshot] = parser.push('count","info":{"last_token_usage":{"total_tokens":8000},"total_token_usage":{"total_tokens":12000,"input_tokens":10000,"cached_input_tokens":2000,"output_tokens":2000},"model_context_window":200000}}}\r\n')

    expect(snapshot).toMatchObject({
      contextTokens: 8_000,
      contextWindowTokens: 200_000,
      inputTokens: 8_000,
      cacheReadTokens: 2_000,
      outputTokens: 2_000,
      totalTokens: 12_000,
      source: 'provider-event',
      confidence: 'authoritative',
      observedAt: 2_000,
    })
  })
})
