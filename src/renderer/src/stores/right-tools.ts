import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { PersistStorage, StateStorage } from 'zustand/middleware'
import { useAppStore } from './app'
import {
  activateRightTool,
  clampRightToolPanelWidth,
  closeRightTool,
  createDefaultRightToolPreferences,
  openRightTool,
  reconcileRightToolPreferences,
  RIGHT_TOOL_SCHEMA_VERSION,
  toggleRightToolFromRail,
} from '../right-tools/state'
import type {
  PanelCollapseCommand,
  RightToolId,
  RightToolPreferencesV1,
  RightToolTransition,
} from '../right-tools/types'

export const RIGHT_TOOL_STORAGE_KEY = 'janusx:right-tools:v1'
export const RIGHT_TOOL_PERSIST_VERSION = RIGHT_TOOL_SCHEMA_VERSION

interface RightToolStore extends RightToolPreferencesV1 {
  openTool: (toolId: RightToolId) => void
  activateTool: (toolId: RightToolId) => void
  closeTool: (toolId: RightToolId) => void
  toggleFromRail: (toolId: RightToolId) => void
  setPanelWidth: (width: number) => void
  reconcile: () => void
}

const defaults = createDefaultRightToolPreferences()

export function selectPersistedRightToolPreferences(
  state: RightToolPreferencesV1,
): RightToolPreferencesV1 {
  // Only display preferences survive restarts; every launch starts rail-only.
  return {
    schemaVersion: state.schemaVersion,
    openToolIds: [],
    activeToolId: null,
    panelWidth: state.panelWidth,
  }
}

export function createSafeRightToolStorage(
  getStorage: () => StateStorage,
): PersistStorage<RightToolPreferencesV1> | undefined {
  const storage = createJSONStorage<RightToolPreferencesV1>(getStorage)
  if (!storage) return undefined

  return {
    ...storage,
    getItem: (name) => {
      try {
        const value = storage.getItem(name)
        return value instanceof Promise ? value.catch(() => null) : value
      } catch {
        return null
      }
    },
  }
}

export const useRightToolStore = create<RightToolStore>()(
  persist<RightToolStore, [], [], RightToolPreferencesV1>(
    (set, get) => {
      const applyTransition = (result: RightToolTransition): void => {
        set(result.preferences)
        applyPanelCollapseCommand(result.panelCollapseCommand)
      }

      return {
        ...defaults,
        openTool: (toolId) => applyTransition(openRightTool(get(), toolId)),
        activateTool: (toolId) => applyTransition(activateRightTool(get(), toolId)),
        closeTool: (toolId) => applyTransition(closeRightTool(get(), toolId)),
        toggleFromRail: (toolId) => applyTransition(toggleRightToolFromRail(get(), toolId)),
        setPanelWidth: (panelWidth) => set({ panelWidth: clampRightToolPanelWidth(panelWidth) }),
        reconcile: () => set(reconcileRightToolPreferences(get())),
      }
    },
    {
      name: RIGHT_TOOL_STORAGE_KEY,
      version: RIGHT_TOOL_PERSIST_VERSION,
      storage: createSafeRightToolStorage(() => localStorage),
      partialize: selectPersistedRightToolPreferences,
      migrate: () => createDefaultRightToolPreferences(),
      // Force rail-only on launch regardless of legacy persisted open sets.
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...reconcileRightToolPreferences(persistedState),
        openToolIds: [],
        activeToolId: null,
      }),
    },
  ),
)

function applyPanelCollapseCommand(command: PanelCollapseCommand): void {
  const appStore = useAppStore.getState()

  if (command === 'expand') appStore.setPanelCollapsed(false)
  if (command === 'collapse') appStore.setPanelCollapsed(true)
  if (command === 'toggle') appStore.togglePanel()
}
