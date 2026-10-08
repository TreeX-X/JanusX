import type { Terminal } from '@/types'
import { useThemeStore } from '@/stores/theme'
import { getThemeDefinition } from '../../../shared/theme/registry'

export interface TerminalStatusVisual {
  label: string
  labelKey: string
  color: string
  background: string
}

// Note: internal status keeps six values for hook routing and sort order, but
// approval and input share one attention visual — see .agents/notes/terminal/terminal-status-display.md
// 色值唯一来源：theme definition status 槽（M1 统一结构），禁止各处自建。
export function getTerminalStatusVisual(
  status: Terminal['status'],
  theme: unknown = useThemeStore.getState().theme,
): TerminalStatusVisual {
  const slots = getThemeDefinition(theme).status
  switch (status) {
    case 'running':
      return { label: '运行中', labelKey: 'terminal:status.running', ...slots.running }
    case 'needs-input':
    case 'needs-approval':
      return { label: '待处理', labelKey: 'terminal:status.needs-action', ...slots.attention }
    case 'degraded':
      return { label: '受限', labelKey: 'terminal:status.degraded', ...slots.degraded }
    case 'error':
      return { label: '异常', labelKey: 'terminal:status.error', ...slots.error }
    case 'wait':
    default:
      return { label: '空闲', labelKey: 'terminal:status.wait', ...slots.wait }
  }
}

export const TERMINAL_ATTENTION_ORDER: Record<Terminal['status'], number> = {
  'needs-approval': 0,
  'needs-input': 1,
  degraded: 2,
  error: 3,
  running: 4,
  wait: 5,
}

/**
 * 状态灯形状映射（与 TerminalStatusLight 共享）：颜色走 getTerminalStatusVisual，
 * 形状走 term-status-ring--* 修饰类，动效走共享 animation。色盲读者仅凭形状/动效
 * 也能区分 running（淡环+走圈光弧）/ 待处理（呼吸）/ degraded（虚线环）/
 * error（实心盘）/ wait（降透明度空心环）。
 */
export function terminalStatusRingClass(status: Terminal['status']): string {
  switch (status) {
    case 'running':
      return 'term-status-ring--running'
    case 'needs-approval':
    case 'needs-input':
      return 'term-status-pulse'
    case 'degraded':
      return 'term-status-ring--degraded'
    case 'error':
      return 'term-status-ring--error'
    case 'wait':
    default:
      return 'term-status-ring--idle'
  }
}

export function summarizeTerminalActivity(terminals: readonly Terminal[]) {
  const needsApproval = terminals.filter((terminal) => terminal.status === 'needs-approval').length
  const needsInput = terminals.filter((terminal) => terminal.status === 'needs-input').length
  const degraded = terminals.filter((terminal) => terminal.status === 'degraded').length
  return {
    total: terminals.length,
    running: terminals.filter((terminal) => terminal.status === 'running').length,
    errors: terminals.filter((terminal) => terminal.status === 'error').length,
    needsApproval,
    needsInput,
    degraded,
    needsAction: needsApproval + needsInput + degraded,
  }
}
