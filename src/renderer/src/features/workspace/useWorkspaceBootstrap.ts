import { useEffect } from 'react'
import { useAppStore } from '@/stores/app'
import { invalidateEditorFileCache } from '@/stores/editor'
import { useWorkspaceStore } from '@/stores/workspace'
import { loadWorkspaceFileTree } from './actions'

export function useWorkspaceBootstrap(): void {
  useEffect(() => {
    void window.electron.workspace.initialize().then(async (state) => {
      useWorkspaceStore.setState({ workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId })
      if (state.workspaces.length === 0) {
        useAppStore.setState({ loadState: 'no-workspace' })
        return
      }
      useAppStore.setState({ loadState: 'no-terminal' })
      const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)
      if (activeWorkspace) await loadWorkspaceFileTree(activeWorkspace.path).catch(() => {})
    }).catch(() => useAppStore.setState({ loadState: 'no-workspace' }))
  }, [])

  useEffect(() => window.electron.fileTree.onChanged((workspacePath) => {
    const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState()
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
    if (!activeWorkspace || activeWorkspace.path !== workspacePath) return
    invalidateEditorFileCache(workspacePath)
    void loadWorkspaceFileTree(workspacePath).catch(() => {})
  }), [])
}
