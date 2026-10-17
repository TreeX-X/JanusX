import { describe, expect, it } from 'vitest'
import { aggregateUsageHeatmap, toDateInputValue, usageHeatmapStart } from '../../src/renderer/src/lib/usage-stats'
import type { UsageRecord } from '../../src/shared/usage'

const now = new Date(2024, 2, 1, 15).getTime()
const record = (id: string, at: number, totalTokens: number, engine: UsageRecord['engine'] = 'codex'): UsageRecord => ({
  id, at, totalTokens, engine, sessionId: id, timeBasis: 'event', inputTokens: totalTokens, outputTokens: 0,
})

describe('usage activity calendar', () => {
  it('renders 365 local dates, including leap day, with Sunday-first padding', () => {
    const days = aggregateUsageHeatmap([], now)
    expect(days).toHaveLength(371)
    expect(new Date(days[0].at).getDay()).toBe(0)
    expect(days.filter(day => !day.future)).toHaveLength(365)
    expect(days.find(day => day.key === '2024-02-29')?.future).toBe(false)
    expect(days.filter(day => !day.future).at(-1)?.key).toBe('2024-03-01')
    expect(now - usageHeatmapStart(now)).toBeLessThan(367 * 86_400_000)
  })

  it('sums distinct records per local date and engine, excluding outside and future events', () => {
    const yesterday = new Date(2024, 1, 29, 23, 59).getTime()
    const a = record('a', yesterday, 10)
    const records = [a, a, record('b', yesterday, 30), record('c', yesterday, 60, 'claude'), record('old', usageHeatmapStart(now) - 1, 999), record('future', now + 1, 999)]
    const all = aggregateUsageHeatmap(records, now)
    expect(all.find(day => day.key === toDateInputValue(yesterday))).toMatchObject({ totalTokens: 100, level: 4 })
    expect(all.reduce((sum, day) => sum + day.totalTokens, 0)).toBe(100)
    expect(aggregateUsageHeatmap(records, now, 'codex').find(day => day.key === '2024-02-29')?.totalTokens).toBe(40)
    expect(aggregateUsageHeatmap(records, now, 'pi').every(day => day.level === 0)).toBe(true)
  })

  it('maps zero and increasing daily totals onto five intensity levels', () => {
    const records = [1, 2, 3, 4].map((value, index) => record(String(index), new Date(2024, 1, 25 + index, 12).getTime(), value * 10))
    const days = aggregateUsageHeatmap(records, now)
    expect(days.filter(day => day.totalTokens > 0).map(day => day.level)).toEqual([1, 2, 3, 4])
    expect(days.find(day => day.key === '2024-03-01')?.level).toBe(0)
  })
})
