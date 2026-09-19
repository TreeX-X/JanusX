import { create } from 'zustand'
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
  type BlueprintMaintenanceToolTraceEntry,
  type BlueprintMaintenanceUndoApplyInput,
  type BlueprintMaintenanceUndoPrepareResult,
} from '@/services/blueprint'
import { appendReasoningDelta, emptyReasoning, type ReasoningSnapshot } from '@/components/janus/janusReasoning'

type MaintenanceOpenRequest = { blueprintId: string; nodeId?: string } | null

interface BlueprintMaintenanceStore {
  tasks: BlueprintMaintenanceTask[]
  audits: Record<string, BlueprintMaintenanceAuditRecord[]>
  pendingUndo: BlueprintMaintenanceUndoPrepareResult | null
  openRequest: MaintenanceOpenRequest
  initialized: boolean
  error: string | null
  /** Ephemeral agent stream state per task, mirroring janus-chat ThinkingRegion. */
  reasoning: Record<string, ReasoningSnapshot>
  toolTraces: Record<string, BlueprintMaintenanceToolTraceEntry[]>
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

export const useBlueprintMaintenanceStore = create<BlueprintMaintenanceStore>((set) => ({
  tasks: [], audits: {}, pendingUndo: null, openRequest: null, initialized: false, error: null,
  reasoning: {}, toolTraces: {},
  initialize: async () => {
    if (!unsubscribe) unsubscribe = onMaintenanceTask(({ task, agentEvent, toolTrace }) => set((state) => {
      const next: Partial<BlueprintMaintenanceStore> = { tasks: upsert(state.tasks, task) }
      if (toolTrace) next.toolTraces = { ...state.toolTraces, [toolTrace.taskId]: toolTrace.entries }
      if (agentEvent?.type === 'reasoning_delta') {
        const current = state.reasoning[agentEvent.taskId] ?? emptyReasoning()
        next.reasoning = { ...state.reasoning, [agentEvent.taskId]: appendReasoningDelta(current, agentEvent.delta) }
      }
      if (agentEvent?.type === 'agent_start') {
        next.reasoning = { ...state.reasoning, [agentEvent.taskId]: emptyReasoning() }
      }
      return next
    }))
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
  dismiss: async (input) => {
    try {
      const task = await dismissMaintenanceProposal(input)
      set((state) => ({ tasks: upsert(state.tasks, task), error: null }))
      return true
    } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); return false }
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
