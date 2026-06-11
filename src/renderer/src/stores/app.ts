import { create } from 'zustand'
import type { AppLoadState } from '@/types'

interface AppStore {
  loadState: AppLoadState
  sidebarCollapsed: boolean
  panelCollapsed: boolean
  setLoadState: (state: AppLoadState) => void
  toggleSidebar: () => void
  togglePanel: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  loadState: 'no-workspace',
  sidebarCollapsed: false,
  panelCollapsed: false,
  setLoadState: (loadState) => set({ loadState }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
}))
