// Note: settings usage tab, same layout class as the LLM config — see .agents/notes/2026-10-02-usage-telemetry-fix-and-stats--61b5d05c.md
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
import styles from './AppSettingsModal.module.css'

const RANGES: UsageRange[] = ['today', 'week', 'month']
const RANGE_KEYS = { today: 'rangeToday', week: 'rangeWeek', month: 'rangeMonth' } as const
const SHELL_COLOR = '#8a8a93'

type TypeFilter = 'all' | ExternalCliToolId

function formatCount(value: number): string {
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

function TypeBar({ row, hitColor, missColor, trackColor }: {
  row: UsagePresetRow
  hitColor: string
  missColor: string
  trackColor: string
}) {
  const split = cacheSplitFor(row.cacheReadTokens, row.inputTokens, row.cacheWriteTokens)
  const output = row.outputTokens
  const total = split.hasData ? split.hits + split.misses + output : output
  if (total <= 0) return null
  const width = (value: number) => `${Math.max(0, (value / total) * 100)}%`
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: trackColor }} aria-hidden="true">
      {split.hasData && split.hits > 0 && <div style={{ width: width(split.hits), background: hitColor }} />}
      {split.hasData && split.misses > 0 && <div style={{ width: width(split.misses), background: missColor }} />}
      {output > 0 && <div style={{ width: width(output), background: 'color-mix(in srgb, var(--shell-text) 30%, transparent)' }} />}
    </div>
  )
}

function TrendBars({ series, range, hitColor, missColor, trackColor, unknownLabel }: {
  series: TimeBucket[]
  range: UsageRange
  hitColor: string
  missColor: string
  trackColor: string
  unknownLabel: string
}) {
  const max = Math.max(0, ...series.map((bucket) => bucket.hits + bucket.misses + bucket.unknown + bucket.output))
  const showLabel = (bucket: TimeBucket) => {
    if (range === 'week') return true
    if (range === 'today') return Number(bucket.label) % 6 === 0
    return Number(bucket.label.split('/')[1]) % 5 === 1
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 96 }} aria-hidden="true">
        {series.map((bucket) => {
          const total = bucket.hits + bucket.misses + bucket.unknown + bucket.output
          const height = max > 0 && total > 0 ? `${Math.max(4, (total / max) * 100)}%` : '4px'
          const share = (value: number) => `${total > 0 ? (value / total) * 100 : 0}%`
          return (
            <div key={bucket.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }} title={`${bucket.label}: ${formatCount(total)}`}>
              <div style={{ display: 'flex', flexDirection: 'column-reverse', height, borderRadius: 2, overflow: 'hidden', background: total > 0 ? trackColor : 'transparent' }}>
                {bucket.hits > 0 && <div style={{ height: share(bucket.hits), background: hitColor }} />}
                {bucket.misses > 0 && <div style={{ height: share(bucket.misses), background: missColor }} />}
                {bucket.unknown > 0 && <div style={{ height: share(bucket.unknown), background: 'color-mix(in srgb, var(--shell-text) 30%, transparent)' }} title={unknownLabel} />}
                {bucket.output > 0 && <div style={{ height: share(bucket.output), background: 'color-mix(in srgb, var(--shell-text) 55%, transparent)' }} />}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }} aria-hidden="true">
        {series.map((bucket) => (
          <div key={bucket.key} style={{ flex: 1, textAlign: 'center', fontSize: 9, opacity: 0.7 }}>
            {showLabel(bucket) ? bucket.label : ''}
          </div>
        ))}
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
  const overall = aggregateUsageStats(terminals, range)
  const view = aggregateUsageStats(terminals, range, Date.now(), activeType === 'all' ? undefined : activeType)
  const overallCache = cacheSplitFor(overall.cacheReadTokens, overall.inputTokens, overall.cacheWriteTokens)
  const rows = view.rows

  return (
    <section className={llmStyles.section}>
      <h3 className={llmStyles.sectionTitle}>
        {t('settings:usageStats.total')} · {formatCount(view.totalTokens)}
      </h3>
      <div className={llmStyles.terminalTabs} role="tablist" aria-label={t('settings:usageStats.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={activeType === 'all'}
          className={`${llmStyles.terminalTab} ${activeType === 'all' ? llmStyles.terminalTabActive : ''}`}
          onClick={() => setActiveType('all')}
        >
          {t('settings:usageStats.typeAll')}
        </button>
        {EXTERNAL_CLI_TOOL_ORDER.map((toolId) => {
          const meta = EXTERNAL_CLI_TOOL_META[toolId]
          const active = toolId === activeType
          return (
            <button
              key={toolId}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${llmStyles.terminalTab} ${active ? llmStyles.terminalTabActive : ''}`}
              onClick={() => setActiveType(toolId)}
            >
              {iconFailed[toolId]
                ? <span className={llmStyles.terminalTabMonogram}>{meta.monogram}</span>
                : (
                  <img
                    className={llmStyles.terminalTabIcon}
                    src={EXTERNAL_CLI_TOOL_ICONS[toolId]}
                    alt=""
                    aria-hidden="true"
                    onError={() => setIconFailed((prev) => ({ ...prev, [toolId]: true }))}
                  />
                )}
              {meta.displayName}
            </button>
          )
        })}
      </div>
      <div className={llmStyles.terminalTabs} role="group" aria-label={t('settings:usageStats.title')}>
        {RANGES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            disabled={candidate === range}
            className={`${llmStyles.terminalTab} ${candidate === range ? llmStyles.terminalTabActive : ''}`}
            onClick={() => setRange(candidate)}
          >
            {t(`settings:usageStats.${RANGE_KEYS[candidate]}`)}
          </button>
        ))}
      </div>
      <div className={styles.lsCard}>
        <div className={styles.lsCardHeader}>
          <OverallDonut rows={overall.rows} total={overall.totalTokens} trackColor={trackColor} label={t('settings:usageStats.overall')} />
          <div className={styles.lsCardInfo}>
            <span className={styles.lsCardName}>{t('settings:usageStats.overall')} · {formatCount(overall.totalTokens)}</span>
            <span className={styles.lsCardDesc}>
              {overall.rows.map((row) => (
                <span key={row.preset}>
                  <span style={{ color: presetColor(row.preset) }}>●</span> {presetName(row.preset)}{' '}
                  {overall.totalTokens > 0 ? Math.round((row.totalTokens / overall.totalTokens) * 100) : 0}% ·{' '}
                </span>
              ))}
            </span>
          </div>
          <CacheDonut
            hits={overallCache.hits}
            misses={overallCache.misses}
            rate={overallCache.rate}
            hasData={overallCache.hasData}
            hitColor={hitColor}
            missColor={missColor}
            trackColor={trackColor}
            label={t('settings:usageStats.hitRate')}
          />
          <div className={styles.lsCardInfo}>
            <span className={styles.lsCardName}>
              {t('settings:usageStats.hitRate')} · {formatRate(overallCache.hasData ? overallCache.rate : undefined)}
            </span>
            <span className={styles.lsCardDesc}>
              <span style={{ color: hitColor }}>●</span> {t('settings:usageStats.hit')} {formatCount(overallCache.hits)} ·{' '}
              <span style={{ color: missColor }}>●</span> {t('settings:usageStats.miss')} {formatCount(overallCache.misses)}
            </span>
            {!overallCache.hasData && (
              <span className={styles.lsCardDesc}>{t('settings:usageStats.noCacheData')}</span>
            )}
          </div>
        </div>
      </div>
      <div className={styles.lsCard}>
        <div className={styles.lsCardHeader}>
          <div className={styles.lsCardInfo}>
            <span className={styles.lsCardName}>{t('settings:usageStats.trend')}</span>
            <span className={styles.lsCardDesc}>
              <span style={{ color: hitColor }}>●</span> {t('settings:usageStats.hit')} ·{' '}
              <span style={{ color: missColor }}>●</span> {t('settings:usageStats.miss')} ·{' '}
              <span>●</span> {t('settings:usageStats.unknown')}
            </span>
          </div>
        </div>
        <TrendBars series={view.series} range={range} hitColor={hitColor} missColor={missColor} trackColor={trackColor} unknownLabel={t('settings:usageStats.unknown')} />
        {view.terminals === 0 && (
          <div className={styles.lsCardHint}>{t('settings:usageStats.empty')}</div>
        )}
      </div>
      {rows.length > 0 && (
        <div className={styles.lsCard}>
          <div className={styles.lsCardMeta}>
            {rows.map((row) => {
              const split = cacheSplitFor(row.cacheReadTokens, row.inputTokens, row.cacheWriteTokens)
              return (
                <div key={row.preset}>
                  <span>
                    {presetName(row.preset)} ·{' '}
                    {t('settings:usageStats.hitRate')} {formatRate(split.hasData ? split.rate : undefined)}
                    {split.hasData
                      ? ` (${t('settings:usageStats.hit')} ${formatCount(split.hits)}/${t('settings:usageStats.miss')} ${formatCount(split.misses)})`
                      : ` · ${t('settings:usageStats.noCacheData')}`} · {row.terminals}{' '}
                    {t('settings:usageStats.terminals')}
                    {row.models.length > 0 ? ` · ${row.models.join(', ')}` : ''}
                  </span>
                  <TypeBar row={row} hitColor={hitColor} missColor={missColor} trackColor={trackColor} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
