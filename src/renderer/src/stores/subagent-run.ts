import { create } from 'zustand'
import type {
  SubAgentRun,
  SubAgentRunRemovedEvent,
  SubAgentRunUpdatedEvent,
} from '../../../shared/subAgentRun'

interface SubAgentRunStore {
  runs: SubAgentRun[]
  loading: boolean
  error: string | null
  fetchRuns: () => Promise<void>
  upsertRun: (run: SubAgentRun) => void
  removeRun: (id: string) => void
  subscribeToEvents: () => () => void
}

function sortRuns(runs: SubAgentRun[]): SubAgentRun[] {
  const priority: Record<SubAgentRun['status'], number> = {
    'waiting-approval': 0,
    failed: 1,
    running: 2,
    queued: 3,
    cancelled: 4,
    done: 5,
  }

  return [...runs].sort((a, b) => {
    const statusDelta = priority[a.status] - priority[b.status]
    if (statusDelta !== 0) return statusDelta
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export const useSubAgentRunStore = create<SubAgentRunStore>((set, get) => ({
  runs: [],
  loading: false,
  error: null,

  fetchRuns: async () => {
    set({ loading: true, error: null })
    try {
      const runs = (await window.electron.invoke('subagent-run:list')) as SubAgentRun[]
      set({ runs: sortRuns(runs), loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  upsertRun: (run) => {
    set((state) => {
      const existing = state.runs.some((item) => item.id === run.id)
      const runs = existing
        ? state.runs.map((item) => (item.id === run.id ? run : item))
        : [...state.runs, run]
      return { runs: sortRuns(runs) }
    })
  },

  removeRun: (id) => {
    set((state) => ({ runs: state.runs.filter((run) => run.id !== id) }))
  },

  subscribeToEvents: () => {
    const unsubscribeUpdated = window.electron.on('subagent-run:updated', (payload: unknown) => {
      const event = payload as SubAgentRunUpdatedEvent
      if (event.run) get().upsertRun(event.run)
    })
    const unsubscribeRemoved = window.electron.on('subagent-run:removed', (payload: unknown) => {
      const event = payload as SubAgentRunRemovedEvent
      if (event.id) get().removeRun(event.id)
    })

    return () => {
      unsubscribeUpdated()
      unsubscribeRemoved()
    }
  },
}))
