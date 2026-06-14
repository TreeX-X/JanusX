import { useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import { Titlebar } from '@/components/Titlebar'
import { Sidebar } from '@/components/Sidebar'
import { TerminalArea } from '@/components/TerminalArea'
import { TerminalSelector } from '@/components/TerminalSelector'
import { Panel } from '@/components/Panel'
import { StatusBar } from '@/components/StatusBar'
import { FileEditor } from '@/components/FileEditor'
import type { AppLoadState, Workspace, FileNode } from '@/types'

export default function App() {
  const { loadState, sidebarCollapsed, panelCollapsed, blueprintMode, isIslandDragging, flipDuration } = useAppStore()

  /*-- P0: 翻转容器 ref，拖拽时 direct DOM 操作 transform --*/
  const flipperElRef = useRef<HTMLDivElement | null>(null)

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

        {/*-- 中心区域：3D 翻转容器（正面=终端，背面=蓝图） --*/}
        <main className="overflow-hidden relative" style={{ perspective: 1500 }}>
          <div
            ref={flipperElRef}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              transformStyle: 'preserve-3d',
              /*-- P0: 拖拽时 transition: none（通过 store isIslandDragging 控制） --*/
              /*-- P2: 翻转动量感知 — 使用 flipDuration --*/
              transition: isIslandDragging
                ? 'none'
                : `transform ${flipDuration}ms cubic-bezier(0.25, 1, 0.25, 1)`,
              /*-- P0: 默认 transform 由 React 计算；拖拽期间由 Titlebar direct DOM 覆盖 --*/
              transform: (() => {
                const base = blueprintMode ? -180 : 0
                if (isIslandDragging) {
                  /* 拖拽中：预览偏转由 Titlebar 直接操作 DOM，此处返回当前值避免冲突 */
                  const el = flipperElRef.current
                  return el ? el.style.transform : `rotateX(${base}deg)`
                }
                return `rotateX(${base}deg)`
              })(),
            }}
          >
            {/*-- 正面：终端视图 --*/}
            <div
              className="absolute inset-0 p-2"
              style={{
                backfaceVisibility: 'hidden',
                background: 'rgba(10, 10, 10, 0.95)',
              }}
            >
              {loadState === 'no-workspace' && <EmptyWorkspace />}
              {loadState === 'workspace-loaded' && <EmptyWorkspace />}
              {loadState === 'no-terminal' && <TerminalSelector />}
              {loadState === 'terminal-active' && <TerminalArea />}
            </div>

            {/*-- 背面：蓝图视图（留白占位） --*/}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateX(180deg)',
                background: 'radial-gradient(circle at center, #151515 0%, #080808 100%)',
              }}
            >
              {/*-- 蓝图内容占位 --*/}
              <div
                className="flex flex-col items-center gap-4 opacity-40"
                style={{ userSelect: 'none' }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff7830" strokeWidth="1.5">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                <div className="text-[13px] text-[#666]">蓝图画布</div>
                <div className="text-[11px] text-[#444]">下拉灵动岛翻转到此视图</div>
              </div>
            </div>
          </div>
        </main>

        <Panel />
        <StatusBar />
      </div>
      <FileEditor />
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
