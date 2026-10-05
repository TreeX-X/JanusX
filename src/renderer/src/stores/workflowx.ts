import { create } from 'zustand'
import type { WorkflowXSnapshot } from '../../../shared/ipc/workflowx'

interface WorkflowXState {
  workspaceId: string | null
  snapshot: WorkflowXSnapshot | null
  checking: boolean
  check: (workspaceId: string | null, refresh?: boolean) => Promise<void>
  invalidate: () => void
}

let generation = 0
export const useWorkflowXStore = create<WorkflowXState>((set, get) => ({
  workspaceId: null,
  snapshot: null,
  checking: false,
  invalidate: () => { generation++; set({ checking: false }) },
  check: async (workspaceId, refresh = false) => {
    if (get().checking && get().workspaceId === workspaceId && !refresh) return
    const request = ++generation
    set(state => ({ workspaceId, checking: true, snapshot: state.workspaceId === workspaceId ? state.snapshot : null }))
    try {
      const snapshot = await window.electron.workflowx.detect(workspaceId, refresh)
      if (request === generation && snapshot.workspaceId === workspaceId) set({ snapshot, checking: false })
      else if (request === generation) throw new Error('Workspace changed')
    } catch {
      if (request === generation) set({ checking: false, snapshot: {
        workspaceId, status: 'uncertain', sources: [], checkedAt: Date.now(), unavailable: true,
      } })
    }
  },
}))
