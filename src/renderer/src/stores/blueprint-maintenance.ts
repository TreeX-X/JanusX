import { create } from 'zustand'
import {
  applyMaintenanceChangeSet,
  applyMaintenanceUndo,
  cancelMaintenanceTask,
  completeMaintenanceTask,
  generateMaintenanceProposal,
  listMaintenanceAudits,
  listMaintenanceTasks,
  onMaintenanceTask,
  prepareMaintenanceUndo,
  sendMaintenanceMessage,
  startMaintenanceTask,
  type BlueprintMaintenanceApplyInput,
  type BlueprintMaintenanceAuditRecord,
  type BlueprintMaintenanceMessageInput,
  type BlueprintMaintenanceProposalInput,
  type BlueprintMaintenanceStartInput,
  type BlueprintMaintenanceTask,
  type BlueprintMaintenanceUndoApplyInput,
  type BlueprintMaintenanceUndoPrepareResult,
} from '@/services/blueprint'

type MaintenanceOpenRequest = { blueprintId: string; nodeId?: string } | null

interface BlueprintMaintenanceStore {
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
  message: (input: BlueprintMaintenanceMessageInput) => Promise<void>
  propose: (input: BlueprintMaintenanceProposalInput) => Promise<void>
  apply: (input: BlueprintMaintenanceApplyInput) => Promise<boolean>
  cancel: (taskId: string) => Promise<void>
  complete: (taskId: string) => Promise<void>
  prepareUndo: (blueprintId: string, auditId: string) => Promise<boolean>
  clearPendingUndo: () => void
  applyUndo: (input: BlueprintMaintenanceUndoApplyInput) => Promise<boolean>
}

function upsert(tasks: BlueprintMaintenanceTask[], task: BlueprintMaintenanceTask): BlueprintMaintenanceTask[] {
  return [task, ...tasks.filter((item) => item.id !== task.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

let unsubscribe: (() => void) | null = null

export const useBlueprintMaintenanceStore = create<BlueprintMaintenanceStore>((set) => ({
  tasks: [], audits: {}, pendingUndo: null, openRequest: null, initialized: false, error: null,
  initialize: async () => {
    if (!unsubscribe) unsubscribe = onMaintenanceTask(({ task }) => set((state) => ({ tasks: upsert(state.tasks, task) })))
    try { set({ tasks: await listMaintenanceTasks(), initialized: true, error: null }) }
    catch (error) { set({ initialized: true, error: error instanceof Error ? error.message : String(error) }) }
  },
  requestOpen: (openRequest) => set({ openRequest }),
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
  message: async (input) => {
    try { const task = await sendMaintenanceMessage(input); set((state) => ({ tasks: upsert(state.tasks, task), error: null })) }
    catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  },
  propose: async (input) => {
    try { const task = await generateMaintenanceProposal(input); set((state) => ({ tasks: upsert(state.tasks, task), error: null })) }
    catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  },
  apply: async (input) => {
    try {
      const result = await applyMaintenanceChangeSet(input)
      set((state) => ({ tasks: upsert(state.tasks, result.task), error: null }))
      const records = await listMaintenanceAudits({ blueprintId: result.task.blueprintId }).catch(() => null)
      if (records) set((state) => ({ audits: { ...state.audits, [result.task.blueprintId]: records } }))
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
  prepareUndo: async (blueprintId, auditId) => {
    try {
      const pendingUndo = await prepareMaintenanceUndo({ blueprintId, auditId })
      set({ pendingUndo, error: null })
      return true
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error), pendingUndo: null }); return false }
  },
  clearPendingUndo: () => set({ pendingUndo: null }),
  applyUndo: async (input) => {
    try {
      const result = await applyMaintenanceUndo(input)
      set({ pendingUndo: null, error: null })
      const records = await listMaintenanceAudits({ blueprintId: input.blueprintId }).catch(() => null)
      if (records) set((state) => ({ audits: { ...state.audits, [input.blueprintId]: records } }))
      return !!result.appliedOperationIds.length
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); return false }
  },
}))
