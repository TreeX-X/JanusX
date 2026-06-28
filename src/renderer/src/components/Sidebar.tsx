import { useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { ProjectLauncher } from './ProjectLauncher'
import { ModalCloseButton } from './ModalCloseButton'
import type { Workspace, FileNode, Terminal } from '@/types'
import { invalidateEditorFileCache } from '@/stores/editor'

function terminalStatusLabel(status: Terminal['status']): string {
  switch (status) {
    case 'running':
      return 'running'
    case 'exited':
      return 'done'
    default:
      return 'idle'
  }
}

function terminalStatusColor(status: Terminal['status']): string {
  switch (status) {
    case 'running':
      return '#ff7830'
    case 'exited':
      return '#4ec9b0'
    default:
      return '#666'
  }
}

function terminalPresetLabel(preset: Terminal['preset']): string {
  switch (preset) {
    case 'claude':
      return 'Claude'
    case 'codex':
      return 'Codex'
    case 'opencode':
      return 'OpenCode'
    default:
      return 'Shell'
  }
}

export function Sidebar() {
  const longPressDuration = 450
  const longPressVisualDelay = 120
  const longPressProgressDuration = Math.max(120, longPressDuration - longPressVisualDelay)
  const { workspaces, activeWorkspaceId, terminals, activeTerminalId, terminalSnapshots, setActiveWorkspace, addWorkspace, removeWorkspace, setActiveTerminal } =
    useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null)
  const [longPressingId, setLongPressingId] = useState<string | null>(null)
  const [longPressProgressId, setLongPressProgressId] = useState<string | null>(null)
  const [longPressCompletedId, setLongPressCompletedId] = useState<string | null>(null)
  const [configTarget, setConfigTarget] = useState<Workspace | null>(null)
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<string[]>([])
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressVisualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressTargetRef = useRef<string | null>(null)
  const suppressClickRef = useRef<string | null>(null)

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
        invalidateEditorFileCache(folderPath)
        const tree = (await window.electron.invoke('filetree:load', folderPath)) as FileNode[]
        useWorkspaceStore.setState({ fileTree: tree })
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }, [addWorkspace, setActiveWorkspace, setLoadState])

  const handleDeleteClick = useCallback(
    (ws: Workspace, e: React.MouseEvent) => {
      e.stopPropagation()
      setDeleteTarget(ws)
    },
    [],
  )

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await window.electron.invoke('workspace:delete', deleteTarget.id)
      removeWorkspace(deleteTarget.id)
      setExpandedWorkspaceIds((current) => current.filter((id) => id !== deleteTarget.id))
      if (workspaces.length <= 1) {
        setLoadState('no-workspace')
        useWorkspaceStore.setState({
          fileTree: [],
          terminals: [],
          activeTerminalId: null,
          paneTree: null,
          focusedPaneId: null,
          focusedTabId: null,
        })
      }
    } catch (err) {
      console.error('Failed to delete workspace:', err)
    }
    setDeleteTarget(null)
  }, [deleteTarget, removeWorkspace, workspaces.length, setLoadState])

  const loadWorkspaceFileTree = useCallback(
    async (id: string) => {
      try {
        const ws = workspaces.find((w) => w.id === id)
        if (ws) {
          invalidateEditorFileCache(ws.path)
          const tree = (await window.electron.invoke('filetree:load', ws.path)) as FileNode[]
          useWorkspaceStore.setState({ fileTree: tree })
        }
      } catch (err) {
        console.error('Failed to load file tree:', err)
      }
    },
    [workspaces]
  )

  const handleSelect = useCallback(
    async (id: string) => {
      if (suppressClickRef.current === id) {
        suppressClickRef.current = null
        return
      }
      setActiveWorkspace(id)
      // 根据目标工作区是否有终端来设置状态
      const stateAfterSwitch = useWorkspaceStore.getState()
      setLoadState(stateAfterSwitch.terminals.length > 0 ? 'terminal-active' : 'no-terminal')
      // 加载文件树
      await loadWorkspaceFileTree(id)
    },
    [loadWorkspaceFileTree, setActiveWorkspace, setLoadState]
  )

  const handleToggleWorkspaceExpand = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setExpandedWorkspaceIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }, [])

  const handleTerminalPreviewClick = useCallback(
    async (workspaceId: string, terminalId: string, event: React.MouseEvent) => {
      event.stopPropagation()
      setActiveWorkspace(workspaceId)
      setExpandedWorkspaceIds((current) => (current.includes(workspaceId) ? current : [...current, workspaceId]))
      const stateAfterSwitch = useWorkspaceStore.getState()
      setLoadState(stateAfterSwitch.terminals.length > 0 ? 'terminal-active' : 'no-terminal')
      if (stateAfterSwitch.terminals.some((terminal) => terminal.id === terminalId)) {
        setActiveTerminal(terminalId)
      }
      await loadWorkspaceFileTree(workspaceId)
    },
    [loadWorkspaceFileTree, setActiveTerminal, setActiveWorkspace, setLoadState]
  )

  const cancelLongPress = useCallback(() => {
    const hadActivePress = !!pressTargetRef.current
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    if (pressVisualTimerRef.current) {
      clearTimeout(pressVisualTimerRef.current)
      pressVisualTimerRef.current = null
    }
    if (hadActivePress && completeTimerRef.current) {
      clearTimeout(completeTimerRef.current)
      completeTimerRef.current = null
    }
    if (pressTargetRef.current) {
      setLongPressingId(null)
      setLongPressProgressId(null)
      pressTargetRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(
    (ws: Workspace, e: React.PointerEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('.ws-del')) return
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current)
      }
      if (pressVisualTimerRef.current) {
        clearTimeout(pressVisualTimerRef.current)
      }
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current)
      }
      pressTargetRef.current = ws.id
      setLongPressingId(null)
      setLongPressProgressId(null)
      setLongPressCompletedId(null)
      pressVisualTimerRef.current = setTimeout(() => {
        if (pressTargetRef.current === ws.id) {
          setLongPressingId(ws.id)
          setLongPressProgressId(ws.id)
        }
        pressVisualTimerRef.current = null
      }, longPressVisualDelay)
      pressTimerRef.current = setTimeout(() => {
        pressTimerRef.current = null
        if (pressVisualTimerRef.current) {
          clearTimeout(pressVisualTimerRef.current)
          pressVisualTimerRef.current = null
        }
        setLongPressingId(null)
        setLongPressProgressId(null)
        setLongPressCompletedId(ws.id)
        suppressClickRef.current = ws.id
        pressTargetRef.current = null
        completeTimerRef.current = setTimeout(() => {
          setLongPressCompletedId(null)
          setConfigTarget(ws)
          completeTimerRef.current = null
        }, 130)
      }, longPressDuration)
    },
    [longPressDuration, longPressVisualDelay],
  )

  return (
    <aside
      className="flex flex-col overflow-hidden"
      style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* 展开态 */}
      {!sidebarCollapsed && (
        <>
          <div
            className="p-2.5 px-3 text-[10px] font-semibold tracking-wider uppercase text-[#555] flex justify-between items-center"
            style={{ borderBottom: '1px solid var(--border)' }}
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
              workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId
                const isLongPressing = longPressingId === ws.id
                const isLongPressComplete = longPressCompletedId === ws.id
                const showProgress = isLongPressing || isActive || isLongPressComplete
                const workspaceTerminals = isActive ? terminals : terminalSnapshots[ws.id]?.terminals ?? []
                const isExpanded = expandedWorkspaceIds.includes(ws.id)
                const terminalCount = workspaceTerminals.length
                const maxLights = 6
                const visibleLights = Math.min(terminalCount, maxLights)
                const overflowLights = terminalCount - visibleLights

                return (
                  <div key={ws.id} className="mb-px">
                    <div
                      onClick={() => handleSelect(ws.id)}
                      onPointerDown={(e) => handlePointerDown(ws, e)}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      className={`ws p-[9px] pl-2 pr-3 rounded-md cursor-pointer transition-all flex items-center gap-2 text-[13px] relative group${isLongPressing ? ' long-pressing' : ''}`}
                      style={{
                        color: isActive ? '#fff' : '#999',
                        background: isLongPressing
                          ? isActive
                            ? 'rgba(255, 120, 48, 0.11)'
                            : 'rgba(255, 255, 255, 0.045)'
                          : isActive
                            ? 'var(--accent-soft)'
                            : 'transparent',
                        transform: isLongPressing ? 'scale(0.988)' : 'scale(1)',
                        boxShadow: isLongPressing
                          ? 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.03), inset 0 8px 16px rgba(0,0,0,0.18)'
                          : isLongPressComplete
                            ? '0 0 0 1px rgba(255, 120, 48, 0.12), 0 0 14px rgba(255, 120, 48, 0.14)'
                            : 'none',
                      }}
                    >
                      <div
                        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-sm overflow-hidden pointer-events-none"
                        style={{
                          background: showProgress ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                        }}
                      >
                        <div
                          className="absolute inset-0 origin-bottom"
                          style={{
                            background: isLongPressComplete ? '#ffd2b8' : '#ff7830',
                            opacity: isLongPressComplete ? 0.9 : showProgress ? 1 : 0,
                            transform:
                              isLongPressing && longPressProgressId === ws.id
                                ? 'scaleY(1)'
                                : showProgress
                                  ? 'scaleY(1)'
                                  : 'scaleY(0)',
                            transition: isLongPressing
                              ? `transform ${longPressProgressDuration}ms linear, opacity 120ms ease`
                              : 'opacity 120ms ease',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={isExpanded ? `折叠 ${ws.name} 终端列表 (${terminalCount})` : `展开 ${ws.name} 终端列表 (${terminalCount})`}
                        title={isExpanded ? `折叠终端列表 (${terminalCount})` : `展开终端列表 (${terminalCount})`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleToggleWorkspaceExpand(ws.id, event)
                        }}
                        className="relative h-4 shrink-0 px-1 cursor-pointer rounded-full border-0 bg-transparent flex items-center justify-center gap-0.5 transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-[rgba(255,120,48,0.24)]"
                        style={{
                          transform: isExpanded ? 'scale(1.08)' : 'scale(1)',
                          boxShadow: isExpanded ? '0 0 0 1px rgba(255,120,48,0.22)' : 'none',
                        }}
                      >
                        <span className="relative z-10 flex items-center gap-0.5">
                          {terminalCount > 0
                            ? Array.from({ length: visibleLights }).map((_, index) => (
                              <span
                                key={`${ws.id}-light-${index}`}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  background: 'rgba(255,120,48,0.96)',
                                  boxShadow: '0 0 4px rgba(255,120,48,0.75)',
                                }}
                              />
                            ))
                            : <span className="h-1.5 w-1.5 rounded-full bg-[#5a5a5a]" />}
                          {overflowLights > 0 ? <span className="text-[7px] leading-none font-mono text-[#ffc6a6]">+{overflowLights}</span> : null}
                        </span>
                      </button>
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {ws.name}
                      </span>
                      <button
                        onClick={(e) => handleDeleteClick(ws, e)}
                        className="ws-del w-[16px] h-[16px] rounded-[3px] flex items-center justify-center text-[12px] leading-none text-[#666] opacity-0 group-hover:opacity-100 transition-all hover:bg-[rgba(255,88,88,0.12)] hover:!text-[#ff5858]"
                      >
                        ×
                      </button>
                    </div>
                    {isExpanded && (
                      <div
                        className="ml-5 mr-1 overflow-hidden py-1"
                        style={{ borderLeft: '1px solid rgba(255,255,255,0.045)' }}
                      >
                        {workspaceTerminals.length === 0 ? (
                          <div className="px-3 py-2 font-mono text-[11px] text-[#4f4f4f]">暂无终端</div>
                        ) : (
                          workspaceTerminals.map((terminal) => {
                            const isFocusedTerminal = isActive && terminal.id === activeTerminalId
                            return (
                              <button
                                key={terminal.id}
                                type="button"
                                onClick={(event) => handleTerminalPreviewClick(ws.id, terminal.id, event)}
                                className="group/terminal mb-0.5 grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.035)] focus:outline-none focus:ring-1 focus:ring-[rgba(255,120,48,0.22)]"
                                style={{
                                  background: isFocusedTerminal ? 'rgba(255,120,48,0.055)' : 'transparent',
                                  color: isFocusedTerminal ? '#d8d8d8' : '#8a8a8a',
                                }}
                                title={`${terminalPresetLabel(terminal.preset)} · ${terminal.cwd}`}
                              >
                                <span
                                  className="h-[6px] w-[6px] rounded-full"
                                  style={{
                                    background: terminalStatusColor(terminal.status),
                                    boxShadow: isFocusedTerminal ? `0 0 6px ${terminalStatusColor(terminal.status)}66` : 'none',
                                  }}
                                />
                                <span className="min-w-0 truncate font-mono text-[11px]">
                                  {terminal.name || terminalPresetLabel(terminal.preset)}
                                </span>
                                <span className="font-mono text-[10px] text-[#5f5f5f]">
                                  {terminalStatusLabel(terminal.status)}
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })
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
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId
            const isLongPressing = longPressingId === ws.id
            const isLongPressComplete = longPressCompletedId === ws.id
            const showProgress = isLongPressing || isActive || isLongPressComplete

            return (
              <div
                key={ws.id}
                onClick={() => handleSelect(ws.id)}
                onPointerDown={(e) => handlePointerDown(ws, e)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                title={ws.name}
                className={`ws w-8 h-7 flex items-center justify-center cursor-pointer transition-all relative${isLongPressing ? ' long-pressing' : ''}`}
                style={{
                  background: isLongPressing ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                  transform: isLongPressing ? 'scale(0.96)' : 'scale(1)',
                  boxShadow: isLongPressing
                    ? 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.03), inset 0 8px 14px rgba(0,0,0,0.2)'
                    : isLongPressComplete
                      ? '0 0 0 1px rgba(255, 120, 48, 0.12), 0 0 12px rgba(255, 120, 48, 0.14)'
                      : 'none',
                }}
              >
                <div
                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-sm overflow-hidden pointer-events-none"
                  style={{
                    background: showProgress ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  }}
                >
                  <div
                    className="absolute inset-0 origin-bottom"
                    style={{
                      background: isLongPressComplete ? '#ffd2b8' : '#ff7830',
                      opacity: isLongPressComplete ? 0.9 : showProgress ? 1 : 0,
                      transform:
                        isLongPressing && longPressProgressId === ws.id
                          ? 'scaleY(1)'
                          : showProgress
                            ? 'scaleY(1)'
                            : 'scaleY(0)',
                      transition: isLongPressing
                        ? `transform ${longPressProgressDuration}ms linear, opacity 120ms ease`
                        : 'opacity 120ms ease',
                    }}
                  />
                </div>
                <div
                  className="rounded-full transition-all"
                  style={{
                    width: isActive ? '8px' : '6px',
                    height: isActive ? '8px' : '6px',
                    background: isActive ? '#ff7830' : 'rgba(255, 255, 255, 0.12)',
                    boxShadow: isActive ? '0 0 6px rgba(255, 120, 48, 0.5)' : 'none',
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
      {/* 删除确认弹窗 — portal 到 body 级别，居窗口中央 */}
      {deleteTarget && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(10px)',
            zIndex: 1000,
          }}
        >
          <div
            className="overflow-hidden"
            style={{
              width: 380,
              background: 'rgba(22,22,22,0.98)',
              border: '1px solid rgba(255,88,88,0.2)',
              borderRadius: 8,
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              animation: 'island-expand-modal 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            {/* Header */}
            <div
              className="flex justify-between items-center"
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="font-semibold flex items-center"
                style={{ fontSize: 13, color: '#fff', gap: 6 }}
              >
                <span style={{ color: '#ff5858' }}>&#9888;</span>
                删除工作区
              </div>
              <ModalCloseButton onClose={() => setDeleteTarget(null)} />
            </div>

            {/* Body */}
            <div style={{ padding: '16px 16px 20px' }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 14, lineHeight: 1.6 }}>
                确认删除工作区{' '}
                <strong style={{ color: '#fff' }}>{deleteTarget.name}</strong>
                {' '}吗？此操作不会删除磁盘上的文件，但会移除该工作区下的所有终端会话和还原点记录。
              </div>

              <div
                style={{
                  padding: '8px 10px',
                  background: 'rgba(255,88,88,0.06)',
                  border: '1px solid rgba(255,88,88,0.12)',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#c0848a',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: '#ff5858', marginRight: 4 }}>&#8226;</span>
                终端快照和 Checkpoint 数据将被清除
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex justify-end"
              style={{
                padding: '10px 16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                gap: 8,
              }}
            >
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded cursor-pointer transition-colors"
                style={{
                  height: 28,
                  padding: '0 14px',
                  fontSize: 11,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#999',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.color = '#ccc'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = '#999'
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="rounded cursor-pointer transition-colors"
                style={{
                  height: 28,
                  padding: '0 14px',
                  fontSize: 11,
                  background: 'rgba(255,88,88,0.12)',
                  border: '1px solid rgba(255,88,88,0.3)',
                  color: '#ff5858',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,88,88,0.22)'
                  e.currentTarget.style.borderColor = 'rgba(255,88,88,0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,88,88,0.12)'
                  e.currentTarget.style.borderColor = 'rgba(255,88,88,0.3)'
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {/* 工作区启动配置弹窗 */}
      {configTarget && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(10px)',
            zIndex: 1000,
          }}
        >
          <div className="ws-config-modal">
            {/* Header */}
            <div
              className="flex justify-between items-center"
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="font-semibold flex items-center"
                style={{ fontSize: 13, color: '#fff', gap: 8 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                <span>工作区启动配置</span>
              </div>
              <ModalCloseButton onClose={() => setConfigTarget(null)} />
            </div>
            {/* Body */}
            <div style={{ padding: '0', overflow: 'hidden', flex: 1 }}>
              <ProjectLauncher projectPath={configTarget.path} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </aside>
  )
}
