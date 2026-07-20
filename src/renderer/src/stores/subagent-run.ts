import { create } from 'zustand'
import type {
  SubAgentRun,
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

/*-- 终态 run 展示上限：与主进程 registry 对齐，超出时裁剪最旧终态条目，活跃 run 不受影响 --*/
const MAX_TERMINAL_RUNS = 200
const TERMINAL_STATUSES: ReadonlySet<SubAgentRun['status']> = new Set(['done', 'failed', 'cancelled'])

function capTerminalRuns(runs: SubAgentRun[]): SubAgentRun[] {
  const terminal = runs.filter((run) => TERMINAL_STATUSES.has(run.status))
  if (terminal.length <= MAX_TERMINAL_RUNS) return runs
  const removable = new Set(
    [...terminal]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, terminal.length - MAX_TERMINAL_RUNS)
      .map((run) => run.id),
  )
  return runs.filter((run) => !removable.has(run.id))
}

export const useSubAgentRunStore = create<SubAgentRunStore>((set, get) => ({
  runs: [],
  loading: false,
  error: null,

  fetchRuns: async () => {
    set({ loading: true, error: null })
    try {
      const runs = await window.electron.subAgentRun.list()
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
      return { runs: capTerminalRuns(sortRuns(runs)) }
    })
  },

  removeRun: (id) => {
    set((state) => ({ runs: state.runs.filter((run) => run.id !== id) }))
  },

  subscribeToEvents: () => {
    const unsubscribeUpdated = window.electron.subAgentRun.onUpdated((event) => {
      if (event.run) get().upsertRun(event.run)
    })
    const unsubscribeRemoved = window.electron.subAgentRun.onRemoved((event) => {
      if (event.id) get().removeRun(event.id)
    })

    return () => {
      unsubscribeUpdated()
      unsubscribeRemoved()
    }
  },
}))
