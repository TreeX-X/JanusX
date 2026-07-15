import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { OfficeErrorCode } from '../../../shared/office'
import { officeService, type OfficeService } from '../services/office'

export type OfficeTabStatus = 'starting' | 'ready' | 'reloading' | 'error'

export interface OfficePreviewTab {
  tabId: string
  workspaceId: string
  relPath: string
  previewLeaseId?: string
  port?: number
  status: OfficeTabStatus
  errorCode?: OfficeErrorCode
  reloadRequestId?: number
}

interface OfficeStoreState {
  tabs: OfficePreviewTab[]
  activeTabIds: Record<string, string | undefined>
  requestEpochs: Record<string, number>
  openPreview: (workspaceId: string, relPath: string) => Promise<void>
  activateTab: (workspaceId: string, tabId: string) => void
  closeTab: (tabId: string) => Promise<void>
  reloadTab: (tabId: string) => Promise<void>
  releaseWorkspace: (workspaceId: string, stopLeases?: boolean) => Promise<void>
  handleEvicted: (previewLeaseIds: readonly string[], reason: 'crashed' | 'workspace-removed' | 'shutdown') => void
}

let nextTabId = 0
let nextReloadRequestId = 0
const tabIdFor = (workspaceId: string) => `${workspaceId}:office:${++nextTabId}`
const nextActiveTab = (tabs: OfficePreviewTab[], workspaceId: string) => tabs.find((tab) => tab.workspaceId === workspaceId)?.tabId

export function createOfficeStore(
  service: OfficeService = officeService,
  reportStopFailure: (message: string, detail: unknown) => void = (message, detail) => console.error(message, detail),
): UseBoundStore<StoreApi<OfficeStoreState>> {
  const stopSafely = async (workspaceId: string, relPath: string, previewLeaseId: string) => {
    try {
      const result = await service.stopPreview({ workspaceId, relPath, previewLeaseId })
      if (!result.ok) reportStopFailure('[office] Failed to stop preview lease', result.error)
    } catch (error) {
      reportStopFailure('[office] Failed to stop preview lease', error)
    }
  }

  return create<OfficeStoreState>((set, get) => ({
    tabs: [],
    activeTabIds: {},
    requestEpochs: {},

    openPreview: async (workspaceId, relPath) => {
      const existing = get().tabs.find((tab) => tab.workspaceId === workspaceId && tab.relPath === relPath)
      if (existing) {
        set((state) => ({ activeTabIds: { ...state.activeTabIds, [workspaceId]: existing.tabId } }))
        return
      }
      const tabId = tabIdFor(workspaceId)
      const epoch = get().requestEpochs[workspaceId] ?? 0
      set((state) => ({
        tabs: [...state.tabs, { tabId, workspaceId, relPath, status: 'starting' }],
        activeTabIds: { ...state.activeTabIds, [workspaceId]: tabId },
      }))
      const result = await service.startPreview({ workspaceId, relPath })
      if (!result.ok) {
        set((state) => ({ tabs: state.tabs.map((tab) => tab.tabId === tabId ? { ...tab, status: 'error', errorCode: result.error.code } : tab) }))
        return
      }
      const current = get()
      if ((current.requestEpochs[workspaceId] ?? 0) !== epoch || !current.tabs.some((tab) => tab.tabId === tabId)) {
        await stopSafely(workspaceId, relPath, result.value.previewLeaseId)
        return
      }
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.tabId === tabId
          ? { ...tab, previewLeaseId: result.value.previewLeaseId, port: result.value.port, status: 'ready', errorCode: undefined }
          : tab),
      }))
    },

    activateTab: (workspaceId, tabId) => {
      if (get().tabs.some((tab) => tab.tabId === tabId && tab.workspaceId === workspaceId)) {
        set((state) => ({ activeTabIds: { ...state.activeTabIds, [workspaceId]: tabId } }))
      }
    },

    closeTab: async (tabId) => {
      const tab = get().tabs.find((item) => item.tabId === tabId)
      if (!tab) return
      set((state) => {
        const tabs = state.tabs.filter((item) => item.tabId !== tabId)
        return {
          tabs,
          activeTabIds: state.activeTabIds[tab.workspaceId] === tabId
            ? { ...state.activeTabIds, [tab.workspaceId]: nextActiveTab(tabs, tab.workspaceId) }
            : state.activeTabIds,
        }
      })
      if (tab.previewLeaseId) await stopSafely(tab.workspaceId, tab.relPath, tab.previewLeaseId)
    },

    reloadTab: async (tabId) => {
      const tab = get().tabs.find((item) => item.tabId === tabId)
      if (!tab?.previewLeaseId || tab.status === 'reloading') return
      const epoch = get().requestEpochs[tab.workspaceId] ?? 0
      const reloadRequestId = ++nextReloadRequestId
      set((state) => ({ tabs: state.tabs.map((item) => item.tabId === tabId ? { ...item, status: 'reloading', errorCode: undefined, reloadRequestId } : item) }))
      const result = await service.reloadPreview({ workspaceId: tab.workspaceId, relPath: tab.relPath, previewLeaseId: tab.previewLeaseId })
      if (!result.ok) {
        set((state) => ({ tabs: state.tabs.map((item) => item.tabId === tabId && item.reloadRequestId === reloadRequestId
          ? { ...item, status: 'error', errorCode: result.error.code, reloadRequestId: undefined }
          : item) }))
        return
      }
      const current = get()
      const currentTab = current.tabs.find((item) => item.tabId === tabId)
      if ((current.requestEpochs[tab.workspaceId] ?? 0) !== epoch || currentTab?.reloadRequestId !== reloadRequestId) {
        await stopSafely(tab.workspaceId, tab.relPath, result.value.previewLeaseId)
        return
      }
      set((state) => ({
        tabs: state.tabs.map((item) => item.tabId === tabId && item.reloadRequestId === reloadRequestId
          ? { ...item, previewLeaseId: result.value.previewLeaseId, port: result.value.port, status: 'ready', errorCode: undefined, reloadRequestId: undefined }
          : item),
      }))
    },

    releaseWorkspace: async (workspaceId, stopLeases = true) => {
      const leases = get().tabs.filter((tab) => tab.workspaceId === workspaceId && tab.previewLeaseId)
      set((state) => {
        const { [workspaceId]: _, ...activeTabIds } = state.activeTabIds
        return {
          tabs: state.tabs.filter((tab) => tab.workspaceId !== workspaceId),
          activeTabIds,
          requestEpochs: { ...state.requestEpochs, [workspaceId]: (state.requestEpochs[workspaceId] ?? 0) + 1 },
        }
      })
      if (stopLeases) await Promise.all(leases.map((tab) => stopSafely(workspaceId, tab.relPath, tab.previewLeaseId!)))
    },

    handleEvicted: (previewLeaseIds, reason) => {
      const evicted = new Set(previewLeaseIds)
      if (reason !== 'crashed') {
        set((state) => ({ tabs: state.tabs.filter((tab) => !tab.previewLeaseId || !evicted.has(tab.previewLeaseId)) }))
        return
      }
      set((state) => ({ tabs: state.tabs.map((tab) => tab.previewLeaseId && evicted.has(tab.previewLeaseId) ? { ...tab, status: 'error', errorCode: 'START_FAILED' } : tab) }))
    },
  }))
}

export const useOfficeStore = createOfficeStore()
