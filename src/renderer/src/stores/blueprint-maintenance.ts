import { create } from 'zustand'
import { useBlueprintStore } from './blueprint'
import {
  applyMaintenanceChangeSet,
  applyMaintenanceUndo,
  cancelMaintenanceTask,
  completeMaintenanceTask,
  dismissMaintenanceProposal,
  listMaintenanceAudits,
  listMaintenanceTasks,
  onMaintenanceTask,
  prepareMaintenanceUndo,
  startMaintenanceTask,
  type BlueprintMaintenanceApplyInput,
  type BlueprintMaintenanceAuditRecord,
  type BlueprintMaintenanceDismissInput,
  type BlueprintMaintenanceStartInput,
  type BlueprintMaintenanceTask,
  type BlueprintMaintenanceUndoApplyInput,
  type BlueprintMaintenanceUndoPrepareResult,
} from '@/services/blueprint'

type MaintenanceOpenRequest = { blueprintId: string; nodeId?: string } | null

interface BlueprintMaintenanceStore {
  contextSelection: MaintenanceOpenRequest
  selectContext: (selection: MaintenanceOpenRequest) => void
  tasks: BlueprintMaintenanceTask[]
  audits: Record<string, BlueprintMaintenanceAuditRecord[]>
  pendingUndo: BlueprintMaintenanceUndoPrepareResult | null
  openRequest: MaintenanceOpenRequest
  initialized: boolean
  error: string | null
  initialize: () => Promise<void>
  loadAudits: (blueprintId: string, taskId?: string) => Promise<void>
  requestOpen: (request: Exclude<MaintenanceOpenRequest, null>) => void
  clearOpenRequest: () => void
  start: (input: BlueprintMaintenanceStartInput) => Promise<BlueprintMaintenanceTask | null>
  apply: (input: BlueprintMaintenanceApplyInput) => Promise<boolean>
  cancel: (taskId: string) => Promise<void>
  complete: (taskId: string) => Promise<void>
  dismiss: (input: BlueprintMaintenanceDismissInput) => Promise<boolean>
  prepareUndo: (blueprintId: string, auditId: string) => Promise<boolean>
  clearPendingUndo: () => void
  applyUndo: (input: BlueprintMaintenanceUndoApplyInput) => Promise<boolean>
}

function upsert(tasks: BlueprintMaintenanceTask[], task: BlueprintMaintenanceTask): BlueprintMaintenanceTask[] {
  return [task, ...tasks.filter((item) => item.id !== task.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

let unsubscribe: (() => void) | null = null
let undoRequest = 0

async function refreshComposedView(): Promise<void> {
  await useBlueprintStore.getState().refreshAfterAnalysis()
  const error = useBlueprintStore.getState().error
  if (error) throw new Error(`Maintenance applied; view refresh failed: ${error}`)
}

export const useBlueprintMaintenanceStore = create<BlueprintMaintenanceStore>((set, get) => ({
  tasks: [], audits: {}, pendingUndo: null, openRequest: null, contextSelection: null, initialized: false, error: null,
  selectContext: (contextSelection) => set({ contextSelection }),
  initialize: async () => {
    if (!unsubscribe) unsubscribe = onMaintenanceTask(({ task }) => set((state) => ({
      tasks: upsert(state.tasks, task),
    })))
    try { set({ tasks: await listMaintenanceTasks(), initialized: true, error: null }) }
    catch (error) { set({ initialized: true, error: error instanceof Error ? error.message : String(error) }) }
  },
  requestOpen: (openRequest) => set({ openRequest, contextSelection: openRequest }),
  clearOpenRequest: () => set({ openRequest: null }),
  loadAudits: async (blueprintId, taskId) => {
    try {
      const records = await listMaintenanceAudits({ blueprintId, taskId })
      set((state) => ({ audits: { ...state.audits, [blueprintId]: records }, error: null }))
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  },
  start: async (input) => {
    try {
      const task = await startMaintenanceTask(input)
      set((state) => ({ tasks: upsert(state.tasks, task), error: null }))
      return task
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); return null }
  },
  apply: async (input) => {
    try {
      const result = await applyMaintenanceChangeSet(input)
      set((state) => ({ tasks: upsert(state.tasks, result.task), error: null }))
      await Promise.all([get().loadAudits(result.task.blueprintId), refreshComposedView()])
      return true
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); return false }
  },
  cancel: async (taskId) => {
    try { const task = await cancelMaintenanceTask(taskId); set((state) => ({ tasks: upsert(state.tasks, task), error: null })) }
    catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  },
  complete: async (taskId) => {
    try { const task = await completeMaintenanceTask(taskId); set((state) => ({ tasks: upsert(state.tasks, task), error: null })) }
    catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  },
  dismiss: async (input) => {
    try {
      const task = await dismissMaintenanceProposal(input)
      set((state) => ({ tasks: upsert(state.tasks, task), error: null }))
      return true
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); return false }
  },
  prepareUndo: async (blueprintId, auditId) => {
    const request = ++undoRequest
    try {
      const pendingUndo = await prepareMaintenanceUndo({ blueprintId, auditId })
      if (request !== undoRequest) return false
      if (pendingUndo.changeSet.blueprintId !== blueprintId) throw new Error('Undo checkout mismatch')
      set({ pendingUndo, error: null })
      return true
    } catch (error) { if (request === undoRequest) set({ error: error instanceof Error ? error.message : String(error) }); return false }
  },
  clearPendingUndo: () => { ++undoRequest; set({ pendingUndo: null }) },
  applyUndo: async (input) => {
    try {
      const pending = get().pendingUndo
      if (pending?.changeSet.blueprintId !== input.blueprintId || pending.changeSet.id !== input.undoChangeSetId) throw new Error('Undo checkout mismatch')
      const result = await applyMaintenanceUndo(input)
      if (get().pendingUndo === pending) get().clearPendingUndo()
      set({ error: null })
      await Promise.all([get().loadAudits(input.blueprintId), refreshComposedView()])
      return !!result.appliedOperationIds.length
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); return false }
  },
}))
