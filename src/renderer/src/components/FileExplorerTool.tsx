import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  getActiveWorkspacePath,
  loadWorkspaceFileTree,
  reloadWorkspaceDirectory,
} from '@/features/workspace/actions'
import {
  collectDirectoryPathsToSearchLoad,
  createPendingFileTreeDelete,
  executeFileTreeDelete,
  filterFileTree,
  getAbsolutePath,
  getParentPath,
  isPathInScope,
  isValidEntryName,
  pruneExpandedPaths,
  remapPath,
  type FileTreeOperationResult,
  type PendingFileTreeDelete,
} from '@/features/workspace/file-tree'
import { useGitStore } from '@/stores/git'
import { closeEditorFilesUnderPath, remapEditorPaths } from '@/stores/editor'
import type { FileNode, GitFileChange } from '@/types'
import { warmupEditorRuntime } from '@/lib/editor-warmup'
import { PromptDialog } from '@/components/blueprint/PromptDialog'
import { FileTreeItem } from '@/components/file-tree/FileTreeItem'
import {
  FileTreeContextMenu,
  type FileTreeContextMenuState,
} from '@/components/file-tree/FileTreeContextMenu'

// 兼容既有测试/调用方的再导出;实现已迁往 features/workspace/file-tree
export {
  createPendingFileTreeDelete,
  executeFileTreeDelete,
  reloadWorkspaceDirectory,
  type PendingFileTreeDelete,
}
export { FileTreeItem, type FileTreeItemProps } from '@/components/file-tree/FileTreeItem'

const FILE_CHANGE_PRIORITY: Record<GitFileChange['status'], number> = {
  UU: 0,
  D: 1,
  M: 2,
  A: 3,
  R: 4,
  '??': 5,
}

interface NamingDialogState {
  mode: 'create-file' | 'create-directory' | 'rename'
  /** 新建时为目标目录;重命名时为目标项路径 */
  path: string
  defaultValue: string
}

const NAMING_DIALOG_COPY: Record<NamingDialogState['mode'], { title: string; label: string }> = {
  'create-file': { title: '新建文件', label: '文件名' },
  'create-directory': { title: '新建文件夹', label: '文件夹名' },
  rename: { title: '重命名', label: '新名称' },
}

export function FileExplorerTool({ active = true }: { active?: boolean }) {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const setActiveFilePath = useWorkspaceStore((s) => s.setActiveFilePath)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const gitStatus = useGitStore((s) => s.status)
  const fetchGitStatus = useGitStore((s) => s.fetchStatus)
  const [contextMenu, setContextMenu] = useState<FileTreeContextMenuState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingFileTreeDelete | null>(null)
  const [namingDialog, setNamingDialog] = useState<NamingDialogState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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

  const trimmedQuery = searchQuery.trim()
  const filtered = useMemo(
    () => (trimmedQuery ? filterFileTree(fileTree, trimmedQuery) : null),
    [fileTree, trimmedQuery],
  )
  const visibleTree = filtered ? filtered.nodes : fileTree

  const reloadDirectory = useCallback(async (path: string, expectedWorkspacePath?: string) => {
    const workspacePath = expectedWorkspacePath ?? getActiveWorkspacePath()
    if (!workspacePath || getActiveWorkspacePath() !== workspacePath) return

    try {
      if (path) {
        await reloadWorkspaceDirectory(workspacePath, path)
      } else {
        await loadWorkspaceFileTree(workspacePath, () => getActiveWorkspacePath() === workspacePath)
      }
    } catch (err: any) {
      setErrorMessage(err?.message || '目录刷新失败')
    }
  }, [])

  useEffect(() => {
    if (!activeWorkspacePath) return
    setExpandedPaths(new Set())
    setSearchQuery('')
    void fetchGitStatus(activeWorkspacePath)
  }, [activeWorkspacePath, fetchGitStatus])

  // 外部 FS 变更/重命名/删除后,丢弃树上已不存在的展开路径
  useEffect(() => {
    setExpandedPaths((current) => pruneExpandedPaths(current, fileTree))
  }, [fileTree])

  // 搜索时按需加载有限个未展开目录,让嵌套匹配逐步出现
  useEffect(() => {
    if (!trimmedQuery || !activeWorkspacePath) return

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      const paths = collectDirectoryPathsToSearchLoad(fileTree, trimmedQuery, 40, expandedPaths)
      if (paths.length === 0) return

      setExpandedPaths((current) => {
        const next = new Set(current)
        for (const path of paths) next.add(path)
        return next
      })

      void (async () => {
        for (const path of paths) {
          if (cancelled) return
          if (getActiveWorkspacePath() !== activeWorkspacePath) return
          await reloadDirectory(path, activeWorkspacePath)
        }
      })()
    }, 180)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // expandedPaths 有意不入依赖:加载候选会主动 expand,避免与 setExpanded 形成环
  }, [activeWorkspacePath, fileTree, reloadDirectory, trimmedQuery])

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

  const openFileInEditorPanel = useCallback(async (relativePath: string) => {
    const workspace = getActiveWorkspace()
    if (!workspace) return

    const absolutePath = getAbsolutePath(workspace.path, relativePath)
    setActiveFilePath(relativePath)
    await window.electron.window.openEditor({ filePath: absolutePath, workspacePath: workspace.path })
  }, [getActiveWorkspace, setActiveFilePath])

  const openContextMenu = useCallback((event: MouseEvent<HTMLDivElement>, node: FileNode | null) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
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

    // 延后挂关闭监听:避免与打开菜单的同一次 contextmenu/click 在同一事件轮次立刻关菜单
    let disposed = false
    let removeListeners: (() => void) | null = null
    const attachTimer = window.setTimeout(() => {
      if (disposed) return
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('keydown', closeOnEscape)
      window.addEventListener('scroll', close, true)
      removeListeners = () => {
        window.removeEventListener('click', close)
        window.removeEventListener('contextmenu', close)
        window.removeEventListener('keydown', closeOnEscape)
        window.removeEventListener('scroll', close, true)
      }
    }, 0)

    return () => {
      disposed = true
      window.clearTimeout(attachTimer)
      removeListeners?.()
    }
  }, [active, contextMenu])

  const runFileTreeMutation = useCallback(
    async (operation: () => Promise<FileTreeOperationResult>): Promise<FileTreeOperationResult | null> => {
      try {
        const result = await operation()
        if (!result.success) {
          setErrorMessage(result.error || '文件操作失败')
          return null
        }
        return result
      } catch (err: any) {
        setErrorMessage(err.message || '文件操作失败')
        return null
      }
    },
    [],
  )

  const handleOpenContextTarget = useCallback(() => {
    if (!contextMenu || contextMenu.target.type === 'directory') return
    void warmupEditorRuntime()
    openFileInEditorPanel(contextMenu.target.path)
    setContextMenu(null)
  }, [contextMenu, openFileInEditorPanel])

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

  const openNamingDialog = useCallback(
    (mode: NamingDialogState['mode']) => {
      if (!contextMenu) return
      if (mode === 'rename') {
        if (!contextMenu.target.node) return
        setNamingDialog({ mode, path: contextMenu.target.path, defaultValue: contextMenu.target.name })
      } else {
        const baseDirectory =
          contextMenu.target.type === 'directory'
            ? contextMenu.target.path
            : getParentPath(contextMenu.target.path)
        setNamingDialog({ mode, path: baseDirectory, defaultValue: '' })
      }
      setContextMenu(null)
    },
    [contextMenu],
  )

  const validateEntryName = useCallback((name: string): string | null => {
    if (!isValidEntryName(name)) return '名称不能为空，且不能包含 / 或 \\'
    return null
  }, [])

  const handleNamingConfirm = useCallback(
    async (name: string) => {
      if (!namingDialog) return
      const dialog = namingDialog
      setNamingDialog(null)
      const workspace = getActiveWorkspace()
      if (!workspace) return

      if (dialog.mode === 'rename') {
        if (name === dialog.defaultValue) return
        const oldPath = dialog.path
        const parentPath = getParentPath(oldPath)
        const result = await runFileTreeMutation(() =>
          window.electron.fileTree.rename(workspace.path, oldPath, name),
        )
        if (!result?.path) return
        const newPath = result.path

        // 同步依赖旧路径的状态:编辑器 tab/缓存、展开集合、当前选中
        remapEditorPaths(
          getAbsolutePath(workspace.path, oldPath),
          getAbsolutePath(workspace.path, newPath),
          workspace.path,
        )
        setExpandedPaths((current) => {
          const next = new Set<string>()
          for (const path of current) next.add(remapPath(path, oldPath, newPath))
          return next
        })
        const currentActive = useWorkspaceStore.getState().activeFilePath
        if (currentActive && isPathInScope(currentActive, oldPath)) {
          setActiveFilePath(remapPath(currentActive, oldPath, newPath))
        }
        await reloadDirectory(parentPath)
        return
      }

      const result = await runFileTreeMutation(() =>
        dialog.mode === 'create-file'
          ? window.electron.fileTree.createFile(workspace.path, dialog.path, name)
          : window.electron.fileTree.createDirectory(workspace.path, dialog.path, name),
      )
      if (!result) return

      await reloadDirectory(dialog.path)
      if (dialog.path) {
        setExpandedPaths((current) => new Set(current).add(dialog.path))
      }
      if (dialog.mode === 'create-file' && result.path) setActiveFilePath(result.path)
    },
    [getActiveWorkspace, namingDialog, reloadDirectory, runFileTreeMutation, setActiveFilePath],
  )

  const handleDeleteContextTarget = useCallback(() => {
    if (!contextMenu || !contextMenu.target.node) return
    const workspace = getActiveWorkspace()
    if (!workspace) return

    setPendingDelete(createPendingFileTreeDelete(workspace.path, contextMenu.target))
    setContextMenu(null)
  }, [contextMenu, getActiveWorkspace])

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    const request = pendingDelete
    setPendingDelete(null)

    await executeFileTreeDelete(request, {
      deleteTarget: (workspacePath, targetPath) =>
        runFileTreeMutation(() => window.electron.fileTree.delete(workspacePath, targetPath)),
      isWorkspaceActive: (workspacePath) => getActiveWorkspace()?.path === workspacePath,
      reloadDirectory,
      onDeleted: (targetPath) => {
        closeEditorFilesUnderPath(getAbsolutePath(request.workspacePath, targetPath))
        setExpandedPaths((current) => {
          const next = new Set<string>()
          for (const path of current) {
            if (!isPathInScope(path, targetPath)) next.add(path)
          }
          return next
        })
        const currentActive = useWorkspaceStore.getState().activeFilePath
        if (currentActive && isPathInScope(currentActive, targetPath)) setActiveFilePath(null)
      },
    })
  }, [getActiveWorkspace, pendingDelete, reloadDirectory, runFileTreeMutation, setActiveFilePath])

  const namingCopy = namingDialog ? NAMING_DIALOG_COPY[namingDialog.mode] : null

  return (
    <>
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
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && searchQuery) {
                event.stopPropagation()
                setSearchQuery('')
              }
            }}
          />
        </div>
        <div
          data-testid="file-explorer-content"
          aria-label="文件浏览器内容"
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5 text-xs"
          onContextMenu={(event) => {
            event.preventDefault()
            // 空白区菜单:item 已 stopPropagation;这里再 stop 防冒泡到外层容器
            event.stopPropagation()
            openContextMenu(event, null)
          }}
        >
          <div className="min-h-full">
            {visibleTree.length === 0 ? (
              <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-3">
                <div className="text-[#555]">
                  {fileTree.length === 0 ? '未加载工作区' : '无匹配文件'}
                </div>
              </div>
            ) : (
              visibleTree.map((node) => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  activeFilePath={activeFilePath}
                  expanded={expandedPaths.has(node.path) || filtered?.expandedDirs.has(node.path) === true}
                  expandedPaths={
                    filtered ? new Set([...expandedPaths, ...filtered.expandedDirs]) : expandedPaths
                  }
                  fileChange={fileChangeMap.get(node.path) ?? null}
                  fileChangeMap={fileChangeMap}
                  changedDirs={changedDirs}
                  onSelect={setActiveFilePath}
                  onToggleDirectory={handleToggleDirectory}
                  onOpenFile={openFileInEditorPanel}
                  onOpenContextMenu={openContextMenu}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {active && contextMenu ? (
        <FileTreeContextMenu
          menu={contextMenu}
          onOpen={handleOpenContextTarget}
          onCreate={(type) => openNamingDialog(type === 'file' ? 'create-file' : 'create-directory')}
          onCopyPath={(mode) => void handleCopyContextPath(mode)}
          onReveal={() => void handleRevealContextTarget()}
          onRename={() => openNamingDialog('rename')}
          onDelete={handleDeleteContextTarget}
        />
      ) : null}

      <PromptDialog
        open={namingDialog !== null}
        title={namingCopy?.title ?? ''}
        label={namingCopy?.label}
        defaultValue={namingDialog?.defaultValue}
        validate={validateEntryName}
        onConfirm={(value) => void handleNamingConfirm(value)}
        onCancel={() => setNamingDialog(null)}
      />

      <PromptDialog
        open={pendingDelete !== null}
        title="确认删除"
        description={
          <>
            确认删除「<strong className="prompt-dialog__emphasis">{pendingDelete?.targetName}</strong>」吗？此操作不可恢复。
          </>
        }
        confirmOnly
        confirmText="删除"
        tone="danger"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      <PromptDialog
        open={errorMessage !== null}
        title="操作失败"
        description={errorMessage}
        confirmOnly
        hideCancel
        confirmText="知道了"
        onConfirm={() => setErrorMessage(null)}
        onCancel={() => setErrorMessage(null)}
      />
    </>
  )
}
