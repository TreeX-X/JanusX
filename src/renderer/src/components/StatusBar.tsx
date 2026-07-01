import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'

export function StatusBar() {
  const { terminals, activeTerminalId } = useWorkspaceStore()
  const { loadState, blueprintMode } = useAppStore()

  const focusedTerminal = activeTerminalId ? terminals.find((terminal) => terminal.id === activeTerminalId) ?? null : null

  const statusText: Record<string, string> = {
    'no-workspace': '等待加载工作区',
    'workspace-loaded': '已加载工作区',
    'no-terminal': '等待选择终端',
    'terminal-active': focusedTerminal
      ? `${focusedTerminal.name} · ${focusedTerminal.status}`
      : `${terminals.length} 个终端 · 未聚焦`,
  }

  return (
    <footer
      className="col-span-3 flex items-center justify-between px-3.5 text-[10px]"
      style={{
        background: 'rgba(8, 8, 10, 0.95)',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-dim)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="h-[5px] w-[5px] rounded-full animate-pulse"
          style={{
            background: '#ff7830',
            boxShadow: '0 0 6px rgba(255, 120, 48, 0.6)',
          }}
        />
        <span>{blueprintMode ? '蓝图画布引擎运行中' : (statusText[loadState] ?? '就绪')}</span>
      </div>
      <span>v0.1.0</span>
    </footer>
  )
}
