import { useEffect } from 'react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import { Titlebar } from '@/components/Titlebar'
import { Sidebar } from '@/components/Sidebar'
import { TerminalArea } from '@/components/TerminalArea'
import { TerminalSelector } from '@/components/TerminalSelector'
import { Panel } from '@/components/Panel'
import { StatusBar } from '@/components/StatusBar'
import type { AppLoadState, Workspace, FileNode } from '@/types'

export default function App() {
  const { loadState, sidebarCollapsed, panelCollapsed } = useAppStore()

  useEffect(() => {
    const initApp = async () => {
      try {
        const state = (await window.electron.invoke('app:init')) as {
          loadState: AppLoadState
          workspaces: Workspace[]
          activeWorkspaceId: string | null
        } | null

        if (state && state.workspaces) {
          useWorkspaceStore.setState({
            workspaces: state.workspaces,
            activeWorkspaceId: state.activeWorkspaceId,
          })

          // 有工作区时直接进入 no-terminal 状态
          if (state.workspaces.length > 0) {
            useAppStore.setState({ loadState: 'no-terminal' })
            // 加载活跃工作区的文件树
            if (state.activeWorkspaceId) {
              const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
              if (ws) {
                try {
                  const tree = (await window.electron.invoke('filetree:load', ws.path)) as FileNode[]
                  useWorkspaceStore.setState({ fileTree: tree })
                } catch {
                  // ignore
                }
              }
            }
          } else {
            useAppStore.setState({ loadState: 'no-workspace' })
          }
        } else {
          useAppStore.setState({ loadState: 'no-workspace' })
        }
      } catch {
        useAppStore.setState({ loadState: 'no-workspace' })
      }
    }
    initApp()
  }, [])

  return (
    <div className="h-screen flex flex-col" style={{ background: '#121212', color: '#d4d4d4' }}>
      <Titlebar />
      <div
        className="flex-1 grid grid-rows-[1fr_26px] overflow-hidden transition-[grid-template-columns] duration-200"
        style={{
          gridTemplateColumns: `${sidebarCollapsed ? '48px' : '240px'} 1fr ${panelCollapsed ? '48px' : '280px'}`,
        }}
      >
        <Sidebar />

        <main className="overflow-hidden p-2">
          {loadState === 'no-workspace' && <EmptyWorkspace />}
          {loadState === 'workspace-loaded' && <EmptyWorkspace />}
          {loadState === 'no-terminal' && <TerminalSelector />}
          {loadState === 'terminal-active' && <TerminalArea />}
        </main>

        <Panel />
        <StatusBar />
      </div>
    </div>
  )
}

function EmptyWorkspace() {
  const { addWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)

  const handleAdd = async () => {
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
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5"
      style={{ background: 'rgba(12, 12, 12, 0.9)' }}
    >
      <div className="relative w-20 h-20 opacity-30">
        <div
          className="absolute w-[60px] h-[3px] rounded-sm top-1/2 left-1/2"
          style={{
            background: '#ffffff',
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
        />
        <div
          className="absolute w-[60px] h-[3px] rounded-sm top-1/2 left-1/2"
          style={{
            background: '#ff7830',
            transform: 'translate(-50%, -50%) rotate(-45deg)',
          }}
        />
      </div>
      <div className="text-sm text-[#666]">开始使用 SwitchX</div>
      <button
        onClick={handleAdd}
        className="px-5 py-2.5 rounded-md text-[13px] cursor-pointer transition-colors"
        style={{
          background: 'rgba(255, 120, 48, 0.12)',
          border: '1px solid rgba(255, 120, 48, 0.25)',
          color: '#ff7830',
        }}
      >
        选择工作区文件夹
      </button>
    </div>
  )
}
