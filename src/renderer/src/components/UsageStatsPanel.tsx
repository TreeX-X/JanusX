// Note: shared usage filters and cumulative snapshot curves — see .agents/notes/2026-10-02-usage-telemetry-fix-and-stats--61b5d05c.md
// Note: custom date range with snapshot-bucket aggregation — see .agents/notes/2026-10-05-usage-stats-custom-range-detail--241cfe30.md
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { useThemeStore } from '@/stores/theme'
import {
  aggregateUsageStats,
  cacheSplitFor,
  customBucketModeFor,
  normalizeCustomRange,
  parseDateInput,
  toDateInputValue,
  type TimeBucket,
  type UsageRange,
  type UsagePresetRow,
} from '@/lib/usage-stats'
import type { TerminalPreset } from '@/types'
import { EXTERNAL_CLI_TOOL_META, EXTERNAL_CLI_TOOL_ORDER, type ExternalCliToolId } from '../../../shared/ipc/external-cli'
import { EXTERNAL_CLI_TOOL_ICONS } from '@/lib/cli-tool-icons'
import { getThemeDefinition } from '../../../shared/theme/registry'
import llmStyles from './LlmConfigModal.module.css'
import styles from './UsageStatsPanel.module.css'

const RANGES: UsageRange[] = ['today', 'week', 'month', 'custom']
const RANGE_KEYS = { today: 'rangeToday', week: 'rangeWeek', month: 'rangeMonth', custom: 'rangeCustom' } as const
const SHELL_COLOR = '#8a8a93'
const DAY_MS = 86_400_000

type TypeFilter = 'all' | ExternalCliToolId

function formatCount(value: number): string {
  const rounded = Math.round(value)
  if (rounded >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1)}M`
  if (rounded >= 1000) return `${(rounded / 1000).toFixed(rounded >= 10_000 ? 0 : 1)}k`
  return String(rounded)
}

function formatRate(rate: number | undefined): string {
  return rate === undefined ? '–' : `${Math.round(rate * 100)}%`
}

function presetColor(preset: TerminalPreset): string {
  return EXTERNAL_CLI_TOOL_META[preset as ExternalCliToolId]?.color ?? SHELL_COLOR
}

function presetName(preset: TerminalPreset): string {
  return EXTERNAL_CLI_TOOL_META[preset as ExternalCliToolId]?.displayName ?? preset
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** 数字滚动：目标变化时在 260ms 内插值，降级时直接返回目标。 */
function useAnimatedNumber(target: number, disabled: boolean): number {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    if (disabled || fromRef.current === target) {
      fromRef.current = target
      setDisplay(target)
      return
    }
    const from = fromRef.current
    let frame = 0
    const startedAt = performance.now()
    const duration = 260
    const tick = (at: number) => {
      const progress = Math.min(1, (at - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = from + (target - from) * eased
      setDisplay(value)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      fromRef.current = target
    }
  }, [target, disabled])
  return display
}

/** 曲线插值：桶数量与键一致时逐帧过渡，否则直接切换并由 CSS 淡入承接。 */
function useAnimatedSeries(series: TimeBucket[], disabled: boolean): { buckets: TimeBucket[]; generation: number } {
  const [display, setDisplay] = useState(series)
  const [generation, setGeneration] = useState(0)
  const prevRef = useRef(series)
  useEffect(() => {
    const prev = prevRef.current
    const sameShape = !disabled && prev.length === series.length && prev.every((bucket, index) => bucket.key === series[index].key)
    if (!sameShape) {
      prevRef.current = series
      setDisplay(series)
      setGeneration((value) => value + 1)
      return
    }
    const from = prev
    let frame = 0
    const startedAt = performance.now()
    const duration = 280
    const tick = (at: number) => {
      const progress = Math.min(1, (at - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(from.map((bucket, index) => {
        const next = series[index]
        const mix = (a: number, b: number) => a + (b - a) * eased
        return {
          ...next,
          totalTokens: mix(bucket.totalTokens, next.totalTokens),
          hits: mix(bucket.hits, next.hits),
          misses: mix(bucket.misses, next.misses),
          unknown: mix(bucket.unknown, next.unknown),
          output: mix(bucket.output, next.output),
        }
      }))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else prevRef.current = series
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      prevRef.current = series
    }
  }, [series, disabled])
  return { buckets: display, generation }
}

function OverallDonut({ rows, total, trackColor, label }: {
  rows: UsagePresetRow[]
  total: number
  trackColor: string
  label: string
}) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  let accumulated = 0
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={label}>
      <circle cx="48" cy="48" r={radius} fill="none" stroke={trackColor} strokeWidth="10" />
      {total > 0 && rows.map((row) => {
        const fraction = row.totalTokens / total
        const length = fraction * circumference
        const offset = -accumulated * circumference
        accumulated += fraction
        if (length <= 0) return null
        return (
          <circle
            key={row.preset}
            className={styles.donutArc}
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={presetColor(row.preset)}
            strokeWidth="10"
            strokeDasharray={`${length} ${circumference}`}
            strokeDashoffset={offset}
            transform="rotate(-90 48 48)"
          />
        )
      })}
    </svg>
  )
}

function CacheDonut({ hits, misses, rate, hasData, hitColor, missColor, trackColor, label }: {
  hits: number
  misses: number
  rate: number | undefined
  hasData: boolean
  hitColor: string
  missColor: string
  trackColor: string
  label: string
}) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const total = hits + misses
  const hitLength = hasData && total > 0 ? (hits / total) * circumference : 0
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={label}>
      <circle cx="48" cy="48" r={radius} fill="none" stroke={trackColor} strokeWidth="10" />
      {hasData && total > 0 && (
        <>
          <circle cx="48" cy="48" r={radius} fill="none" stroke={missColor} strokeWidth="10" />
          <circle
            className={styles.donutArc}
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={hitColor}
            strokeWidth="10"
            strokeLinecap="butt"
            strokeDasharray={`${hitLength} ${circumference}`}
            transform="rotate(-90 48 48)"
          />
        </>
      )}
      <text x="48" y="52" textAnchor="middle" fontSize="15" fill="currentColor">{formatRate(hasData ? rate : undefined)}</text>
    </svg>
  )
}

function EmptyState({ title, desc, resetLabel, showReset, onReset }: {
  title: string
  desc: string
  resetLabel: string
  showReset: boolean
  onReset: () => void
}) {
  return (
    <div className={styles.emptyCard}>
      <svg className={styles.emptyArt} width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle className={styles.emptyOrbit} cx="36" cy="36" r="26" fill="none" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle className={styles.emptyCore} cx="36" cy="36" r="7" />
        <circle className={styles.emptySat} cx="36" cy="10" r="3" />
      </svg>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyDesc}>{desc}</p>
      {showReset && <button type="button" className={styles.emptyAction} onClick={onReset}>{resetLabel}</button>}
    </div>
  )
}

type TrendMetric = { key: 'hits' | 'misses' | 'unknown' | 'output'; label: string; color: string }

function TrendLines({ series, range, metrics, label }: {
  series: TimeBucket[]
  range: UsageRange
  metrics: TrendMetric[]
  label: string
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const { buckets, generation } = useAnimatedSeries(series, reducedMotion)
  const ceiling = Math.max(1, ...buckets.flatMap((bucket) => metrics.map(({ key }) => bucket[key])))
  const x = (index: number) => 52 + index * 620 / Math.max(1, buckets.length - 1)
  const y = (value: number) => 174 - value / ceiling * 146
  // 聚合每次渲染返回新数组，任何“series 变化即清零”的 effect 都会在数字滚动期间
  // 反复吞掉悬停与键盘焦点；此处仅钳制越界下标，结构变化由 svg key 的淡入承接。
  const active = activeIndex === null || activeIndex >= buckets.length ? undefined : buckets[activeIndex]
  const dateLabel = (bucket: TimeBucket) => range === 'today' ? `${bucket.label.padStart(2, '0')}:00` : bucket.label
  return (
    <div className={styles.trend}>
      <svg key={generation} viewBox="0 0 700 208" className={`${styles.chart} ${styles.chartEnter}`} role="group" aria-label={label} onMouseLeave={() => setActiveIndex(null)}>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction} className={styles.axis}>
            <line x1="52" x2="672" y1={y(ceiling * fraction)} y2={y(ceiling * fraction)} />
            <text x="40" y={y(ceiling * fraction) + 4} textAnchor="end">{formatCount(ceiling * fraction)}</text>
          </g>
        ))}
        {metrics.map(({ key, color }) => {
          // Horizontal control points keep each segment within its two measured values.
          const path = buckets.map((bucket, index) => index === 0
            ? `M ${x(index)} ${y(bucket[key])}`
            : `C ${(x(index - 1) + x(index)) / 2} ${y(buckets[index - 1][key])}, ${(x(index - 1) + x(index)) / 2} ${y(bucket[key])}, ${x(index)} ${y(bucket[key])}`).join(' ')
          return <g key={key}>
            <path data-series={key} d={path} fill="none" stroke={color} strokeWidth="2" strokeDasharray={key === 'unknown' ? '4 4' : undefined} vectorEffect="non-scaling-stroke" />
            {buckets.map((bucket, index) => bucket[key] > 0.5 && <circle key={bucket.key} cx={x(index)} cy={y(bucket[key])} r="3" fill={color} />)}
          </g>
        })}
        {active && <line className={styles.cursor} x1={x(activeIndex!)} x2={x(activeIndex!)} y1="22" y2="174" />}
        {buckets.map((bucket, index) => {
          const showLabel = index === 0 || index === buckets.length - 1 || index % Math.max(1, Math.ceil(buckets.length / 6)) === 0
          return <g key={bucket.key}>
            {showLabel && <text className={styles.dateLabel} x={x(index)} y="199" textAnchor="middle">{dateLabel(bucket)}</text>}
            <rect x={x(index) - 310 / Math.max(1, buckets.length - 1)} y="20" width={620 / Math.max(1, buckets.length - 1)} height="160" fill="transparent" tabIndex={0}
              role="img" aria-label={`${dateLabel(bucket)}: ${metrics.map(({ key, label: name }) => `${name} ${Math.round(bucket[key])}`).join(', ')}`}
              onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} />
          </g>
        })}
      </svg>
      <div className={styles.legend} aria-live="polite">
        {active && <span className={styles.activeDate}>{dateLabel(active)}</span>}
        {metrics.map(({ key, color, label: name }) => <span key={key}><i style={{ background: color }} />{name}{active && <strong>{formatCount(active[key])}</strong>}</span>)}
      </div>
    </div>
  )
}

export function UsageStatsPanel() {
  const { t } = useI18n('settings')
  const terminals = useWorkspaceStore((s) => s.terminals)
  const theme = useThemeStore((s) => s.theme)
  const scale = getThemeDefinition(theme).ctxScale
  const hitColor = scale.stops[0]
  const missColor = scale.stops[2]
  const trackColor = scale.empty
  const reducedMotion = usePrefersReducedMotion()
  const [range, setRange] = useState<UsageRange>('today')
  const [activeType, setActiveType] = useState<TypeFilter>('all')
  const [iconFailed, setIconFailed] = useState<Partial<Record<ExternalCliToolId, boolean>>>({})
  const [startInput, setStartInput] = useState(() => toDateInputValue(Date.now() - 6 * DAY_MS))
  const [endInput, setEndInput] = useState(() => toDateInputValue(Date.now()))
  const now = Date.now()
  const normalized = useMemo(
    () => normalizeCustomRange(parseDateInput(startInput), parseDateInput(endInput), now),
    // now 仅用于截断未来结束日期，避免每次渲染新建对象导致聚合抖动由调用方控制。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startInput, endInput],
  )
  const customRange = range === 'custom' ? { start: normalized.start, end: normalized.end } : undefined
  const view = aggregateUsageStats(terminals, range, now, activeType === 'all' ? undefined : activeType, customRange)
  const cache = cacheSplitFor(view.cacheReadTokens, view.inputTokens, view.cacheWriteTokens)
  const animatedTotal = useAnimatedNumber(view.totalTokens, reducedMotion)
  const animatedInput = useAnimatedNumber(view.inputTokens, reducedMotion)
  const animatedOutput = useAnimatedNumber(view.outputTokens, reducedMotion)
  const ioTotal = view.inputTokens + view.outputTokens
  const outputShare = ioTotal > 0 ? view.outputTokens / ioTotal : undefined
  // 自定义区间的日期错误只在 custom 范围内生效，切回预设后不得劫持空文案。
  const customErrorKey = range !== 'custom' ? undefined
    : normalized.error === 'invalid' ? 'customInvalid' : normalized.error === 'future' ? 'customFuture' : normalized.error === 'span' ? 'customSpan' : undefined
  const isEmpty = view.terminals === 0
  const resetFilters = () => {
    setRange('today')
    setActiveType('all')
  }
  const emptyDesc = customErrorKey !== undefined
    ? t('settings:usageStats.emptyHint')
    : activeType !== 'all'
      ? t('settings:usageStats.emptyFiltered')
      : view.terminalsWithoutData > 0
        ? t('settings:usageStats.emptyWaiting', { count: view.terminalsWithoutData })
        : t('settings:usageStats.emptyHint')
  const metrics: TrendMetric[] = [
    { key: 'hits', label: t('settings:usageStats.hit'), color: hitColor },
    { key: 'misses', label: t('settings:usageStats.miss'), color: missColor },
    { key: 'unknown', label: t('settings:usageStats.unknown'), color: 'var(--shell-muted)' },
    { key: 'output', label: t('settings:usageStats.output'), color: 'var(--shell-text)' },
  ]
  const trendBucketHint = useMemo(() => {
    if (range !== 'custom' || normalized.end < normalized.start) return undefined
    const mode = customBucketModeFor(normalized.start, normalized.end)
    return mode === 'hour' ? t('settings:usageStats.customHourly') : mode === 'week' ? t('settings:usageStats.customWeekly') : t('settings:usageStats.customDaily')
  }, [range, normalized, t])
  return (
    <section className={styles.panel} aria-label={t('settings:usageStats.title')}>
      <div className={styles.head}>
        <div className={styles.headInfo}>
          <h3 className={styles.title}>{t('settings:usageStats.title')}</h3>
          <p className={styles.subtitle}>{t('settings:usageStats.subtitle')}</p>
        </div>
        <div className={styles.ranges} role="group" aria-label={t('settings:usageStats.timeRange')}>
          {RANGES.map((candidate) => <button key={candidate} type="button" aria-pressed={candidate === range} onClick={() => setRange(candidate)}>{t(`settings:usageStats.${RANGE_KEYS[candidate]}`)}</button>)}
        </div>
      </div>
      {range === 'custom' && (
        <div className={styles.customBar}>
          <label className={styles.dateField}>
            <span>{t('settings:usageStats.customStart')}</span>
            <input type="date" value={startInput} max={endInput} onChange={(event) => setStartInput(event.target.value)} aria-label={t('settings:usageStats.customStart')} />
          </label>
          <span className={styles.dateSep} aria-hidden="true">–</span>
          <label className={styles.dateField}>
            <span>{t('settings:usageStats.customEnd')}</span>
            <input type="date" value={endInput} min={startInput} onChange={(event) => setEndInput(event.target.value)} aria-label={t('settings:usageStats.customEnd')} />
          </label>
          {customErrorKey
            ? <p className={styles.error} role="alert">{t(`settings:usageStats.${customErrorKey}`)}</p>
            : <p className={styles.customMeta}>{formatRangeLabel(normalized.start, normalized.end)}{trendBucketHint ? ` · ${trendBucketHint}` : ''}</p>}
        </div>
      )}
      <div className={styles.tabRow} role="group" aria-label={t('settings:usageStats.terminalType')}>
        <button type="button" className={`${styles.tab} ${activeType === 'all' ? styles.tabActive : ''}`} aria-pressed={activeType === 'all'} onClick={() => setActiveType('all')}>{t('settings:usageStats.typeAll')}</button>
        {EXTERNAL_CLI_TOOL_ORDER.map((toolId) => {
          const meta = EXTERNAL_CLI_TOOL_META[toolId]
          return <button key={toolId} type="button" className={`${styles.tab} ${toolId === activeType ? styles.tabActive : ''}`} aria-pressed={toolId === activeType} onClick={() => setActiveType(toolId)}>
            {iconFailed[toolId] ? <span className={llmStyles.terminalTabMonogram}>{meta.monogram}</span>
              : <img className={llmStyles.terminalTabIcon} data-tool={toolId} src={EXTERNAL_CLI_TOOL_ICONS[toolId]} alt="" onError={() => setIconFailed((prev) => ({ ...prev, [toolId]: true }))} />}
            {meta.displayName}
          </button>
        })}
      </div>
      <div className={`${styles.summary} ${isEmpty ? styles.summaryEmpty : ''}`}>
        <div className={styles.summaryCell}>
          <OverallDonut rows={view.rows} total={view.totalTokens} trackColor={trackColor} label={t('settings:usageStats.overall')} />
          <div className={styles.summaryInfo}>
            <span className={styles.label}>{t('settings:usageStats.total')}</span>
            <div className={styles.value} data-testid="usage-total">{formatCount(animatedTotal)}<small>tokens</small></div>
            <div className={styles.ioSplit} data-testid="usage-io">
              <span><i className={styles.ioDotIn} />{t('settings:usageStats.input')} <strong>{formatCount(animatedInput)}</strong></span>
              <span><i className={styles.ioDotOut} />{t('settings:usageStats.output')} <strong data-testid="usage-output">{formatCount(animatedOutput)}</strong></span>
            </div>
            <div className={styles.legend}>{view.rows.map((row) => <span key={row.preset}><i style={{ background: presetColor(row.preset) }} />{presetName(row.preset)} <strong>{view.totalTokens > 0 ? Math.round(row.totalTokens / view.totalTokens * 100) : 0}%</strong></span>)}</div>
          </div>
        </div>
        <div className={styles.summaryCell}>
          <CacheDonut hits={cache.hits} misses={cache.misses} rate={cache.rate} hasData={cache.hasData} hitColor={hitColor} missColor={missColor} trackColor={trackColor} label={t('settings:usageStats.hitRate')} />
          <div className={styles.summaryInfo}>
            <span className={styles.label}>{t('settings:usageStats.hitRate')}</span>
            <div className={styles.value} data-testid="usage-cache-rate">{formatRate(cache.hasData ? cache.rate : undefined)}</div>
            <div className={styles.legend}>{cache.hasData ? <><span><i style={{ background: hitColor }} />{t('settings:usageStats.hit')} <strong>{formatCount(cache.hits)}</strong></span><span><i style={{ background: missColor }} />{t('settings:usageStats.miss')} <strong>{formatCount(cache.misses)}</strong></span></> : t('settings:usageStats.noCacheData')}</div>
          </div>
        </div>
        <div className={styles.summaryCell}>
          <div className={styles.ioBar} role="img" aria-label={t('settings:usageStats.ioTitle')}>
            <div className={styles.ioTrack}>
              <div className={styles.ioFillIn} style={{ width: `${ioTotal > 0 ? (view.inputTokens / ioTotal) * 100 : 0}%` }} />
              <div className={styles.ioFillOut} style={{ width: `${ioTotal > 0 ? (view.outputTokens / ioTotal) * 100 : 0}%` }} />
            </div>
            <span className={styles.ioShare}>{formatRate(outputShare)}</span>
          </div>
          <div className={styles.summaryInfo}>
            <span className={styles.label}>{t('settings:usageStats.ioTitle')}</span>
            <div className={styles.value} data-testid="usage-input">{formatCount(animatedInput)}<small>→ {formatCount(animatedOutput)}</small></div>
            <div className={styles.legend}><span>{t('settings:usageStats.ioShare')} <strong>{formatRate(outputShare)}</strong></span><span>{view.terminals} {t('settings:usageStats.terminals')}</span></div>
          </div>
        </div>
      </div>
      <div className={styles.trendSection}>
        <div className={styles.toolbar}><h4 className={styles.title}>{t('settings:usageStats.trend')}</h4><span className={styles.label}>tokens{trendBucketHint ? ` · ${trendBucketHint}` : ''}</span></div>
        <p className={styles.hint}>{t('settings:usageStats.snapshotHint')}</p>
        {view.terminals > 0
          ? <TrendLines series={view.series} range={range} metrics={metrics} label={t('settings:usageStats.trend')} />
          : <EmptyState
            title={t('settings:usageStats.empty')}
            desc={emptyDesc}
            resetLabel={t('settings:usageStats.emptyReset')}
            showReset={range !== 'today' || activeType !== 'all'}
            onReset={resetFilters}
          />}
      </div>
      {view.rows.length > 0 && <div className={styles.breakdown}>
        <h4 className={styles.title}>{t('settings:usageStats.breakdown')}</h4>
        {view.rows.map((row) => {
          const split = cacheSplitFor(row.cacheReadTokens, row.inputTokens, row.cacheWriteTokens)
          return <article className={styles.modelRow} key={row.preset}>
            <div className={styles.modelInfo}>
              <div className={styles.modelName}><i style={{ background: presetColor(row.preset) }} />{presetName(row.preset)}<span>{row.terminals} {t('settings:usageStats.terminals')}</span></div>
              <div className={styles.models}>{row.models.length ? row.models.map((model) => <span key={model} title={model}>{model}</span>) : <span>{t('settings:usageStats.unknownModel')}</span>}</div>
            </div>
            <div className={styles.modelTotal}><span className={styles.label}>{t('settings:usageStats.total')}</span><strong>{formatCount(row.totalTokens)}</strong><small>tokens</small></div>
            <div className={styles.modelIo}><span className={styles.label}>{t('settings:usageStats.input')}</span><strong>{formatCount(row.inputTokens)}</strong></div>
            <div className={styles.modelIo}><span className={styles.label}>{t('settings:usageStats.output')}</span><strong>{formatCount(row.outputTokens)}</strong></div>
            <div className={styles.modelRate}><span className={styles.label}>{t('settings:usageStats.hitRate')}</span><strong>{formatRate(split.hasData ? split.rate : undefined)}</strong></div>
          </article>
        })}
      </div>}
    </section>
  )
}

function formatRangeLabel(start: number, end: number): string {
  const from = new Date(start)
  const to = new Date(Math.max(end, start))
  return `${from.getMonth() + 1}/${from.getDate()} – ${to.getMonth() + 1}/${to.getDate()}`
}
