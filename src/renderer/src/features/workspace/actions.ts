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
 * - reloadWorkspaceDirectory 捕获启动时代际;若期间发生全量加载则丢弃,避免旧子树写回
 * 不同目录的并发 reload 互不抢代际,可同时提交
 */
let fileTreeLoadGeneration = 0

/**
 * 加载工作区文件树(唯一入口)。
 * 根层重新拉取之外,当前树中所有已展开加载过的目录也会同步重拉,
 * 保证外部文件系统变化(agent 写文件、终端操作)反映到已展开分支。
 */
export async function loadWorkspaceFileTree(
  workspacePath: string,
  shouldCommit: () => boolean = () => true,
): Promise<void> {
  const generation = ++fileTreeLoadGeneration
  const rootNodes = await window.electron.fileTree.load(workspacePath)

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

  if (generation !== fileTreeLoadGeneration) return
  useWorkspaceStore.setState(() =>
    shouldCommit() ? { fileTree: applyLoadedChildren(rootNodes, childrenByPath) } : {},
  )
}

/** 重拉单个目录的 children 并挂回树上;工作区已切换或全量刷新已开始时丢弃结果 */
export async function reloadWorkspaceDirectory(workspacePath: string, path: string): Promise<void> {
  const generation = fileTreeLoadGeneration
  const children = await window.electron.fileTree.children(workspacePath, path)
  if (generation !== fileTreeLoadGeneration) return
  if (getActiveWorkspacePath() !== workspacePath) return

  useWorkspaceStore.setState((state) => {
    if (generation !== fileTreeLoadGeneration) return {}
    if (getActiveWorkspacePath() !== workspacePath) return {}
    return { fileTree: injectDirectoryChildren(state.fileTree, path, children) }
  })
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
