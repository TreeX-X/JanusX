import { useCallback } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import type { Workspace, FileNode } from '@/types'

export function Sidebar() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, addWorkspace, removeWorkspace } =
    useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  const handleAddWorkspace = useCallback(async () => {
    try {
      const result = (await window.electron.invoke('dialog:openDirectory')) as {
        canceled: boolean
        filePaths: string[]
      }
      if (result.canceled || !result.filePaths[0]) return

      const folderPath = result.filePaths[0]
      const workspace = (await window.electron.invoke('workspace:create', {
        name: folderPath.split(/[/\\]/).pop() || 'Workspace',
        path: folderPath,
      })) as Workspace

      addWorkspace(workspace)
      setActiveWorkspace(workspace.id)
      setLoadState('no-terminal')

      // 加载文件树
      try {
        const tree = (await window.electron.invoke('filetree:load', folderPath)) as FileNode[]
        useWorkspaceStore.setState({ fileTree: tree })
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }, [addWorkspace, setActiveWorkspace, setLoadState])

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!confirm('确认删除此工作区？')) return
      try {
        await window.electron.invoke('workspace:delete', id)
        removeWorkspace(id)
        if (workspaces.length <= 1) {
          setLoadState('no-workspace')
          useWorkspaceStore.setState({ fileTree: [], terminals: [], activeTerminalId: null })
        }
      } catch (err) {
        console.error('Failed to delete workspace:', err)
      }
    },
    [removeWorkspace, workspaces.length, setLoadState]
  )

  const handleSelect = useCallback(
    async (id: string) => {
      setActiveWorkspace(id)
      // 根据目标工作区是否有终端来设置状态
      const snapshot = useWorkspaceStore.getState().terminalSnapshots[id]
      setLoadState(snapshot && snapshot.terminals.length > 0 ? 'terminal-active' : 'no-terminal')
      // 加载文件树
      try {
        const ws = workspaces.find((w) => w.id === id)
        if (ws) {
          const tree = (await window.electron.invoke('filetree:load', ws.path)) as FileNode[]
          useWorkspaceStore.setState({ fileTree: tree })
        }
      } catch (err) {
        console.error('Failed to load file tree:', err)
      }
    },
    [setActiveWorkspace, setLoadState, workspaces]
  )

  return (
    <aside
      className="flex flex-col overflow-hidden"
      style={{
        background: 'rgba(26, 26, 26, 0.85)',
        backdropFilter: 'blur(16px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* 展开态 */}
      {!sidebarCollapsed && (
        <>
          <div
            className="p-2.5 px-3 text-[10px] font-semibold tracking-wider uppercase text-[#555] flex justify-between items-center"
            style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
          >
            <span>工作区</span>
            <div className="flex gap-1 items-center">
              <button
                onClick={handleAddWorkspace}
                className="w-[18px] h-[18px] rounded-[3px] flex items-center justify-center text-sm leading-none cursor-pointer transition-colors"
                style={{
                  background: 'rgba(255, 120, 48, 0.08)',
                  border: '1px solid rgba(255, 120, 48, 0.2)',
                  color: '#ff7830',
                }}
              >
                +
              </button>
              <button
                onClick={toggleSidebar}
                title="收起侧栏"
                className="w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              >
                <div
                  className="w-[7px] h-[7px] transition-colors"
                  style={{
                    borderRight: '1.5px solid rgba(255, 255, 255, 0.2)',
                    borderBottom: '1.5px solid rgba(255, 255, 255, 0.2)',
                    transform: 'rotate(135deg)',
                  }}
                />
              </button>
            </div>
          </div>
          <div className="flex-1 p-1.5 overflow-y-auto">
            {workspaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-30">
                <div className="text-xs text-[#666]">暂无工作区</div>
              </div>
            ) : (
              workspaces.map((ws) => (
                <div
                  key={ws.id}
                  onClick={() => handleSelect(ws.id)}
                  className="p-[9px] px-3 mb-px rounded-md cursor-pointer transition-all flex items-center gap-2.5 text-[13px] relative group"
                  style={{
                    color: ws.id === activeWorkspaceId ? '#ff7830' : '#999',
                    background:
                      ws.id === activeWorkspaceId ? 'rgba(255, 120, 48, 0.08)' : 'transparent',
                  }}
                >
                  {ws.id === activeWorkspaceId && (
                    <div
                      className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-sm"
                      style={{ background: '#ff7830' }}
                    />
                  )}
                  <div
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{
                      background: ws.id === activeWorkspaceId ? '#ff7830' : '#444',
                    }}
                  />
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {ws.name}
                  </span>
                  <button
                    onClick={(e) => handleDelete(ws.id, e)}
                    className="w-[16px] h-[16px] rounded-[3px] flex items-center justify-center text-[12px] leading-none text-[#666] opacity-0 group-hover:opacity-100 transition-all hover:bg-[rgba(255,88,88,0.12)] hover:!text-[#ff5858]"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* 收起态 */}
      {sidebarCollapsed && (
        <div className="flex-1 flex flex-col items-center py-3 gap-0.5 overflow-hidden">
          <button
            onClick={toggleSidebar}
            title="展开侧栏"
            className="w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)] mb-1"
          >
            <div
              className="w-[7px] h-[7px] transition-colors"
              style={{
                borderRight: '1.5px solid rgba(255, 255, 255, 0.2)',
                borderBottom: '1.5px solid rgba(255, 255, 255, 0.2)',
                transform: 'rotate(-45deg)',
              }}
            />
          </button>
          <div
            className="w-5 h-px my-1"
            style={{ background: 'rgba(255, 255, 255, 0.06)' }}
          />
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              onClick={() => handleSelect(ws.id)}
              title={ws.name}
              className="w-8 h-7 flex items-center justify-center cursor-pointer transition-all relative"
            >
              {ws.id === activeWorkspaceId && (
                <div
                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-sm"
                  style={{ background: '#ff7830' }}
                />
              )}
              <div
                className="rounded-full transition-all"
                style={{
                  width: ws.id === activeWorkspaceId ? '8px' : '6px',
                  height: ws.id === activeWorkspaceId ? '8px' : '6px',
                  background: ws.id === activeWorkspaceId ? '#ff7830' : 'rgba(255, 255, 255, 0.12)',
                  boxShadow:
                    ws.id === activeWorkspaceId ? '0 0 6px rgba(255, 120, 48, 0.5)' : 'none',
                }}
              />
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
