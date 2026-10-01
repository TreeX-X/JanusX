import type { Terminal } from '@/types'
import { getTerminalStatusVisual, terminalStatusRingClass } from '@/lib/terminal-sidebar-visual'

interface TerminalStatusLightProps {
  status: Terminal['status']
  /** 紧凑版（8px 环）：中部 tab / 溢出 chips 等窄处用，与侧栏 12px 环同语言 */
  compact?: boolean
}

/**
 * 终端状态灯（左右统一的唯一形态）：12px 环（侧栏行）/ 8px 紧凑环（中部 tab）。
 * 色/形/动效三编码——颜色走 theme definition，形状走 term-status-ring--*，
 * 动效走共享 animation；文字只出现在外层 tooltip / title 里，此处纯视觉。
 */
export function TerminalStatusLight({ status, compact = false }: TerminalStatusLightProps) {
  const visual = getTerminalStatusVisual(status)
  return (
    <span
      aria-hidden="true"
      className={`term-status-ring ${terminalStatusRingClass(status)}${compact ? ' term-status-ring--compact' : ''}`}
      style={{ color: visual.color }}
    >
      {status === 'running' && <span className="term-status-orbit" />}
    </span>
  )
}
