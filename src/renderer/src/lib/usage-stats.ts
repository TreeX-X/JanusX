// Note: settings-global usage aggregation over live terminals — see .agents/notes/2026-10-02-usage-telemetry-fix-and-stats--61b5d05c.md
import type { Terminal, TerminalPreset } from '@/types'

export type UsageRange = 'today' | 'week' | 'month'

export interface UsagePresetRow {
  preset: TerminalPreset
  terminals: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  contextTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  models: string[]
}

export interface UsageStatsSummary {
  range: UsageRange
  rangeStart: number
  rows: UsagePresetRow[]
  series: TimeBucket[]
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  terminals: number
  terminalsWithoutData: number
}

/** 缓存命中口径：命中为读缓存命中数，未命中为新鲜输入加缓存写入数。 */
export interface CacheSplit {
  hits: number
  misses: number
  rate: number | undefined
  hasData: boolean
}

export function cacheSplitFor(cacheReadTokens: number, inputTokens: number, cacheWriteTokens: number): CacheSplit {
  const hits = cacheReadTokens
  const misses = inputTokens + cacheWriteTokens
  // PTY 文本不报告缓存字段，全零代表无数据而非 0% 命中。
  const hasData = cacheReadTokens + cacheWriteTokens > 0
  return { hits, misses, rate: hasData && hits + misses > 0 ? hits / (hits + misses) : undefined, hasData }
}

const DAY_MS = 86_400_000

export function rangeStartFor(range: UsageRange, now: number): number {
  const cursor = new Date(now)
  if (range === 'today') {
    cursor.setHours(0, 0, 0, 0)
    return cursor.getTime()
  }
  if (range === 'week') {
    cursor.setHours(0, 0, 0, 0)
    const mondayOffset = (cursor.getDay() + 6) % 7
    return cursor.getTime() - mondayOffset * DAY_MS
  }
  return new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime()
}

/** 终端是否有可用的缓存计数（PTY 文本不报告缓存字段，全零代表无数据）。 */
export function hasCacheData(terminal: Pick<Terminal, 'cacheReadTokens' | 'cacheWriteTokens'>): boolean {
  return (terminal.cacheReadTokens ?? 0) + (terminal.cacheWriteTokens ?? 0) > 0
}

function hasUsageData(terminal: Terminal): boolean {
  return (
    terminal.totalTokens !== undefined ||
    terminal.inputTokens !== undefined ||
    terminal.outputTokens !== undefined ||
    terminal.contextTokens !== undefined
  )
}

/** 时间分桶：today 按小时，week 按日（周一到周日），month 按日期。 */
export interface TimeBucket {
  key: string
  label: string
  totalTokens: number
  hits: number
  misses: number
  unknown: number
  output: number
}

function bucketKeyFor(range: UsageRange, at: number): { key: string; label: string } {
  const date = new Date(at)
  if (range === 'today') {
    const hour = date.getHours()
    return { key: `h${hour}`, label: String(hour) }
  }
  const month = date.getMonth() + 1
  const day = date.getDate()
  return { key: `d${month}-${day}`, label: `${month}/${day}` }
}

function bucketKeysFor(range: UsageRange, now: number): Array<{ key: string; label: string }> {
  if (range === 'today') {
    return Array.from({ length: 24 }, (_, hour) => ({ key: `h${hour}`, label: String(hour) }))
  }
  const start = rangeStartFor(range, now)
  const end = new Date(now)
  const keys: Array<{ key: string; label: string }> = []
  const cursor = new Date(start)
  cursor.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)
  while (cursor.getTime() <= last.getTime()) {
    keys.push(bucketKeyFor(range, cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function aggregateUsageStats(
  terminals: readonly Terminal[],
  range: UsageRange,
  now: number = Date.now(),
  preset?: TerminalPreset,
): UsageStatsSummary {
  const rangeStart = rangeStartFor(range, now)
  const byPreset = new Map<TerminalPreset, UsagePresetRow>()
  const seriesMap = new Map<string, TimeBucket>(
    bucketKeysFor(range, now).map(({ key, label }) => [key, { key, label, totalTokens: 0, hits: 0, misses: 0, unknown: 0, output: 0 }]),
  )
  let terminalsWithoutData = 0

  for (const terminal of terminals) {
    if (preset !== undefined && terminal.preset !== preset) continue
    const observedAt = terminal.telemetryUpdatedAt ?? terminal.updatedAt ?? 0
    if (observedAt < rangeStart) continue
    if (!hasUsageData(terminal)) {
      terminalsWithoutData += 1
      continue
    }
    let row = byPreset.get(terminal.preset)
    if (!row) {
      row = {
        preset: terminal.preset,
        terminals: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        contextTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        models: [],
      }
      byPreset.set(terminal.preset, row)
    }
    row.terminals += 1
    row.totalTokens += terminal.totalTokens ?? 0
    row.inputTokens += terminal.inputTokens ?? 0
    row.outputTokens += terminal.outputTokens ?? 0
    row.contextTokens += terminal.contextTokens ?? 0
    row.cacheReadTokens += terminal.cacheReadTokens ?? 0
    row.cacheWriteTokens += terminal.cacheWriteTokens ?? 0
    if (terminal.detectedModel && !row.models.includes(terminal.detectedModel)) {
      row.models.push(terminal.detectedModel)
    }
    const bucket = seriesMap.get(bucketKeyFor(range, observedAt).key)
    if (bucket) {
      const input = terminal.inputTokens ?? 0
      const write = terminal.cacheWriteTokens ?? 0
      const read = terminal.cacheReadTokens ?? 0
      const output = terminal.outputTokens ?? 0
      bucket.totalTokens += terminal.totalTokens ?? 0
      bucket.output += output
      if (hasCacheData(terminal)) {
        bucket.hits += read
        bucket.misses += input + write
      } else {
        bucket.unknown += input + write
      }
    }
  }

  const rows = [...byPreset.values()].sort((a, b) => b.totalTokens - a.totalTokens)
  for (const row of rows) row.models.sort()
  return {
    range,
    rangeStart,
    rows,
    series: [...seriesMap.values()],
    totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
    cacheReadTokens: rows.reduce((sum, row) => sum + row.cacheReadTokens, 0),
    cacheWriteTokens: rows.reduce((sum, row) => sum + row.cacheWriteTokens, 0),
    terminals: rows.reduce((sum, row) => sum + row.terminals, 0),
    terminalsWithoutData,
  }
}
