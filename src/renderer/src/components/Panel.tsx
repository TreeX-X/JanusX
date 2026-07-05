import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { useGitStore } from '@/stores/git'
import { useEditorStore } from '@/stores/editor'
import { GitPanel } from '@/components/GitPanel'
import { CheckpointPanel } from '@/components/CheckpointPanel'
import type { FileNode, GitFileChange } from '@/types'
import { setWorkspaceFileDragData } from '@/lib/terminal-file-reference'
import { warmupEditorRuntime } from '@/lib/editor-warmup'

type PanelView = 'files' | 'git' | 'checkpoints'

interface FileTreeOperationResult {
  success?: boolean
  error?: string
  path?: string
}

interface FileTreeContextMenuTarget {
  node: FileNode | null
  name: string
  path: string
  type: 'file' | 'directory'
}

interface FileTreeContextMenuState {
  x: number
  y: number
  target: FileTreeContextMenuTarget
}

const CONTEXT_MENU_WIDTH = 196
const CONTEXT_MENU_HEIGHT = 320
const CONTEXT_MENU_MARGIN = 8

const FILE_CHANGE_PRIORITY: Record<GitFileChange['status'], number> = {
  UU: 0,
  D: 1,
  M: 2,
  A: 3,
  R: 4,
  '??': 5,
}

const FILE_CHANGE_VISUALS: Record<GitFileChange['status'], { label: string; border: string; glow: string; pixels: [number, number, number, number] }> = {
  M: {
    label: 'M',
    border: 'rgba(210,210,210,0.18)',
    glow: 'rgba(185,185,185,0.12)',
    pixels: [0.38, 0.86, 0.72, 0.28],
  },
  A: {
    label: 'A',
    border: 'rgba(235,235,235,0.2)',
    glow: 'rgba(220,220,220,0.14)',
    pixels: [0.72, 0.9, 0.82, 0.58],
  },
  D: {
    label: 'D',
    border: 'rgba(150,150,150,0.16)',
    glow: 'rgba(130,130,130,0.08)',
    pixels: [0.5, 0.2, 0.16, 0.42],
  },
  R: {
    label: 'R',
    border: 'rgba(220,220,220,0.18)',
    glow: 'rgba(200,200,200,0.11)',
    pixels: [0.78, 0.34, 0.34, 0.78],
  },
  '??': {
    label: '?',
    border: 'rgba(170,170,170,0.13)',
    glow: 'rgba(150,150,150,0.06)',
    pixels: [0.24, 0.46, 0.18, 0.3],
  },
  UU: {
    label: '!',
    border: 'rgba(255,255,255,0.24)',
    glow: 'rgba(235,235,235,0.16)',
    pixels: [0.92, 0.48, 0.48, 0.92],
  },
}

function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? '' : normalized.slice(0, index)
}

function getAbsolutePath(workspacePath: string, relativePath: string): string {
  if (!relativePath) return workspacePath
  const separator = workspacePath.includes('\\') ? '\\' : '/'
  return `${workspacePath.replace(/[\\/]+$/, '')}${separator}${relativePath.split('/').join(separator)}`
}

function isPathInScope(path: string, scope: string): boolean {
  if (!scope) return path.length > 0
  return path === scope || path.startsWith(`${scope}/`)
}

function isValidEntryName(name: string): boolean {
  return Boolean(name) && name !== '.' && name !== '..' && !/[/\\]/.test(name)
}

function promptEntryName(message: string, defaultValue = ''): string | null {
  const value = window.prompt(message, defaultValue)
  if (value === null) return null

  const name = value.trim()
  if (!isValidEntryName(name)) {
    window.alert('名称不能为空，且不能包含 / 或 \\')
    return null
  }
  return name
}

interface FileTreeItemProps {
  node: FileNode
  depth: number
  activeFilePath: string | null
  expanded: boolean
  expandedPaths: Set<string>
  fileChange: GitFileChange | null
  fileChangeMap: Map<string, GitFileChange>
  onSelect: (path: string) => void
  onToggleDirectory: (node: FileNode) => void
  onOpenFile: (path: string) => void
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>, node: FileNode) => void
}

function FileTreeItem({
  node,
  depth,
  activeFilePath,
  expanded,
  expandedPaths,
  fileChange,
  fileChangeMap,
  onSelect,
  onToggleDirectory,
  onOpenFile,
  onOpenContextMenu,
}: FileTreeItemProps) {
  const isFolder = node.type === 'directory'
  const isActive = activeFilePath === node.path
  const changeVisual = !isFolder && fileChange ? FILE_CHANGE_VISUALS[fileChange.status] : null

  const handleClick = useCallback(() => {
    if (isFolder) {
      void onToggleDirectory(node)
    } else {
      onSelect(node.path)
      void warmupEditorRuntime()
    }
  }, [isFolder, node, onSelect, onToggleDirectory])

  const handleDoubleClick = useCallback(() => {
    if (!isFolder) {
      void warmupEditorRuntime()
      onOpenFile(node.path)
    }
  }, [isFolder, node.path, onOpenFile])

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (isFolder) return
      setWorkspaceFileDragData(event.dataTransfer, {
        type: 'file',
        name: node.name,
        path: node.path,
      })
    },
    [isFolder, node.name, node.path],
  )

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!isFolder) onSelect(node.path)
      onOpenContextMenu(event, node)
    },
    [isFolder, node, onOpenContextMenu, onSelect],
  )

  return (
    <div>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable={!isFolder}
        onDragStart={handleDragStart}
        className="py-[5px] px-2 mb-px rounded cursor-pointer transition-colors flex items-center gap-1.5 text-xs select-none"
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          color: isActive ? '#ff7830' : '#999',
          background: isActive ? 'rgba(255, 120, 48, 0.1)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
            e.currentTarget.style.color = '#ccc'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#999'
          }
        }}
      >
        {isFolder && (
          <div
            className="w-1.5 h-1.5 border-r-[1.5px] border-b-[1.5px] transition-transform"
            style={{
              borderColor: isActive ? '#ff7830' : '#666',
              transform: expanded ? 'rotate(45deg)' : 'rotate(-45deg)',
            }}
          />
        )}
        <div
          className="w-3 h-3 shrink-0 relative"
          style={{
            marginLeft: isFolder ? 0 : '6px',
          }}
        >
          {isFolder ? (
            <div
              className="absolute left-0 top-[3px] w-3 h-2 rounded-px"
              style={{ border: `1.5px solid ${isActive ? '#ff7830' : '#666'}` }}
            />
          ) : (
            <div
              className="absolute left-px top-[2px] w-2.5 h-2.5 rounded-px"
              style={{
                border: `1.5px solid ${isActive ? '#ff7830' : '#666'}`,
                clipPath: 'polygon(0 0, 70% 0, 100% 30%, 100% 100%, 0 100%)',
              }}
            />
          )}
        </div>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{node.name}</span>
        {changeVisual && (
          <span
            className="ml-1.5 grid h-3 w-3 shrink-0 grid-cols-2 gap-px rounded-[3px] p-[2px]"
            title={`${fileChange?.staged ? 'Staged' : 'Modified'} · ${fileChange?.status}`}
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: `1px solid ${changeVisual.border}`,
              boxShadow: fileChange?.staged
                ? `inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 8px ${changeVisual.glow}`
                : `inset 0 1px 0 rgba(255,255,255,0.035), 0 0 5px ${changeVisual.glow}`,
            }}
          >
            {changeVisual.pixels.map((opacity, index) => (
              <span
                key={index}
                className="block h-[3px] w-[3px] rounded-[1px]"
                style={{
                  background: `rgba(230,230,230,${opacity})`,
                  boxShadow: opacity > 0.7 ? '0 0 3px rgba(230,230,230,0.14)' : 'none',
                }}
              />
            ))}
          </span>
        )}
      </div>
      {isFolder && node.children && expanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              expanded={expandedPaths.has(child.path)}
              expandedPaths={expandedPaths}
              fileChange={fileChangeMap.get(child.path) ?? null}
              fileChangeMap={fileChangeMap}
              onSelect={onSelect}
              onToggleDirectory={onToggleDirectory}
              onOpenFile={onOpenFile}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function Panel() {
  const [activeView, setActiveView] = useState<PanelView>('files')
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const setActiveFilePath = useWorkspaceStore((s) => s.setActiveFilePath)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const gitStatus = useGitStore((s) => s.status)
  const fetchGitStatus = useGitStore((s) => s.fetchStatus)
  const openEditorFile = useEditorStore((s) => s.openFile)
  const panelCollapsed = useAppStore((s) => s.panelCollapsed)
  const togglePanel = useAppStore((s) => s.togglePanel)
  const [contextMenu, setContextMenu] = useState<FileTreeContextMenuState | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
  const activeWorkspacePath = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.path ?? null,
    [activeWorkspaceId, workspaces],
  )
  const fileChangeMap = useMemo(() => {
    const map = new Map<string, GitFileChange>()
    for (const change of gitStatus?.changes ?? []) {
      const normalizedPath = change.path.replace(/\\/g, '/')
      const existing = map.get(normalizedPath)
      if (!existing || FILE_CHANGE_PRIORITY[change.status] < FILE_CHANGE_PRIORITY[existing.status] || (!existing.staged && change.staged)) {
        map.set(normalizedPath, change)
      }
    }
    return map
  }, [gitStatus])

  const reloadRootFileTree = useCallback(async () => {
    const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
    const workspace = workspaces.find((item) => item.id === activeWorkspaceId)
    if (!workspace) return

    try {
      const tree = (await window.electron.invoke('filetree:load', workspace.path)) as FileNode[]
      useWorkspaceStore.setState({ fileTree: tree })
    } catch {
      // ignore
    }
  }, [])

  const reloadDirectory = useCallback(async (path: string) => {
    if (!path) {
      await reloadRootFileTree()
      return
    }

    const { workspaces, activeWorkspaceId, fileTree: currentTree } = useWorkspaceStore.getState()
    const workspace = workspaces.find((item) => item.id === activeWorkspaceId)
    if (!workspace) return

    try {
      const children = (await window.electron.invoke(
        'filetree:children',
        workspace.path,
        path,
      )) as FileNode[]

      const injectChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map((node) => {
          if (node.path === path && node.type === 'directory') {
            return {
              ...node,
              children,
              loaded: true,
              hasChildren: children.length > 0,
            }
          }
          if (node.children && node.children.length > 0) {
            return {
              ...node,
              children: injectChildren(node.children),
            }
          }
          return node
        })

      useWorkspaceStore.setState({ fileTree: injectChildren(currentTree) })
    } catch {
      // ignore
    }
  }, [reloadRootFileTree])

  useEffect(() => {
    if (!activeWorkspacePath) return
    setExpandedPaths(new Set())
    void fetchGitStatus(activeWorkspacePath)
  }, [activeWorkspacePath, fetchGitStatus])

  useEffect(() => {
    if (!activeWorkspacePath) return

    let disposed = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const unsubscribe = window.electron.on('filetree:changed', (workspacePath: unknown) => {
      if (workspacePath !== activeWorkspacePath) return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        if (!disposed) void fetchGitStatus(activeWorkspacePath)
      }, 180)
    })

    return () => {
      disposed = true
      if (refreshTimer) clearTimeout(refreshTimer)
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [activeWorkspacePath, fetchGitStatus])

  const handleToggleDirectory = useCallback(
    (node: FileNode) => {
      const shouldExpand = !expandedPaths.has(node.path)
      setExpandedPaths((current) => {
        const next = new Set(current)
        if (shouldExpand) next.add(node.path)
        else next.delete(node.path)
        return next
      })

      if (shouldExpand && !node.loaded) {
        void reloadDirectory(node.path)
      }
    },
    [expandedPaths, reloadDirectory],
  )

  const getActiveWorkspace = useCallback(() => {
    const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
    return workspaces.find((item) => item.id === activeWorkspaceId) ?? null
  }, [])

  const openFileInEditorPanel = useCallback((relativePath: string) => {
    const workspace = getActiveWorkspace()
    if (!workspace) return

    const absolutePath = getAbsolutePath(workspace.path, relativePath)
    setActiveFilePath(relativePath)
    void openEditorFile(absolutePath, workspace.path)
  }, [getActiveWorkspace, openEditorFile, setActiveFilePath])

  const openContextMenu = useCallback((event: MouseEvent<HTMLDivElement>, node: FileNode | null) => {
    const x = Math.max(
      CONTEXT_MENU_MARGIN,
      Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN),
    )
    const y = Math.max(
      CONTEXT_MENU_MARGIN,
      Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_MARGIN),
    )

    setContextMenu({
      x,
      y,
      target: node
        ? {
            node,
            name: node.name,
            path: node.path,
            type: node.type,
          }
        : {
            node: null,
            name: '工作区',
            path: '',
            type: 'directory',
          },
    })
  }, [])

  useEffect(() => {
    if (!contextMenu) return

    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  const contextBaseDirectory = contextMenu
    ? contextMenu.target.type === 'directory'
      ? contextMenu.target.path
      : getParentPath(contextMenu.target.path)
    : ''

  const runFileTreeMutation = useCallback(
    async (channel: string, ...args: unknown[]): Promise<FileTreeOperationResult | null> => {
      try {
        const result = (await window.electron.invoke(channel, ...args)) as FileTreeOperationResult
        if (!result.success) {
          window.alert(result.error || '文件操作失败')
          return null
        }
        return result
      } catch (err: any) {
        window.alert(err.message || '文件操作失败')
        return null
      }
    },
    [],
  )

  const handleOpenContextTarget = useCallback(() => {
    if (!contextMenu || contextMenu.target.type === 'directory') return
    const workspace = getActiveWorkspace()
    if (!workspace) return

    void warmupEditorRuntime()
    openFileInEditorPanel(contextMenu.target.path)
    setContextMenu(null)
  }, [contextMenu, getActiveWorkspace, openFileInEditorPanel])

  const handleCopyContextPath = useCallback(
    async (mode: 'relative' | 'absolute') => {
      if (!contextMenu) return
      const workspace = getActiveWorkspace()
      if (!workspace) return

      const value =
        mode === 'relative'
          ? contextMenu.target.path || '.'
          : getAbsolutePath(workspace.path, contextMenu.target.path)
      await navigator.clipboard.writeText(value)
      setContextMenu(null)
    },
    [contextMenu, getActiveWorkspace],
  )

  const handleRevealContextTarget = useCallback(async () => {
    if (!contextMenu) return
    const workspace = getActiveWorkspace()
    if (!workspace) return

    await runFileTreeMutation('filetree:reveal', workspace.path, contextMenu.target.path)
    setContextMenu(null)
  }, [contextMenu, getActiveWorkspace, runFileTreeMutation])

  const handleCreateFileTreeItem = useCallback(
    async (type: 'file' | 'directory') => {
      if (!contextMenu) return
      const workspace = getActiveWorkspace()
      if (!workspace) return

      const name = promptEntryName(type === 'file' ? '新建文件名' : '新建文件夹名')
      if (!name) return

      const result = await runFileTreeMutation(
        type === 'file' ? 'filetree:create-file' : 'filetree:create-directory',
        workspace.path,
        contextBaseDirectory,
        name,
      )
      if (!result) return

      await reloadDirectory(contextBaseDirectory)
      if (type === 'file' && result.path) setActiveFilePath(result.path)
      setContextMenu(null)
    },
    [contextBaseDirectory, contextMenu, getActiveWorkspace, reloadDirectory, runFileTreeMutation, setActiveFilePath],
  )

  const handleRenameContextTarget = useCallback(async () => {
    if (!contextMenu || !contextMenu.target.node) return
    const workspace = getActiveWorkspace()
    if (!workspace) return

    const name = promptEntryName('重命名', contextMenu.target.name)
    if (!name || name === contextMenu.target.name) {
      setContextMenu(null)
      return
    }

    const parentPath = getParentPath(contextMenu.target.path)
    const result = await runFileTreeMutation('filetree:rename', workspace.path, contextMenu.target.path, name)
    if (!result) return

    await reloadDirectory(parentPath)
    if (activeFilePath === contextMenu.target.path && result.path) setActiveFilePath(result.path)
    setContextMenu(null)
  }, [activeFilePath, contextMenu, getActiveWorkspace, reloadDirectory, runFileTreeMutation, setActiveFilePath])

  const handleDeleteContextTarget = useCallback(async () => {
    if (!contextMenu || !contextMenu.target.node) return
    const workspace = getActiveWorkspace()
    if (!workspace) return

    const ok = window.confirm(`确认删除「${contextMenu.target.name}」？此操作不可恢复。`)
    if (!ok) {
      setContextMenu(null)
      return
    }

    const targetPath = contextMenu.target.path
    const parentPath = getParentPath(targetPath)
    const result = await runFileTreeMutation('filetree:delete', workspace.path, targetPath)
    if (!result) return

    if (activeFilePath && isPathInScope(activeFilePath, targetPath)) setActiveFilePath(null)

    await reloadDirectory(parentPath)
    setContextMenu(null)
  }, [activeFilePath, contextMenu, getActiveWorkspace, reloadDirectory, runFileTreeMutation, setActiveFilePath])

  return (
    <>
      <aside
        className="flex flex-col overflow-hidden"
        style={{
          background: 'var(--surface)',
          backdropFilter: 'blur(20px)',
          borderLeft: '1px solid var(--border)',
        }}
      >
      {/* 展开态 */}
      {!panelCollapsed && (
        <>
          {/* Tabs header */}
          <div
            className="flex items-center"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex-1 flex">
              {(['files', 'git', 'checkpoints'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className="px-3 py-2 text-[11px] transition-colors relative"
                  style={{
                    color: activeView === view ? '#fff' : '#555',
                  }}
                >
                  {view === 'files' ? '文件' : view === 'git' ? 'Git' : '还原点'}
                  {activeView === view && (
                    <div
                      className="absolute bottom-0 left-2 right-2 h-px"
                      style={{ background: '#ff7830' }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-1 items-center pr-2">
              <button
                onClick={togglePanel}
                title="收起面板"
                className="w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)]"
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
            </div>
          </div>

          {/* Search box (files view only) */}
          {activeView === 'files' && (
            <div className="p-2">
              <input
                type="text"
                className="w-full h-7 rounded px-2.5 text-xs transition-colors focus:outline-none focus:bg-[rgba(255,255,255,0.05)] focus:border-[rgba(255,120,48,0.4)]"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#d4d4d4',
                }}
                placeholder="搜索文件..."
              />
            </div>
          )}

          {/* Content */}
          {activeView === 'files' ? (
            <div
              className="flex-1 p-1.5 overflow-y-auto text-xs no-scrollbar"
              onContextMenu={(event) => {
                event.preventDefault()
                openContextMenu(event, null)
              }}
            >
              {fileTree.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="text-[#555]">未加载工作区</div>
                </div>
              ) : (
                fileTree.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    activeFilePath={activeFilePath}
                    expanded={expandedPaths.has(node.path)}
                    expandedPaths={expandedPaths}
                    fileChange={fileChangeMap.get(node.path) ?? null}
                    fileChangeMap={fileChangeMap}
                    onSelect={setActiveFilePath}
                    onToggleDirectory={handleToggleDirectory}
                    onOpenFile={openFileInEditorPanel}
                    onOpenContextMenu={openContextMenu}
                  />
                ))
              )}
            </div>
          ) : activeView === 'git' ? (
            <GitPanel />
          ) : (
            <CheckpointPanel />
          )}
        </>
      )}

      {/* 收起态 */}
      {panelCollapsed && (
        <div className="flex-1 flex flex-col items-center py-3 gap-2 overflow-hidden">
          <button
            onClick={togglePanel}
            title="展开面板"
            className="w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)] mb-1"
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
          <div
            className="w-5 h-px"
            style={{ background: 'rgba(255, 255, 255, 0.06)' }}
          />
          <span
            className="select-none"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '1.5px',
              color: 'rgba(255, 255, 255, 0.2)',
            }}
          >
            {activeView === 'files' ? '文件' : activeView === 'git' ? 'Git' : '还原点'}
          </span>
        </div>
      )}
      </aside>

      {contextMenu
        ? createPortal(
            <div
              className="fixed p-1 rounded-lg text-xs"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
                width: CONTEXT_MENU_WIDTH,
                zIndex: 1000,
                background: 'rgba(20, 20, 20, 0.98)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55)',
                backdropFilter: 'blur(18px)',
              }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              {contextMenu.target.type === 'file' && (
                <button
                  type="button"
                  className="w-full px-2.5 py-1.5 rounded text-left text-[#d4d4d4] hover:bg-[rgba(255,120,48,0.18)]"
                  onClick={handleOpenContextTarget}
                >
                  打开
                </button>
              )}
              <button
                type="button"
                className="w-full px-2.5 py-1.5 rounded text-left text-[#d4d4d4] hover:bg-[rgba(255,120,48,0.18)]"
                onClick={() => void handleCreateFileTreeItem('file')}
              >
                新建文件
              </button>
              <button
                type="button"
                className="w-full px-2.5 py-1.5 rounded text-left text-[#d4d4d4] hover:bg-[rgba(255,120,48,0.18)]"
                onClick={() => void handleCreateFileTreeItem('directory')}
              >
                新建文件夹
              </button>
              <div className="h-px my-1 mx-1.5 bg-[rgba(255,255,255,0.08)]" />
              <button
                type="button"
                className="w-full px-2.5 py-1.5 rounded text-left text-[#d4d4d4] hover:bg-[rgba(255,120,48,0.18)]"
                onClick={() => void handleCopyContextPath('relative')}
              >
                复制相对路径
              </button>
              <button
                type="button"
                className="w-full px-2.5 py-1.5 rounded text-left text-[#d4d4d4] hover:bg-[rgba(255,120,48,0.18)]"
                onClick={() => void handleCopyContextPath('absolute')}
              >
                复制绝对路径
              </button>
              <button
                type="button"
                className="w-full px-2.5 py-1.5 rounded text-left text-[#d4d4d4] hover:bg-[rgba(255,120,48,0.18)]"
                onClick={() => void handleRevealContextTarget()}
              >
                在资源管理器中显示
              </button>
              {contextMenu.target.node && (
                <>
                  <div className="h-px my-1 mx-1.5 bg-[rgba(255,255,255,0.08)]" />
                  <button
                    type="button"
                    className="w-full px-2.5 py-1.5 rounded text-left text-[#d4d4d4] hover:bg-[rgba(255,120,48,0.18)]"
                    onClick={() => void handleRenameContextTarget()}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="w-full px-2.5 py-1.5 rounded text-left text-[#ff8a85] hover:bg-[rgba(255,95,87,0.18)]"
                    onClick={() => void handleDeleteContextTarget()}
                  >
                    删除
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
