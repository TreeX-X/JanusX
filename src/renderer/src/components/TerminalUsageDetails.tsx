// Note: direct usage content and terminal lifetime — see .agents/notes/terminal/requirements/usage-panel-direct-content.md
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { Terminal } from '@/types'

const tokenCount = (value?: number) => value === undefined ? '–' : value.toLocaleString('en-US')

export function TerminalRuntime({ terminal }: { terminal: Terminal }) {
  const { t } = useI18n('terminal')
  const [now, setNow] = useState(Date.now)
  const startedAt = terminal.telemetryStartedAt
  useEffect(() => {
    if (startedAt === undefined || terminal.exitCode !== undefined) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, terminal.exitCode])
  const end = terminal.exitCode === undefined ? now : terminal.updatedAt
  const seconds = startedAt === undefined || end === undefined ? undefined : Math.max(0, Math.floor((end - startedAt) / 1000))
  const duration = seconds === undefined ? '–' : `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return <span className="shrink-0 tabular-nums text-[10px] text-[var(--shell-muted)]">{t('terminal:context.row.runtime')} {duration}</span>
}

export function TerminalUsageDetails({ terminal }: { terminal: Terminal }) {
  const { t } = useI18n('terminal')
  const rate = terminal.recentCacheHitRate
  const rows = [
    [t('terminal:context.row.recentCacheHitRate'), rate === undefined ? '–' : `${(rate * 100).toFixed(1)}%`],
    [t('terminal:context.row.cacheRead'), tokenCount(terminal.cacheReadTokens)],
    [t('terminal:context.row.cacheWrite'), tokenCount(terminal.cacheWriteTokens)],
    [t('terminal:context.row.sessionTotal'), tokenCount(terminal.totalTokens)],
    [t('terminal:context.row.inputOutput'), `${tokenCount(terminal.inputTokens)} / ${tokenCount(terminal.outputTokens)}`],
  ]
  return <span className="grid min-w-0 gap-1 border-t border-[rgba(255,255,255,0.07)] pt-2">
    {rows.map(([label, value]) => <span key={label} className="flex min-w-0 items-center justify-between gap-3">
      <span className="text-[10px] text-[var(--shell-muted)]">{label}</span>
      <span className="min-w-0 break-all text-right tabular-nums text-[var(--shell-text)]">{value}</span>
    </span>)}
  </span>
}
