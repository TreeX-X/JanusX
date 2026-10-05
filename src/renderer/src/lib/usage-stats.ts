// Note: shared usage filters and cumulative snapshot curves — see .agents/notes/2026-10-02-usage-telemetry-fix-and-stats--61b5d05c.md
// Note: custom date range with snapshot-bucket aggregation — see .agents/notes/2026-10-05-usage-stats-custom-range-detail--241cfe30.md
import type { Terminal, TerminalPreset } from '@/types'

export type UsageRange = 'today' | 'week' | 'month' | 'custom'

/** 自定义日期区间输入（毫秒时间戳，聚合前按本地日边界归一化）。 */
export interface CustomDateRange {
  start: number
  end: number
}

export type CustomRangeError = 'invalid' | 'future' | 'span'

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
  rangeEnd: number
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
const HOUR_MS = 3_600_000

/** 自定义区间允许的最大跨度（366 天，覆盖整年对账）。 */
export const MAX_CUSTOM_SPAN_MS = 366 * DAY_MS

export function startOfDay(ts: number): number {
  const cursor = new Date(ts)
  cursor.setHours(0, 0, 0, 0)
  return cursor.getTime()
}

export function endOfDay(ts: number): number {
  const cursor = new Date(ts)
  cursor.setHours(23, 59, 59, 999)
  return cursor.getTime()
}

/** 日期输入框值（`yyyy-MM-dd`，本地时区）与时间戳互转。 */
export function toDateInputValue(ts: number): string {
  const date = new Date(ts)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseDateInput(value: string): number | undefined {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (!Number.isFinite(parsed.getTime())) return undefined
  // 溢出日期（如 2026-02-30）会被 Date 回绕，需回校验。
  if (parsed.getMonth() !== Number(match[2]) - 1 || parsed.getDate() !== Number(match[3])) return undefined
  return parsed.getTime()
}

export interface NormalizedCustomRange {
  start: number
  end: number
  error?: CustomRangeError
}

/**
 * 自定义区间归一化：起止按本地日边界展开，结束超过 now 按 now 截断。
 * 非法格式、开始晚于结束返回 `invalid`；开始在未来返回 `future`；跨度超限返回 `span`。
 */
export function normalizeCustomRange(startInput: number | undefined, endInput: number | undefined, now: number): NormalizedCustomRange {
  if (startInput === undefined || endInput === undefined || !Number.isFinite(startInput) || !Number.isFinite(endInput)) {
    return { start: startOfDay(now), end: now, error: 'invalid' }
  }
  const start = startOfDay(startInput)
  let end = endOfDay(endInput)
  if (start > end) return { start, end, error: 'invalid' }
  if (start > now) return { start, end: now, error: 'future' }
  if (end > now) end = now
  if (end - start > MAX_CUSTOM_SPAN_MS) return { start, end, error: 'span' }
  return { start, end }
}

export function rangeStartFor(range: UsageRange, now: number, custom?: CustomDateRange): number {
  if (range === 'custom' && custom) return startOfDay(custom.start)
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

export function rangeEndFor(range: UsageRange, now: number, custom?: CustomDateRange): number {
  if (range === 'custom' && custom) return Math.min(endOfDay(custom.end), now)
  return now
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

/** 时间分桶：today 按小时，week/month 按日，custom 按跨度自适应（≤48h 按小时，否则按日，>62 天按周）。 */
export interface TimeBucket {
  key: string
  label: string
  totalTokens: number
  hits: number
  misses: number
  unknown: number
  output: number
}

export type CustomBucketMode = 'hour' | 'day' | 'week'

export function customBucketModeFor(start: number, end: number): CustomBucketMode {
  const span = end - start
  if (span <= 2 * DAY_MS) return 'hour'
  if (span <= 62 * DAY_MS) return 'day'
  return 'week'
}

function dayLabel(at: number): string {
  const date = new Date(at)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function bucketKeyFor(range: UsageRange, at: number, custom?: CustomDateRange, now: number = Date.now()): { key: string; label: string } {
  const date = new Date(at)
  if (range === 'today') {
    const hour = date.getHours()
    return { key: `h${hour}`, label: String(hour) }
  }
  if (range === 'custom' && custom) {
    const start = startOfDay(custom.start)
    const mode = customBucketModeFor(start, Math.min(endOfDay(custom.end), now))
    if (mode === 'hour') {
      const index = Math.max(0, Math.floor((at - start) / HOUR_MS))
      const label = `${dayLabel(at)} ${String(date.getHours()).padStart(2, '0')}:00`
      return { key: `ch${index}`, label }
    }
    if (mode === 'week') {
      const index = Math.max(0, Math.floor((startOfDay(at) - start) / (7 * DAY_MS)))
      return { key: `cw${index}`, label: dayLabel(start + index * 7 * DAY_MS) }
    }
    return { key: `cd${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`, label: dayLabel(at) }
  }
  const month = date.getMonth() + 1
  const day = date.getDate()
  return { key: `d${month}-${day}`, label: `${month}/${day}` }
}

function bucketKeysFor(range: UsageRange, now: number, custom?: CustomDateRange): Array<{ key: string; label: string }> {
  if (range === 'today') {
    return Array.from({ length: 24 }, (_, hour) => ({ key: `h${hour}`, label: String(hour) }))
  }
  if (range === 'custom' && custom) {
    const start = startOfDay(custom.start)
    const end = Math.min(endOfDay(custom.end), now)
    if (end < start) return []
    const mode = customBucketModeFor(start, end)
    if (mode === 'hour') {
      const count = Math.min(72, Math.floor((end - start) / HOUR_MS) + 1)
      return Array.from({ length: count }, (_, index) => {
        const at = start + index * HOUR_MS
        const date = new Date(at)
        return { key: `ch${index}`, label: `${dayLabel(at)} ${String(date.getHours()).padStart(2, '0')}:00` }
      })
    }
    if (mode === 'week') {
      const keys: Array<{ key: string; label: string }> = []
      let index = 0
      let cursor = start
      while (cursor <= end && index < 60) {
        keys.push({ key: `cw${index}`, label: dayLabel(cursor) })
        index += 1
        cursor += 7 * DAY_MS
      }
      return keys
    }
    const keys: Array<{ key: string; label: string }> = []
    const cursor = new Date(start)
    cursor.setHours(12, 0, 0, 0)
    const last = new Date(end)
    last.setHours(12, 0, 0, 0)
    while (cursor.getTime() <= last.getTime() && keys.length < 400) {
      const at = cursor.getTime()
      const date = new Date(at)
      keys.push({ key: `cd${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`, label: dayLabel(at) })
      cursor.setDate(cursor.getDate() + 1)
    }
    return keys
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
  custom?: CustomDateRange,
): UsageStatsSummary {
  const rangeStart = rangeStartFor(range, now, custom)
  const rangeEnd = rangeEndFor(range, now, custom)
  const byPreset = new Map<TerminalPreset, UsagePresetRow>()
  const seriesMap = new Map<string, TimeBucket>(
    bucketKeysFor(range, now, custom).map(({ key, label }) => [key, { key, label, totalTokens: 0, hits: 0, misses: 0, unknown: 0, output: 0 }]),
  )
  let terminalsWithoutData = 0

  for (const terminal of terminals) {
    if (preset !== undefined && terminal.preset !== preset) continue
    const observedAt = terminal.telemetryUpdatedAt ?? terminal.updatedAt ?? 0
    if (observedAt < rangeStart || observedAt > rangeEnd) continue
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
    const bucket = seriesMap.get(bucketKeyFor(range, observedAt, custom, now).key)
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
    rangeEnd,
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
