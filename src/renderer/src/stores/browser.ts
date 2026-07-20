import { create } from 'zustand'
import type { BrowserSurfaceState } from '../../../shared/ipc/browser'
import { useWorkspaceStore } from '@/stores/workspace'

interface BrowserStore {
  /*-- 按 surfaceId 跟踪主进程推送的 surface 状态 --*/
  surfaces: Record<string, BrowserSurfaceState>
  applySurfaceState: (state: BrowserSurfaceState) => void
  /*-- popOut 成功后先行更新载体，避免 pane 卸载时误将视图归零隐藏（视图已移交独立窗口） --*/
  markCarrier: (surfaceId: string, carrier: BrowserSurfaceState['carrier']) => void
}

export const useBrowserStore = create<BrowserStore>((set) => ({
  surfaces: {},
  applySurfaceState: (state) =>
    set((s) => {
      if (state.destroyed) {
        if (!s.surfaces[state.surfaceId]) return {}
        const next = { ...s.surfaces }
        delete next[state.surfaceId]
        return { surfaces: next }
      }
      return { surfaces: { ...s.surfaces, [state.surfaceId]: state } }
    }),
  markCarrier: (surfaceId, carrier) =>
    set((s) => {
      const current = s.surfaces[surfaceId]
      if (!current) return {}
      return { surfaces: { ...s.surfaces, [surfaceId]: { ...current, carrier } } }
    }),
}))

/*-- 订阅主进程 browser 事件，窗口级一次性安装（main.tsx）；窗口生命周期即订阅生命周期 --*/
export function initBrowserEventSubscriptions(): () => void {
  const offState = window.electron.browser.onStateChanged((state) => {
    const prev = useBrowserStore.getState().surfaces[state.surfaceId]
    useBrowserStore.getState().applySurfaceState(state)
    /*-- embed 回嵌：surface 从独立窗口回到 pane 载体时，主窗口工作区补建/激活 pane tab。
        独立窗口自身的 workspace store 无 activeWorkspaceId，天然跳过 --*/
    if (!state.destroyed && prev?.carrier === 'window' && state.carrier === 'pane') {
      const workspace = useWorkspaceStore.getState()
      if (workspace.activeWorkspaceId) workspace.addBrowserSurfaceToTree(state.surfaceId)
    }
  })
  const offAgentControl = window.electron.browser.onAgentControlChanged(({ surfaceId, active }) => {
    const current = useBrowserStore.getState().surfaces[surfaceId]
    if (!current) return
    useBrowserStore.getState().applySurfaceState({ ...current, agentControlled: active })
  })
  return () => {
    offState()
    offAgentControl()
  }
}
