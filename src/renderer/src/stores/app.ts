import { create } from 'zustand'
import type { AppLoadState } from '@/types'

export type ActiveWorkbench = 'blueprint' | 'knowledge' | null

interface AppStore {
  loadState: AppLoadState
  sidebarCollapsed: boolean
  panelCollapsed: boolean
  blueprintMode: boolean
  activeWorkbench: ActiveWorkbench
  /** 翻转动画时长（ms），快甩 350 / 慢拖 650 */
  flipDuration: number
  /** 灵动岛是否正在拖拽中（App.tsx 据此禁用 transition） */
  isIslandDragging: boolean
  /** 拖拽翻转进度 0~1，用于实时预览旋转角度 */
  dragFlipProgress: number
  /** Janus 运行态 */
  janusRunning: boolean
  /** 运行中的项目列表 */
  runningProjects: any[]
  setLoadState: (state: AppLoadState) => void
  toggleSidebar: () => void
  togglePanel: () => void
  setPanelCollapsed: (collapsed: boolean) => void
  toggleBlueprint: () => void
  setBlueprintMode: (enabled: boolean) => void
  setActiveWorkbench: (workbench: ActiveWorkbench) => void
  toggleWorkbench: (workbench: Exclude<ActiveWorkbench, null>) => void
  setFlipDuration: (ms: number) => void
  setIsIslandDragging: (v: boolean) => void
  setDragFlipProgress: (v: number) => void
  setJanusRunning: (running: boolean) => void
  setRunningProjects: (projects: any[]) => void
}

export const useAppStore = create<AppStore>((set) => ({
  loadState: 'no-workspace',
  sidebarCollapsed: false,
  panelCollapsed: false,
  blueprintMode: false,
  activeWorkbench: null,
  flipDuration: 650,
  isIslandDragging: false,
  dragFlipProgress: 0,
  janusRunning: false,
  runningProjects: [],
  setLoadState: (loadState) => set({ loadState }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
  toggleBlueprint: () => set((s) => ({ blueprintMode: !s.blueprintMode })),
  setBlueprintMode: (blueprintMode) => set({ blueprintMode }),
  setActiveWorkbench: (activeWorkbench) => set({ activeWorkbench }),
  toggleWorkbench: (workbench) => set((s) => ({ activeWorkbench: s.activeWorkbench === workbench ? null : workbench })),
  setFlipDuration: (ms) => set({ flipDuration: ms }),
  setIsIslandDragging: (v) => set({ isIslandDragging: v }),
  setDragFlipProgress: (v) => set({ dragFlipProgress: v }),
  setJanusRunning: (running) => set({ janusRunning: running }),
  setRunningProjects: (projects) => set({ runningProjects: projects }),
}))
