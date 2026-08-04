import { create } from 'zustand'
import {
  applyMaintenanceChangeSet,
  cancelMaintenanceTask,
  completeMaintenanceTask,
  generateMaintenanceProposal,
  listMaintenanceTasks,
  onMaintenanceTask,
  sendMaintenanceMessage,
  startMaintenanceTask,
  type BlueprintMaintenanceApplyInput,
  type BlueprintMaintenanceMessageInput,
  type BlueprintMaintenanceProposalInput,
  type BlueprintMaintenanceStartInput,
  type BlueprintMaintenanceTask,
} from '@/services/blueprint'

type MaintenanceOpenRequest = { blueprintId: string; nodeId?: string } | null

interface BlueprintMaintenanceStore {
  tasks: BlueprintMaintenanceTask[]
  openRequest: MaintenanceOpenRequest
  initialized: boolean
  error: string | null
  initialize: () => Promise<void>
  requestOpen: (request: Exclude<MaintenanceOpenRequest, null>) => void
  clearOpenRequest: () => void
  start: (input: BlueprintMaintenanceStartInput) => Promise<BlueprintMaintenanceTask | null>
  message: (input: BlueprintMaintenanceMessageInput) => Promise<void>
  propose: (input: BlueprintMaintenanceProposalInput) => Promise<void>
  apply: (input: BlueprintMaintenanceApplyInput) => Promise<boolean>
  cancel: (taskId: string) => Promise<void>
  complete: (taskId: string) => Promise<void>
}

function upsert(tasks: BlueprintMaintenanceTask[], task: BlueprintMaintenanceTask): BlueprintMaintenanceTask[] {
  return [task, ...tasks.filter((item) => item.id !== task.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

let unsubscribe: (() => void) | null = null

export const useBlueprintMaintenanceStore = create<BlueprintMaintenanceStore>((set) => ({
  tasks: [], openRequest: null, initialized: false, error: null,
  initialize: async () => {
    if (!unsubscribe) unsubscribe = onMaintenanceTask(({ task }) => set((state) => ({ tasks: upsert(state.tasks, task) })))
    try { set({ tasks: await listMaintenanceTasks(), initialized: true, error: null }) }
    catch (error) { set({ initialized: true, error: error instanceof Error ? error.message : String(error) }) }
  },
  requestOpen: (openRequest) => set({ openRequest }),
  clearOpenRequest: () => set({ openRequest: null }),
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
}))
