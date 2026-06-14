import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'

export function StatusBar() {
  const { terminals, activeWorkspaceId, workspaces } = useWorkspaceStore()
  const { loadState, blueprintMode } = useAppStore()

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const statusText: Record<string, string> = {
    'no-workspace': '等待加载工作区',
    'workspace-loaded': '已加载工作区',
    'no-terminal': '等待选择终端',
    'terminal-active': `${terminals.length} 个终端`,
  }

  return (
    <footer
      className="col-span-3 flex items-center justify-between px-3.5 text-[10px]"
      style={{
        background: 'rgba(8, 8, 8, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        color: '#555',
      }}
    >
      <div className="flex items-center gap-3.5">
        <div className="flex items-center gap-1.5">
          <div
            className="w-[5px] h-[5px] rounded-full animate-pulse"
            style={{
              background: '#ff7830',
              boxShadow: '0 0 6px rgba(255, 120, 48, 0.6)',
            }}
          />
          <span>已连接</span>
        </div>
        <span>{blueprintMode ? '蓝图画布引擎运行中' : (statusText[loadState] ?? '就绪')}</span>
        {workspace && <span>{workspace.name}</span>}
      </div>
      <div className="flex items-center gap-2.5">
        {workspace && <span>{workspace.path}</span>}
        <span>v0.1.0</span>
      </div>
    </footer>
  )
}
