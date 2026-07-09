import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCheckpointStore } from '@/stores/checkpoint'
import { invalidateEditorFileCache } from '@/stores/editor'
import { Titlebar } from '@/components/Titlebar'
import { Sidebar } from '@/components/Sidebar'
import { TerminalArea } from '@/components/TerminalArea'
import { TerminalSelector } from '@/components/TerminalSelector'
import { Panel } from '@/components/Panel'
import { StatusBar } from '@/components/StatusBar'
import { FileEditor } from '@/components/FileEditor'
import { AgentNotificationHost } from '@/components/AgentNotificationHost'
import { BlueprintFocusView } from '@/components/blueprint/BlueprintFocusView'
import { warmupEditorRuntime } from '@/lib/editor-warmup'
import type { AppLoadState, Workspace, FileNode } from '@/types'

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

const SIDE_PANEL_WIDTH = 'clamp(240px, 14vw, 280px)'
const SIDE_PANEL_COLLAPSED_WIDTH = '48px'

function mergeFileTreeState(nextNodes: FileNode[], currentNodes: FileNode[]): FileNode[] {
  const currentMap = new Map(currentNodes.map((node) => [node.path, node]))

  return nextNodes.map((node) => {
    const existing = currentMap.get(node.path)
    if (!existing || node.type !== 'directory') {
      return node
    }

    const currentChildren = existing.children ?? []
    const nextChildren = node.children ?? []

    return {
      ...node,
      loaded: existing.loaded ?? false,
      hasChildren: node.hasChildren ?? existing.hasChildren,
      children:
        existing.loaded && currentChildren.length > 0
          ? nextChildren.length > 0
            ? mergeFileTreeState(nextChildren, currentChildren)
            : currentChildren
          : nextChildren,
    }
  })
}

export default function App() {
  const { loadState, sidebarCollapsed, panelCollapsed, blueprintMode, isIslandDragging, flipDuration, dragFlipProgress } = useAppStore()
  const subscribeToCheckpointEvents = useCheckpointStore((s) => s.subscribeToEvents)

  /*-- P0: 翻转容器 ref，拖拽时 direct DOM 操作 transform --*/
  const flipperElRef = useRef<HTMLDivElement | null>(null)

  const loadWorkspaceFileTree = useCallback(async (workspacePath: string) => {
    try {
      const tree = (await window.electron.invoke('filetree:load', workspacePath)) as FileNode[]
      const currentTree = useWorkspaceStore.getState().fileTree
      useWorkspaceStore.setState({ fileTree: mergeFileTreeState(tree, currentTree) })
    } catch {
      // ignore
    }
  }, [])

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
                await loadWorkspaceFileTree(ws.path)
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
  }, [loadWorkspaceFileTree])

  useEffect(() => {
    const unsubscribe = window.electron.on('filetree:changed', async (workspacePath: unknown) => {
      if (typeof workspacePath !== 'string') return
      const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState()
      if (!activeWorkspaceId) return
      const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
      if (!activeWorkspace || activeWorkspace.path !== workspacePath) return
      invalidateEditorFileCache(workspacePath)
      await loadWorkspaceFileTree(workspacePath)
    })
    return typeof unsubscribe === 'function' ? unsubscribe : undefined
  }, [loadWorkspaceFileTree])

  useEffect(() => {
    return subscribeToCheckpointEvents()
  }, [subscribeToCheckpointEvents])

  useEffect(() => {
    const idleWindow = window as IdleWindow
    const runWarmup = () => {
      void warmupEditorRuntime()
    }

    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(runWarmup, { timeout: 2500 })
      return () => idleWindow.cancelIdleCallback?.(id)
    }

    const id = window.setTimeout(runWarmup, 1200)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-app)', color: 'var(--text)' }}>
      <Titlebar />
      <div
        className="flex-1 grid grid-rows-[1fr_28px] overflow-hidden transition-[grid-template-columns] duration-200"
        style={{
          gridTemplateColumns: `${sidebarCollapsed ? SIDE_PANEL_COLLAPSED_WIDTH : SIDE_PANEL_WIDTH} 1fr ${
            panelCollapsed ? SIDE_PANEL_COLLAPSED_WIDTH : SIDE_PANEL_WIDTH
          }`,
        }}
      >
        <Sidebar />

        {/*-- 中心区域：3D 翻转容器（正面=终端，背面=蓝图） --*/}
        <main className="min-w-0 overflow-hidden relative" style={{ perspective: 1500, background: 'var(--bg-deep)' }}>
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
              /*-- P0: 拖拽期间由 dragFlipProgress 实时计算旋转角度 --*/
              transform: (() => {
                const base = blueprintMode ? -180 : 0
                if (isIslandDragging) {
                  const dragRotation = dragFlipProgress * -15
                  return `rotateX(${base + dragRotation}deg)`
                }
                return `rotateX(${base}deg)`
              })(),
            }}
          >
            {/*-- 正面：终端视图 --*/}
            <div
              className="absolute inset-0 min-w-0"
              style={{
                backfaceVisibility: 'hidden',
                background: 'var(--bg-deep)',
              }}
            >
              {loadState === 'no-workspace' && <EmptyWorkspace />}
              {loadState === 'workspace-loaded' && <EmptyWorkspace />}
              {loadState === 'no-terminal' && <TerminalSelector />}
              {loadState === 'terminal-active' && <TerminalArea />}
            </div>

            {/*-- 背面：蓝图视图（P2 画布） --*/}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateX(180deg)',
                background: 'radial-gradient(circle at center, #111 0%, var(--bg-deep) 100%)',
              }}
            >
              <BlueprintFocusView />
            </div>
          </div>
        </main>

        <Panel />
        <StatusBar />
      </div>
      <FileEditor />
      <AgentNotificationHost />
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
      style={{ background: 'var(--bg-deep)' }}
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
      <div className="text-sm text-[#666]">开始使用 JanusX</div>
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
