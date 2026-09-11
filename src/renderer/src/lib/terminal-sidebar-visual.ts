import type { Terminal } from '@/types'

export interface TerminalStatusVisual {
  label: string
  labelKey: string
  color: string
  background: string
}

// Note: six-state sidebar contract keeps hook-derived attention visible — see .agents/notes/implemented/feature/2026-09-11-terminal-sidebar-states.md
const STATUS_VISUALS: Record<Terminal['status'], TerminalStatusVisual> = {
  running: { label: '运行中', labelKey: 'terminal:status.running', color: '#6bd89b', background: 'rgba(70, 190, 125, 0.1)' },
  wait: { label: '空闲', labelKey: 'terminal:status.wait', color: '#8a8a93', background: 'rgba(255,255,255,0.05)' },
  'needs-input': { label: '待输入', labelKey: 'terminal:status.needs-input', color: '#7db8ff', background: 'rgba(93, 165, 255, 0.1)' },
  'needs-approval': { label: '待授权', labelKey: 'terminal:status.needs-approval', color: '#f0a35e', background: 'rgba(240, 163, 94, 0.12)' },
  degraded: { label: '受限', labelKey: 'terminal:status.degraded', color: '#c9a0ff', background: 'rgba(160, 110, 255, 0.1)' },
  error: { label: '异常', labelKey: 'terminal:status.error', color: '#ff7474', background: 'rgba(255, 88, 88, 0.1)' },
}

export function getTerminalStatusVisual(status: Terminal['status']): TerminalStatusVisual {
  return STATUS_VISUALS[status] ?? STATUS_VISUALS.wait
}

export const TERMINAL_ATTENTION_ORDER: Record<Terminal['status'], number> = {
  'needs-approval': 0,
  'needs-input': 1,
  degraded: 2,
  error: 3,
  running: 4,
  wait: 5,
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
