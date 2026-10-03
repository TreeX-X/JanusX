import { describe, expect, it } from 'vitest'
import { aggregateUsageStats, cacheSplitFor, rangeStartFor } from '../../src/renderer/src/lib/usage-stats'
import type { Terminal } from '../../src/renderer/src/types'

function terminal(overrides: Partial<Terminal>): Terminal {
  return {
    id: 't1',
    workspaceId: 'w1',
    name: 't1',
    preset: 'codex',
    cwd: 'C:/repo',
    shell: 'pwsh',
    pid: 1,
    status: 'running',
    ...overrides,
  }
}

// Fixed clock: Friday 2026-10-02 12:00 local time.
const NOW = new Date(2026, 9, 2, 12, 0, 0).getTime()

describe('usage stats aggregation', () => {
  it('computes local range boundaries', () => {
    expect(rangeStartFor('today', NOW)).toBe(new Date(2026, 9, 2, 0, 0, 0).getTime())
    expect(rangeStartFor('week', NOW)).toBe(new Date(2026, 8, 28, 0, 0, 0).getTime())
    expect(rangeStartFor('month', NOW)).toBe(new Date(2026, 9, 1, 0, 0, 0).getTime())
  })

  it('groups live terminals by preset with summed tokens', () => {
    const summary = aggregateUsageStats(
      [
        terminal({ id: 'a', preset: 'codex', detectedModel: 'GPT-5-Codex', totalTokens: 1_000, inputTokens: 700, outputTokens: 300, telemetryUpdatedAt: NOW }),
        terminal({ id: 'b', preset: 'codex', detectedModel: 'GPT-5-Codex', totalTokens: 500, telemetryUpdatedAt: NOW }),
        terminal({ id: 'c', preset: 'dsh', detectedModel: 'DeepSeek-flash', totalTokens: 2_000, contextTokens: 800, telemetryUpdatedAt: NOW }),
      ],
      'today',
      NOW,
    )
    expect(summary.terminals).toBe(3)
    expect(summary.totalTokens).toBe(3_500)
    expect(summary.terminalsWithoutData).toBe(0)
    expect(summary.rows.map((row) => row.preset)).toEqual(['dsh', 'codex'])
    expect(summary.rows[1]).toMatchObject({
      terminals: 2,
      totalTokens: 1_500,
      inputTokens: 700,
      outputTokens: 300,
      models: ['GPT-5-Codex'],
    })
  })

  it('filters by range and counts terminals without data', () => {
    const old = new Date(2026, 8, 20, 12, 0, 0).getTime()
    const summary = aggregateUsageStats(
      [
        terminal({ id: 'a', preset: 'codex', totalTokens: 1_000, telemetryUpdatedAt: NOW }),
        terminal({ id: 'b', preset: 'codex', totalTokens: 9_000, telemetryUpdatedAt: old }),
        terminal({ id: 'c', preset: 'pi', telemetryUpdatedAt: NOW }),
      ],
      'today',
      NOW,
    )
    expect(summary.terminals).toBe(1)
    expect(summary.totalTokens).toBe(1_000)
    expect(summary.terminalsWithoutData).toBe(1)
    expect(summary.rows.map((row) => row.preset)).toEqual(['codex'])
  })

  it('returns an explainable empty summary with no coverage', () => {
    const summary = aggregateUsageStats([], 'month', NOW)
    expect(summary.rows).toEqual([])
    expect(summary.totalTokens).toBe(0)
    expect(summary.terminals).toBe(0)
  })

  it('sums cache counters per preset', () => {
    const summary = aggregateUsageStats(
      [
        terminal({ id: 'a', preset: 'codex', totalTokens: 1_000, inputTokens: 600, cacheReadTokens: 300, cacheWriteTokens: 100, telemetryUpdatedAt: NOW }),
        terminal({ id: 'b', preset: 'codex', totalTokens: 500, inputTokens: 500, telemetryUpdatedAt: NOW }),
      ],
      'today',
      NOW,
    )
    expect(summary.cacheReadTokens).toBe(300)
    expect(summary.cacheWriteTokens).toBe(100)
    expect(summary.rows[0]).toMatchObject({ cacheReadTokens: 300, cacheWriteTokens: 100 })
  })

  it('splits cache hits and misses without mistaking absence for zero', () => {
    expect(cacheSplitFor(300, 600, 100)).toEqual({ hits: 300, misses: 700, rate: 0.3, hasData: true })
    expect(cacheSplitFor(0, 500, 0).hasData).toBe(false)
    expect(cacheSplitFor(0, 500, 0).rate).toBeUndefined()
    expect(cacheSplitFor(0, 0, 0)).toEqual({ hits: 0, misses: 0, rate: undefined, hasData: false })
  })

  it('buckets terminals into hourly slots for today', () => {
    const at = (hour: number) => new Date(2026, 9, 2, hour, 30, 0).getTime()
    const summary = aggregateUsageStats(
      [
        terminal({ id: 'a', preset: 'codex', totalTokens: 1_000, inputTokens: 600, cacheReadTokens: 300, cacheWriteTokens: 100, outputTokens: 200, telemetryUpdatedAt: at(9) }),
        terminal({ id: 'b', preset: 'codex', totalTokens: 500, inputTokens: 500, telemetryUpdatedAt: at(10) }),
      ],
      'today',
      NOW,
    )
    expect(summary.series).toHaveLength(24)
    expect(summary.series[9]).toMatchObject({ label: '9', totalTokens: 1_000, hits: 300, misses: 700, unknown: 0, output: 200 })
    expect(summary.series[10]).toMatchObject({ label: '10', totalTokens: 500, hits: 0, misses: 0, unknown: 500, output: 0 })
  })

  it('buckets terminals into daily slots for the week and filters by preset', () => {
    const monday = new Date(2026, 8, 28, 10, 0, 0).getTime()
    const tuesday = new Date(2026, 8, 29, 10, 0, 0).getTime()
    const all = aggregateUsageStats(
      [
        terminal({ id: 'a', preset: 'codex', totalTokens: 1_000, inputTokens: 1_000, telemetryUpdatedAt: monday }),
        terminal({ id: 'b', preset: 'dsh', totalTokens: 2_000, inputTokens: 2_000, telemetryUpdatedAt: tuesday }),
      ],
      'week',
      NOW,
    )
    expect(all.series.map((bucket) => bucket.label)).toEqual(['9/28', '9/29', '9/30', '10/1', '10/2'])
    expect(all.series[0].totalTokens).toBe(1_000)
    const dshOnly = aggregateUsageStats(
      [
        terminal({ id: 'a', preset: 'codex', totalTokens: 1_000, inputTokens: 1_000, telemetryUpdatedAt: monday }),
        terminal({ id: 'b', preset: 'dsh', totalTokens: 2_000, inputTokens: 2_000, telemetryUpdatedAt: tuesday }),
      ],
      'week',
      NOW,
      'dsh',
    )
    expect(dshOnly.rows.map((row) => row.preset)).toEqual(['dsh'])
    expect(dshOnly.series[0].totalTokens).toBe(0)
    expect(dshOnly.series[1].totalTokens).toBe(2_000)
  })
})
