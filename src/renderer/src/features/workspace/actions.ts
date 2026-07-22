import type { FileNode, Workspace } from '@/types'
import { invalidateEditorFileCache } from '@/stores/editor'
import { useWorkspaceStore } from '@/stores/workspace'

function mergeFileTreeState(nextNodes: FileNode[], currentNodes: FileNode[]): FileNode[] {
  const currentMap = new Map(currentNodes.map((node) => [node.path, node]))
  return nextNodes.map((node) => {
    const existing = currentMap.get(node.path)
    if (!existing || node.type !== 'directory') return node
    const currentChildren = existing.children ?? []
    const nextChildren = node.children ?? []
    return {
      ...node,
      loaded: existing.loaded ?? false,
      hasChildren: node.hasChildren ?? existing.hasChildren,
      children: existing.loaded && currentChildren.length > 0
        ? nextChildren.length > 0 ? mergeFileTreeState(nextChildren, currentChildren) : currentChildren
        : nextChildren,
    }
  })
}

export async function loadWorkspaceFileTree(
  workspacePath: string,
  shouldCommit: () => boolean = () => true,
): Promise<void> {
  const tree = await window.electron.fileTree.load(workspacePath)
  useWorkspaceStore.setState((state) =>
    shouldCommit() ? { fileTree: mergeFileTreeState(tree, state.fileTree) } : {},
  )
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
