import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspaceStore } from '@/stores/workspace'
import { loadWorkspaceFileTree } from '@/features/workspace/actions'
import { useGitStore } from '@/stores/git'
import { useEditorStore } from '@/stores/editor'
import type { FileNode, GitFileChange } from '@/types'
import { setWorkspaceFileDragData } from '@/lib/terminal-file-reference'
import { warmupEditorRuntime } from '@/lib/editor-warmup'
import { classifyFile } from '@/lib/file-classification'
import { resolveFilePresentation } from '@/lib/file-presentation'
import { FileTypeIcon } from '@/components/FileTypeIcon'

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

const FILE_CHANGE_VISUALS: Record<GitFileChange['status'], { label: string; color: string }> = {
  M: { label: 'M', color: '#d99a4e' },
  A: { label: 'A', color: '#7fae7f' },
  D: { label: 'D', color: '#c96a5f' },
  R: { label: 'R', color: '#7ba3bd' },
  '??': { label: '?', color: '#9a9a9a' },
  UU: { label: '!', color: '#e05f4a' },
}

const GIT_MARKER_STYLE = `
@keyframes git-marker-in {
  from { opacity: 0; transform: scale(0.6); }
}
.git-marker {
  animation: git-marker-in 140ms ease-out;
  transition: color 140ms ease-out, background-color 140ms ease-out, opacity 140ms ease-out;
}
`

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

export interface FileTreeItemProps {
  node: FileNode
  depth: number
  activeFilePath: string | null
  expanded: boolean
  expandedPaths: Set<string>
  fileChange: GitFileChange | null
  fileChangeMap: Map<string, GitFileChange>
  changedDirs: Set<string>
  onSelect: (path: string) => void
  onToggleDirectory: (node: FileNode) => void
  onOpenFile: (path: string) => void
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>, node: FileNode) => void
}

export function FileTreeItem({
  node,
  depth,
  activeFilePath,
  expanded,
  expandedPaths,
  fileChange,
  fileChangeMap,
  changedDirs,
  onSelect,
  onToggleDirectory,
  onOpenFile,
  onOpenContextMenu,
}: FileTreeItemProps) {
  const isFolder = node.type === 'directory'
  const isActive = activeFilePath === node.path
  const changeVisual = !isFolder && fileChange ? FILE_CHANGE_VISUALS[fileChange.status] : null
  const presentation = resolveFilePresentation(classifyFile(node.path, node.type))

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
        data-file-path={node.path}
        data-selected={isActive}
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
        <span className="flex shrink-0" style={{ marginLeft: isFolder ? 0 : 6 }}>
          <FileTypeIcon presentation={presentation} active={isActive} />
        </span>
        <span
          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
          data-file-name={node.name}
        >
          {node.name}
        </span>
        {changeVisual && (
          <span
            data-git-status={fileChange?.status}
            className="git-marker ml-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] font-mono text-[10px] font-semibold leading-none"
            title={`${fileChange?.staged ? 'Staged' : 'Modified'} · ${fileChange?.status}`}
            style={{
              color: changeVisual.color,
              opacity: fileChange?.staged ? 1 : 0.85,
              background: fileChange?.staged ? `${changeVisual.color}24` : 'transparent',
            }}
          >
            {changeVisual.label}
          </span>
        )}
        {isFolder && changedDirs.has(node.path) && (
          <span
            data-git-dirty
            className="git-marker ml-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center"
            title="包含改动"
          >
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: 'rgba(255,120,48,0.55)' }} />
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
              changedDirs={changedDirs}
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

export function FileExplorerTool({ active = true }: { active?: boolean }) {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const setActiveFilePath = useWorkspaceStore((s) => s.setActiveFilePath)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const gitStatus = useGitStore((s) => s.status)
  const fetchGitStatus = useGitStore((s) => s.fetchStatus)
  const openEditorFile = useEditorStore((s) => s.openFile)
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

  const changedDirs = useMemo(() => {
    const dirs = new Set<string>()
    for (const path of fileChangeMap.keys()) {
      // Walk from the change path itself so directory entries (e.g. untracked 'dir/') mark their own row.
      for (let dir = path.replace(/\/+$/, ''); dir; dir = getParentPath(dir)) dirs.add(dir)
    }
    return dirs
  }, [fileChangeMap])

  const reloadRootFileTree = useCallback(async () => {
    const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
    const workspace = workspaces.find((item) => item.id === activeWorkspaceId)
    if (!workspace) return

    await loadWorkspaceFileTree(workspace.path).catch(() => {})
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
      const children = await window.electron.fileTree.children(workspace.path, path)

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

    const unsubscribe = window.electron.fileTree.onChanged((workspacePath) => {
      if (workspacePath !== activeWorkspacePath) return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        if (!disposed) void fetchGitStatus(activeWorkspacePath)
      }, 180)
    })

    return () => {
      disposed = true
      if (refreshTimer) clearTimeout(refreshTimer)
      unsubscribe()
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

  const openFileInDetachedEditor = useCallback(async (relativePath: string) => {
    const workspace = getActiveWorkspace()
    if (!workspace) return

    const absolutePath = getAbsolutePath(workspace.path, relativePath)
    setActiveFilePath(relativePath)

    try {
      const result = await window.electron.window.openEditor({
        filePath: absolutePath,
        workspacePath: workspace.path,
      })
      if (result?.success) return
    } catch {
      // Fall back to the in-app editor when the native window cannot be opened.
    }

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
    if (!active) {
      setContextMenu(null)
      return
    }
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
  }, [active, contextMenu])

  const contextBaseDirectory = contextMenu
    ? contextMenu.target.type === 'directory'
      ? contextMenu.target.path
      : getParentPath(contextMenu.target.path)
    : ''

  const runFileTreeMutation = useCallback(
    async (operation: () => Promise<FileTreeOperationResult>): Promise<FileTreeOperationResult | null> => {
      try {
        const result = await operation()
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

    await runFileTreeMutation(() => window.electron.fileTree.reveal(workspace.path, contextMenu.target.path))
    setContextMenu(null)
  }, [contextMenu, getActiveWorkspace, runFileTreeMutation])

  const handleCreateFileTreeItem = useCallback(
    async (type: 'file' | 'directory') => {
      if (!contextMenu) return
      const workspace = getActiveWorkspace()
      if (!workspace) return

      const name = promptEntryName(type === 'file' ? '新建文件名' : '新建文件夹名')
      if (!name) return

      const result = await runFileTreeMutation(() =>
        type === 'file'
          ? window.electron.fileTree.createFile(workspace.path, contextBaseDirectory, name)
          : window.electron.fileTree.createDirectory(workspace.path, contextBaseDirectory, name),
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
    const result = await runFileTreeMutation(() =>
      window.electron.fileTree.rename(workspace.path, contextMenu.target.path, name),
    )
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
    const result = await runFileTreeMutation(() => window.electron.fileTree.delete(workspace.path, targetPath))
    if (!result) return

    if (activeFilePath && isPathInScope(activeFilePath, targetPath)) setActiveFilePath(null)

    await reloadDirectory(parentPath)
    setContextMenu(null)
  }, [activeFilePath, contextMenu, getActiveWorkspace, reloadDirectory, runFileTreeMutation, setActiveFilePath])

  return (
    <>
      <style>{GIT_MARKER_STYLE}</style>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="p-2">
          <input
            type="text"
            className="h-7 w-full rounded px-2.5 text-xs transition-colors focus:border-[rgba(255,120,48,0.4)] focus:bg-[rgba(255,255,255,0.05)] focus:outline-none"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#d4d4d4',
            }}
            placeholder="搜索文件..."
          />
        </div>
        <div
          data-testid="file-explorer-content"
          aria-label="文件浏览器内容"
          className="no-scrollbar flex-1 overflow-y-auto p-1.5 text-xs"
          onContextMenu={(event) => {
            event.preventDefault()
            openContextMenu(event, null)
          }}
        >
          {fileTree.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
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
                changedDirs={changedDirs}
                onSelect={setActiveFilePath}
                onToggleDirectory={handleToggleDirectory}
                onOpenFile={openFileInDetachedEditor}
                onOpenContextMenu={openContextMenu}
              />
            ))
          )}
        </div>
      </div>

      {active && contextMenu
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
