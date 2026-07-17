import { useEffect } from 'react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'

export function useTerminalLifecycle(): void {
  const updateTerminal = useWorkspaceStore((state) => state.updateTerminal)
  const setLoadState = useAppStore((state) => state.setLoadState)

  useEffect(() => window.electron.terminal.onExit(({ id, exitCode }) => {
    updateTerminal(id, { status: 'exited', exitCode, updatedAt: Date.now() })
  }), [updateTerminal])

  useEffect(() => window.electron.terminal.onFocus(({ id }) => {
    const store = useWorkspaceStore.getState()
    if (store.terminals.some((terminal) => terminal.id === id)) {
      store.setActiveTerminal(id)
      setLoadState('terminal-active')
      return
    }
    const workspaceId = Object.entries(store.terminalSnapshots).find(([, snapshot]) =>
      snapshot.terminals.some((terminal) => terminal.id === id),
    )?.[0]
    if (!workspaceId) return
    store.setActiveWorkspace(workspaceId)
    requestAnimationFrame(() => {
      useWorkspaceStore.getState().setActiveTerminal(id)
      setLoadState('terminal-active')
    })
  }), [setLoadState])
}
