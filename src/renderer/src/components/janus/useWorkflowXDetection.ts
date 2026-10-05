import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkflowXStore } from '@/stores/workflowx'

/** Mounted by the general app surface, independent of terminal/blueprint/Island state. */
export function useWorkflowXDetection(): void {
  const workspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const workspacePath = useWorkspaceStore(state => state.workspaces.find(item => item.id === state.activeWorkspaceId)?.path)
  useEffect(() => {
    const check = (refresh = false) => { void useWorkflowXStore.getState().check(workspaceId, refresh) }
    const onFocus = () => check(true)
    const onVisible = () => { if (document.visibilityState === 'visible') check(true) }
    check(true)
    // Small bounded reads every 30s also catch global config changes made outside Janus.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') check() }, 30_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      useWorkflowXStore.getState().invalidate()
    }
  }, [workspaceId, workspacePath])
}
