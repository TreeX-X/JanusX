import { useEffect } from 'react'
import { useAppStore } from '@/stores/app'
import { invalidateEditorFileCache, useEditorStore } from '@/stores/editor'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreeStore } from '@/stores/worktree'
import { useGitStore } from '@/stores/git'
import { getActiveScopePath, getScopePathForWorkspace, loadWorkspaceFileTree, refreshScopeFileTree } from './actions'
import { collectShellRestore, restoreShells } from '@/lib/shell-restore'

export function useWorkspaceBootstrap(): void {
  useEffect(() => {
    let activeScopePath: string | null = null
    const refreshActiveWorkspace = () => {
      const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState()
      const workspace = workspaces.find((item) => item.id === activeWorkspaceId)
      const nextPath = workspace ? getScopePathForWorkspace(workspace.id, workspace.path) : null
      if (nextPath === activeScopePath) return
      activeScopePath = nextPath
      if (nextPath) void useGitStore.getState().fetchStatus(nextPath)
    }
    refreshActiveWorkspace()
    const unsubscribeWorkspace = useWorkspaceStore.subscribe(refreshActiveWorkspace)
    const unsubscribeWorktree = useWorktreeStore.subscribe(refreshActiveWorkspace)
    return () => {
      unsubscribeWorkspace()
      unsubscribeWorktree()
    }
  }, [])

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
      // One-shot cold restore of pre-quit shells; agents never auto-run.
      void restoreShells().catch(() => undefined)
    }).catch(() => useAppStore.setState({ loadState: 'no-workspace' }))
  }, [])

  useEffect(() => window.electron.system.onPrepareQuit(async () => {
    try {
      await window.electron.session.saveLayout(collectShellRestore())
    } catch {
      // Quit must never block on a failed snapshot.
    }
  }), [])

  // Note: 外部 `git worktree add/remove` 由主进程 watch + 轮询推送，左侧无需手动刷新
  useEffect(() => window.electron.worktree.onChanged((payload) => {
    const prevScope = useWorktreeStore.getState().activePaths[payload.workspaceId] ?? payload.workspacePath
    useWorktreeStore.getState().applyExternalWorktrees(payload.workspaceId, payload.workspacePath, payload.worktrees)
    const nextScope = useWorktreeStore.getState().activePaths[payload.workspaceId] ?? payload.workspacePath
    if (prevScope === nextScope) return
    // 外部删除命中活动盘时回落到主盘并重刷文件树；新增从不抢占当前 scope
    if (useWorkspaceStore.getState().activeWorkspaceId !== payload.workspaceId) return
    void refreshScopeFileTree(nextScope, true).catch(() => {})
  }), [])

  useEffect(() => window.electron.fileTree.onChanged((payload) => {
    const workspacePath = payload.workspacePath
    const scopePath = getActiveScopePath()
    if (!scopePath || scopePath !== workspacePath) return
    invalidateEditorFileCache(workspacePath)
    void useGitStore.getState().fetchStatus(workspacePath)
    void loadWorkspaceFileTree(workspacePath, () => getActiveScopePath() === workspacePath).catch(() => {})
    void useEditorStore.getState().reloadOpenFiles(workspacePath, payload.changedFilePath ?? null)
  }), [])
}
