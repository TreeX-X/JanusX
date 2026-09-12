// Note: 产物工作区 canonical UI state; Office kinds lease a watch port via the
// office engine, local kinds (md/html) render from disk with zero ports.
// See .agents/notes/implemented/feature/2026-09-13-product-workspace.md
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { OfficeErrorCode, OfficeFileEntry } from '../../../shared/office'
import { productKindForPath, toProductFileEntry, type ProductFileEntry, type ProductKind } from '../../../shared/product'
import { officeService, type OfficeService } from '../services/office'

export type ProductTabStatus = 'starting' | 'ready' | 'reloading' | 'error'
export const PRODUCT_RENDERER_REQUEST_TIMEOUT_MS = 12_000

type BoundedRequestResult<T> =
  | { kind: 'result'; value: T }
  | { kind: 'rejected' }
  | { kind: 'timeout' }

function boundedRequest<T>(
  request: Promise<T>,
  timeoutMs: number,
  onLateResult: (value: T) => void,
): Promise<BoundedRequestResult<T>> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      resolve({ kind: 'timeout' })
    }, timeoutMs)
    request.then((value) => {
      if (settled) {
        onLateResult(value)
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({ kind: 'result', value })
    }, () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ kind: 'rejected' })
    })
  })
}

export interface ProductWorkspaceTab {
  tabId: string
  workspaceId: string
  relPath: string
  kind: ProductKind
  previewLeaseId?: string
  port?: number
  status: ProductTabStatus
  errorCode?: OfficeErrorCode
  reloadRequestId?: number
  revision?: number
}

export interface ProductNotice {
  workspaceId: string
  entry: ProductFileEntry
}

interface ProductWorkspaceState {
  tabs: ProductWorkspaceTab[]
  activeTabIds: Record<string, string | undefined>
  requestEpochs: Record<string, number>
  productsByWorkspace: Record<string, ProductFileEntry[]>
  productNotice: ProductNotice | null
  visibleWorkspaceId: string | null
  initializeProducts: (workspaceId: string, entries: OfficeFileEntry[]) => void
  reconcileProducts: (workspaceId: string, entries: OfficeFileEntry[]) => void
  consumeProductNotice: () => void
  showProductWorkspace: (workspaceId: string) => void
  closeProductWorkspace: () => void
  clearWorkspaceUi: (workspaceId: string) => void
  openPreview: (workspaceId: string, relPath: string) => Promise<void>
  activateTab: (workspaceId: string, tabId: string) => void
  closeTab: (tabId: string) => Promise<void>
  reloadTab: (tabId: string) => Promise<void>
  releaseWorkspace: (workspaceId: string, stopLeases?: boolean) => Promise<void>
  handleEvicted: (previewLeaseIds: readonly string[], reason: 'crashed' | 'workspace-removed' | 'shutdown') => void
}

let nextTabId = 0
let nextReloadRequestId = 0
const tabIdFor = (workspaceId: string) => `${workspaceId}:product:${++nextTabId}`
const nextActiveTab = (tabs: ProductWorkspaceTab[], workspaceId: string) => tabs.find((tab) => tab.workspaceId === workspaceId)?.tabId

export function createProductWorkspaceStore(
  service: OfficeService = officeService,
  reportStopFailure: (message: string, detail: unknown) => void = (message, detail) => console.error(message, detail),
  requestTimeoutMs = PRODUCT_RENDERER_REQUEST_TIMEOUT_MS,
): UseBoundStore<StoreApi<ProductWorkspaceState>> {
  const stopSafely = async (workspaceId: string, relPath: string, previewLeaseId: string) => {
    try {
      const result = await service.stopPreview({ workspaceId, relPath, previewLeaseId })
      if (!result.ok) reportStopFailure('[product] Failed to stop preview lease', result.error)
    } catch (error) {
      reportStopFailure('[product] Failed to stop preview lease', error)
    }
  }

  return create<ProductWorkspaceState>((set, get) => ({
    tabs: [],
    activeTabIds: {},
    requestEpochs: {},
    productsByWorkspace: {},
    productNotice: null,
    visibleWorkspaceId: null,

    initializeProducts: (workspaceId, entries) => {
      const products = entries.map(toProductFileEntry)
      set((state) => ({
        productsByWorkspace: { ...state.productsByWorkspace, [workspaceId]: products },
        productNotice: state.productNotice?.workspaceId === workspaceId ? null : state.productNotice,
      }))
    },

    reconcileProducts: (workspaceId, entries) => {
      const products = entries.map(toProductFileEntry)
      set((state) => {
        const previousPaths = new Set((state.productsByWorkspace[workspaceId] ?? []).map((entry) => entry.relPath))
        const added = products.find((entry) => !previousPaths.has(entry.relPath))
        const currentNotice = state.productNotice?.workspaceId === workspaceId
          && !products.some((entry) => entry.relPath === state.productNotice?.entry.relPath)
          ? null
          : state.productNotice
        const previousByPath = new Map((state.productsByWorkspace[workspaceId] ?? []).map((entry) => [entry.relPath, entry]))
        const tabs = state.tabs.map((tab) => {
          if (tab.workspaceId !== workspaceId || tab.kind === 'office') return tab
          const latest = products.find((entry) => entry.relPath === tab.relPath)
          const previous = previousByPath.get(tab.relPath)
          if (latest && previous && latest.mtimeMs !== previous.mtimeMs) {
            return { ...tab, revision: (tab.revision ?? 0) + 1 }
          }
          return tab
        })
        return {
          productsByWorkspace: { ...state.productsByWorkspace, [workspaceId]: products },
          productNotice: added ? { workspaceId, entry: added } : currentNotice,
          tabs,
        }
      })
    },

    consumeProductNotice: () => set({ productNotice: null }),
    showProductWorkspace: (workspaceId) => set({ visibleWorkspaceId: workspaceId }),
    closeProductWorkspace: () => set({ visibleWorkspaceId: null }),
    clearWorkspaceUi: (workspaceId) => {
      set((state) => {
        const { [workspaceId]: _, ...productsByWorkspace } = state.productsByWorkspace
        return {
          productsByWorkspace,
          productNotice: state.productNotice?.workspaceId === workspaceId ? null : state.productNotice,
          visibleWorkspaceId: state.visibleWorkspaceId === workspaceId ? null : state.visibleWorkspaceId,
        }
      })
    },

    openPreview: async (workspaceId, relPath) => {
      const existing = get().tabs.find((tab) => tab.workspaceId === workspaceId && tab.relPath === relPath)
      if (existing) {
        set((state) => ({ activeTabIds: { ...state.activeTabIds, [workspaceId]: existing.tabId } }))
        return
      }
      const tabId = tabIdFor(workspaceId)
      const kind = productKindForPath(relPath)
      if (kind !== 'office') {
        set((state) => ({
          tabs: [...state.tabs, { tabId, workspaceId, relPath, kind, status: 'ready' }],
          activeTabIds: { ...state.activeTabIds, [workspaceId]: tabId },
        }))
        return
      }
      const epoch = get().requestEpochs[workspaceId] ?? 0
      set((state) => ({
        tabs: [...state.tabs, { tabId, workspaceId, relPath, kind, status: 'starting' }],
        activeTabIds: { ...state.activeTabIds, [workspaceId]: tabId },
      }))
      const outcome = await boundedRequest(
        service.startPreview({ workspaceId, relPath }),
        requestTimeoutMs,
        (lateResult) => {
          if (lateResult.ok) void stopSafely(workspaceId, relPath, lateResult.value.previewLeaseId)
        },
      )
      if (outcome.kind !== 'result') {
        set((state) => ({ tabs: state.tabs.map((tab) => tab.tabId === tabId
          ? { ...tab, status: 'error', errorCode: outcome.kind === 'timeout' ? 'PORT_TIMEOUT' : 'START_FAILED' }
          : tab) }))
        return
      }
      const result = outcome.value
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
      if (!tab || tab.status === 'reloading') return
      if (tab.kind !== 'office' || !tab.previewLeaseId) {
        set((state) => ({ tabs: state.tabs.map((item) => item.tabId === tabId ? { ...item, revision: (item.revision ?? 0) + 1 } : item) }))
        return
      }
      const previousLeaseId = tab.previewLeaseId
      const epoch = get().requestEpochs[tab.workspaceId] ?? 0
      const reloadRequestId = ++nextReloadRequestId
      const retireFailedReload = async (errorCode: OfficeErrorCode) => {
        let retired = false
        set((state) => ({ tabs: state.tabs.map((item) => {
          if (item.tabId !== tabId || item.reloadRequestId !== reloadRequestId) return item
          retired = true
          return {
            ...item,
            previewLeaseId: undefined,
            port: undefined,
            status: 'error',
            errorCode,
            reloadRequestId: undefined,
          }
        }) }))
        if (retired) await stopSafely(tab.workspaceId, tab.relPath, previousLeaseId)
      }
      set((state) => ({ tabs: state.tabs.map((item) => item.tabId === tabId ? { ...item, status: 'reloading', errorCode: undefined, reloadRequestId } : item) }))
      const outcome = await boundedRequest(
        service.reloadPreview({ workspaceId: tab.workspaceId, relPath: tab.relPath, previewLeaseId: previousLeaseId }),
        requestTimeoutMs,
        (lateResult) => {
          if (lateResult.ok) void stopSafely(tab.workspaceId, tab.relPath, lateResult.value.previewLeaseId)
        },
      )
      if (outcome.kind !== 'result') {
        await retireFailedReload(outcome.kind === 'timeout' ? 'PORT_TIMEOUT' : 'START_FAILED')
        return
      }
      const result = outcome.value
      if (!result.ok) {
        await retireFailedReload(result.error.code)
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

export const useProductWorkspaceStore = createProductWorkspaceStore()
