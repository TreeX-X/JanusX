import { create } from 'zustand'
import type { AppLoadState } from '@/types'

interface AppStore {
  loadState: AppLoadState
  sidebarCollapsed: boolean
  panelCollapsed: boolean
  blueprintMode: boolean
  /** 翻转动画时长（ms），快甩 350 / 慢拖 650 */
  flipDuration: number
  /** 灵动岛是否正在拖拽中（App.tsx 据此禁用 transition） */
  isIslandDragging: boolean
  setLoadState: (state: AppLoadState) => void
  toggleSidebar: () => void
  togglePanel: () => void
  toggleBlueprint: () => void
  setBlueprintMode: (enabled: boolean) => void
  setFlipDuration: (ms: number) => void
  setIsIslandDragging: (v: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  loadState: 'no-workspace',
  sidebarCollapsed: false,
  panelCollapsed: false,
  blueprintMode: false,
  flipDuration: 650,
  isIslandDragging: false,
  setLoadState: (loadState) => set({ loadState }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  toggleBlueprint: () => set((s) => ({ blueprintMode: !s.blueprintMode })),
  setBlueprintMode: (blueprintMode) => set({ blueprintMode }),
  setFlipDuration: (ms) => set({ flipDuration: ms }),
  setIsIslandDragging: (v) => set({ isIslandDragging: v }),
}))
