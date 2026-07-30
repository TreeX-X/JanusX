import type { FileNode, Workspace } from '@/types'
import { invalidateEditorFileCache } from '@/stores/editor'
import { useWorkspaceStore } from '@/stores/workspace'
import { applyLoadedChildren, collectLoadedDirectoryPaths, injectDirectoryChildren } from './file-tree'

export function getActiveWorkspacePath(): string | null {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.path ?? null
}

/**
 * 全量树加载代际。
 * - loadWorkspaceFileTree 每次自增,只提交最新一次
 * - reloadWorkspaceDirectory 提交后推进目录变更代际,阻止旧根快照覆盖 children
 * - 同一目录的并发 reload 复用请求,不同目录仍可同时加载
 */
let fileTreeLoadGeneration = 0
// A directory response can arrive while a root refresh is in flight.  Track committed
// directory updates separately so the older root snapshot cannot erase newly loaded children.
let fileTreeDirectoryMutationGeneration = 0
const pendingDirectoryLoads = new Map<string, Promise<void>>()

export interface FileTreeLoadOptions {
  /** Used when the visible workspace changes; background refreshes keep the current tree in place. */
  visualTransition?: boolean
}

/**
 * 加载工作区文件树(唯一入口)。
 * 根层重新拉取之外,当前树中所有已展开加载过的目录也会同步重拉,
 * 保证外部文件系统变化(agent 写文件、终端操作)反映到已展开分支。
 */
export async function loadWorkspaceFileTree(
  workspacePath: string,
  shouldCommit: () => boolean = () => true,
  options: FileTreeLoadOptions = {},
): Promise<void> {
  const generation = ++fileTreeLoadGeneration
  const directoryMutationGeneration = fileTreeDirectoryMutationGeneration
  const shouldAnimate = options.visualTransition === true
  if (shouldAnimate && shouldCommit()) {
    useWorkspaceStore.setState({ fileTreeLoadState: 'loading' })
  }

  let rootNodes: FileNode[]
  try {
    rootNodes = await window.electron.fileTree.load(workspacePath)
  } catch (error) {
    if (shouldAnimate && generation === fileTreeLoadGeneration && shouldCommit()) {
      useWorkspaceStore.setState({ fileTreeLoadState: 'error' })
    }
    throw error
  }

  // 当前 store 中的树属于活动工作区;仅当目标一致时才带着已展开分支去刷新
  const loadedPaths =
    getActiveWorkspacePath() === workspacePath
      ? collectLoadedDirectoryPaths(useWorkspaceStore.getState().fileTree)
      : []
  const childrenByPath = new Map<string, FileNode[]>()
  if (loadedPaths.length > 0) {
    const results = await Promise.all(
      loadedPaths.map(async (path) => {
        const children = await window.electron.fileTree.children(workspacePath, path).catch(() => [])
        return [path, children] as const
      }),
    )
    for (const [path, children] of results) childrenByPath.set(path, children)
  }

  if (
    generation !== fileTreeLoadGeneration ||
    directoryMutationGeneration !== fileTreeDirectoryMutationGeneration
  ) return
  if (!shouldCommit() || directoryMutationGeneration !== fileTreeDirectoryMutationGeneration) return

  useWorkspaceStore.setState({
    fileTree: applyLoadedChildren(rootNodes, childrenByPath),
    fileTreeLoadState: shouldAnimate ? 'revealing' : 'idle',
  })

}

/** 重拉单个目录的 children 并挂回树上。 */
function containsDirectory(nodes: FileNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.type !== 'directory') continue
    if (node.path === path) return true
    if (node.children?.length && containsDirectory(node.children, path)) return true
  }
  return false
}

export async function reloadWorkspaceDirectory(workspacePath: string, path: string): Promise<void> {
  const loadKey = `${workspacePath}\0${path}`
  const pending = pendingDirectoryLoads.get(loadKey)
  if (pending) return pending

  const operation = (async () => {
    const children = await window.electron.fileTree.children(workspacePath, path)
    if (getActiveWorkspacePath() !== workspacePath) return

    let committed = false
    useWorkspaceStore.setState((state) => {
      if (getActiveWorkspacePath() !== workspacePath) return {}
      if (!containsDirectory(state.fileTree, path)) return {}
      committed = true
      return { fileTree: injectDirectoryChildren(state.fileTree, path, children) }
    })
    if (committed) fileTreeDirectoryMutationGeneration += 1
  })()

  pendingDirectoryLoads.set(loadKey, operation)
  try {
    await operation
  } finally {
    if (pendingDirectoryLoads.get(loadKey) === operation) pendingDirectoryLoads.delete(loadKey)
  }
}

export async function chooseAndCreateWorkspace(): Promise<Workspace | null> {
  const result = await window.electron.dialog.openDirectory()
  const folderPath = result.filePaths[0]
  if (result.canceled || !folderPath) return null
  const workspace = await window.electron.workspace.create({
    name: folderPath.split(/[/\\]/).pop() || 'Workspace',
    path: folderPath,
  })
  invalidateEditorFileCache(folderPath)
  await loadWorkspaceFileTree(folderPath).catch(() => {})
  return workspace
}
