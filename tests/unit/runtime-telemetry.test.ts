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

  it('does not bind a session discovered by an unscoped history scan', () => {
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
    )).toEqual({})
  })

  it('binds and counts telemetry only when an adapter confirms the session', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      { preset: 'codex', telemetrySessionId: 'old-session', compactionCount: 1 },
      {
        sessionId: 'new-session',
        sessionBinding: 'exact',
        compactionCount: 2,
        compactionCountConfidence: 'exact',
        observedAt: 2_000,
        source: 'history',
        confidence: 'authoritative',
      },
    )).toMatchObject({
      telemetrySessionId: 'new-session',
      telemetrySessionBinding: 'exact',
      compactionCount: 2,
      compactionCountConfidence: 'exact',
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

  it('updates the window immediately from a structured startup event', () => {
    const parser = createRuntimeTelemetryStreamParser(() => 2_000)
    const [snapshot] = parser.push('{"timestamp":"2026-08-02T10:00:00Z","type":"event_msg","payload":{"type":"task_started","model_context_window":258400}}\n')

    expect(snapshot).toMatchObject({
      contextWindowTokens: 258_400,
      source: 'provider-event',
      confidence: 'authoritative',
    })
  })

  it('marks a structured model switch with its event time', () => {
    const parser = createRuntimeTelemetryStreamParser()
    const [snapshot] = parser.push('{"timestamp":"2026-08-02T10:00:00Z","type":"turn_context","payload":{"model":"gpt-5.6-sol"}}\n')

    expect(snapshot).toMatchObject({
      detectedModel: 'GPT-5.6-sol',
      modelChangedAt: Date.parse('2026-08-02T10:00:00Z'),
    })
  })

  it('clears an old runtime window while a switched model awaits its capacity event', () => {
    expect(mergeRuntimeTelemetrySnapshot(
      {
        preset: 'codex',
        detectedModel: 'GPT-5.5',
        contextWindowTokens: 200_000,
        telemetryUpdatedAt: 1_000,
      },
      {
        detectedModel: 'GPT-5.6-sol',
        modelChangedAt: 2_000,
        observedAt: 2_000,
        source: 'provider-event',
        confidence: 'authoritative',
      },
    )).toMatchObject({
      detectedModel: 'GPT-5.6-sol',
      contextWindowTokens: undefined,
    })
  })
})
