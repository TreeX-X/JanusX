import type { Terminal } from '@/types'

export interface TerminalStatusVisual {
  label: string
  color: string
  background: string
}

const STATUS_VISUALS: Record<Terminal['status'], TerminalStatusVisual> = {
  running: { label: '运行中', color: '#6bd89b', background: 'rgba(70, 190, 125, 0.1)' },
  wait: { label: '等待', color: '#d6a85f', background: 'rgba(214, 168, 95, 0.09)' },
  error: { label: '异常', color: '#ff7474', background: 'rgba(255, 88, 88, 0.1)' },
}

export function getTerminalStatusVisual(status: Terminal['status']): TerminalStatusVisual {
  return STATUS_VISUALS[status]
}

export function summarizeTerminalActivity(terminals: readonly Terminal[]) {
  return {
    total: terminals.length,
    running: terminals.filter((terminal) => terminal.status === 'running').length,
    errors: terminals.filter((terminal) => terminal.status === 'error').length,
  }
}
