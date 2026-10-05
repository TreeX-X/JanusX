// Note: shared usage filters and cumulative snapshot curves — see .agents/notes/2026-10-02-usage-telemetry-fix-and-stats--61b5d05c.md
import { useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { useThemeStore } from '@/stores/theme'
import {
  aggregateUsageStats,
  cacheSplitFor,
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

const RANGES: UsageRange[] = ['today', 'week', 'month']
const RANGE_KEYS = { today: 'rangeToday', week: 'rangeWeek', month: 'rangeMonth' } as const
const SHELL_COLOR = '#8a8a93'

type TypeFilter = 'all' | ExternalCliToolId

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
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

type TrendMetric = { key: 'hits' | 'misses' | 'unknown' | 'output'; label: string; color: string }

function TrendLines({ series, range, metrics, label }: {
  series: TimeBucket[]
  range: UsageRange
  metrics: TrendMetric[]
  label: string
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const ceiling = Math.max(1, ...series.flatMap((bucket) => metrics.map(({ key }) => bucket[key])))
  const x = (index: number) => 52 + index * 620 / Math.max(1, series.length - 1)
  const y = (value: number) => 174 - value / ceiling * 146
  const active = activeIndex === null ? undefined : series[activeIndex]
  const dateLabel = (bucket: TimeBucket) => range === 'today' ? `${bucket.label.padStart(2, '0')}:00` : bucket.label
  return (
    <div className={styles.trend}>
      <svg viewBox="0 0 700 208" className={styles.chart} role="group" aria-label={label} onMouseLeave={() => setActiveIndex(null)}>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction} className={styles.axis}>
            <line x1="52" x2="672" y1={y(ceiling * fraction)} y2={y(ceiling * fraction)} />
            <text x="40" y={y(ceiling * fraction) + 4} textAnchor="end">{formatCount(ceiling * fraction)}</text>
          </g>
        ))}
        {metrics.map(({ key, color }) => {
          // Horizontal control points keep each segment within its two measured values.
          const path = series.map((bucket, index) => index === 0
            ? `M ${x(index)} ${y(bucket[key])}`
            : `C ${(x(index - 1) + x(index)) / 2} ${y(series[index - 1][key])}, ${(x(index - 1) + x(index)) / 2} ${y(bucket[key])}, ${x(index)} ${y(bucket[key])}`).join(' ')
          return <g key={key}>
            <path data-series={key} d={path} fill="none" stroke={color} strokeWidth="2" strokeDasharray={key === 'unknown' ? '4 4' : undefined} vectorEffect="non-scaling-stroke" />
            {series.map((bucket, index) => bucket[key] > 0 && <circle key={bucket.key} cx={x(index)} cy={y(bucket[key])} r="3" fill={color} />)}
          </g>
        })}
        {active && <line className={styles.cursor} x1={x(activeIndex!)} x2={x(activeIndex!)} y1="22" y2="174" />}
        {series.map((bucket, index) => {
          const showLabel = index === 0 || index === series.length - 1 || index % Math.max(1, Math.ceil(series.length / 6)) === 0
          return <g key={bucket.key}>
            {showLabel && <text className={styles.dateLabel} x={x(index)} y="199" textAnchor="middle">{dateLabel(bucket)}</text>}
            <rect x={x(index) - 310 / Math.max(1, series.length - 1)} y="20" width={620 / Math.max(1, series.length - 1)} height="160" fill="transparent" tabIndex={0}
              role="img" aria-label={`${dateLabel(bucket)}: ${metrics.map(({ key, label: name }) => `${name} ${bucket[key]}`).join(', ')}`}
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
  const [range, setRange] = useState<UsageRange>('today')
  const [activeType, setActiveType] = useState<TypeFilter>('all')
  const [iconFailed, setIconFailed] = useState<Partial<Record<ExternalCliToolId, boolean>>>({})
  const view = aggregateUsageStats(terminals, range, Date.now(), activeType === 'all' ? undefined : activeType)
  const cache = cacheSplitFor(view.cacheReadTokens, view.inputTokens, view.cacheWriteTokens)
  const metrics: TrendMetric[] = [
    { key: 'hits', label: t('settings:usageStats.hit'), color: hitColor },
    { key: 'misses', label: t('settings:usageStats.miss'), color: missColor },
    { key: 'unknown', label: t('settings:usageStats.unknown'), color: 'var(--shell-muted)' },
    { key: 'output', label: t('settings:usageStats.output'), color: 'var(--shell-text)' },
  ]
  return (
    <section className={styles.panel} aria-label={t('settings:usageStats.title')}>
      <div className={styles.toolbar}>
        <h3 className={styles.title}>{t('settings:usageStats.title')}</h3>
        <div className={styles.ranges} role="group" aria-label={t('settings:usageStats.timeRange')}>
          {RANGES.map((candidate) => <button key={candidate} type="button" aria-pressed={candidate === range} onClick={() => setRange(candidate)}>{t(`settings:usageStats.${RANGE_KEYS[candidate]}`)}</button>)}
        </div>
      </div>
      <div className={styles.types} role="group" aria-label={t('settings:usageStats.terminalType')}>
        <button type="button" aria-pressed={activeType === 'all'} onClick={() => setActiveType('all')}>{t('settings:usageStats.typeAll')}</button>
        {EXTERNAL_CLI_TOOL_ORDER.map((toolId) => {
          const meta = EXTERNAL_CLI_TOOL_META[toolId]
          return <button key={toolId} type="button" aria-pressed={toolId === activeType} onClick={() => setActiveType(toolId)}>
            {iconFailed[toolId] ? <span className={llmStyles.terminalTabMonogram}>{meta.monogram}</span>
              : <img className={llmStyles.terminalTabIcon} data-tool={toolId} src={EXTERNAL_CLI_TOOL_ICONS[toolId]} alt="" onError={() => setIconFailed((prev) => ({ ...prev, [toolId]: true }))} />}
            {meta.displayName}
          </button>
        })}
      </div>
      <div className={styles.summary}>
        <div className={styles.summaryCell}>
          <OverallDonut rows={view.rows} total={view.totalTokens} trackColor={trackColor} label={t('settings:usageStats.overall')} />
          <div className={styles.summaryInfo}>
            <span className={styles.label}>{t('settings:usageStats.total')}</span>
            <div className={styles.value} data-testid="usage-total">{formatCount(view.totalTokens)}<small>tokens</small></div>
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
      </div>
      <div className={styles.trendSection}>
        <div className={styles.toolbar}><h4 className={styles.title}>{t('settings:usageStats.trend')}</h4><span className={styles.label}>tokens</span></div>
        <p className={styles.hint}>{t('settings:usageStats.snapshotHint')}</p>
        {view.terminals > 0 ? <TrendLines key={`${activeType}-${range}`} series={view.series} range={range} metrics={metrics} label={t('settings:usageStats.trend')} /> : <div className={styles.empty}>{t('settings:usageStats.empty')}</div>}
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
            <div className={styles.modelRate}><span className={styles.label}>{t('settings:usageStats.hitRate')}</span><strong>{formatRate(split.hasData ? split.rate : undefined)}</strong></div>
          </article>
        })}
      </div>}
    </section>
  )
}
