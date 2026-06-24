import { create } from 'zustand'

export interface CheckpointSummary {
  id: string
  terminalId: string
  engine: string
  conversationIndex: number
  createdAt: string
  branch: string
  prompt: string
  fileCount: number
  changedFileCount: number
  status: 'ready'
}

export interface ConflictInfo {
  filePath: string
  resolution: 'snapshot'
}

interface CheckpointStore {
  checkpoints: CheckpointSummary[]
  selectedCheckpoint: CheckpointSummary | null
  diffs: Record<string, string>
  conflicts: ConflictInfo[]
  loading: boolean
  error: string | null

  fetchCheckpoints: (filter?: { terminalId?: string; engine?: string }) => Promise<void>
  createCheckpoint: (options: { terminalId: string; engine: string; prompt: string; cwd: string }) => Promise<void>
  restoreCheckpoint: (checkpointId: string, cwd: string) => Promise<void>
  fetchDiff: (checkpointId: string, filePath: string, cwd: string) => Promise<void>
  fetchAllDiffs: (checkpointId: string, cwd: string) => Promise<void>
  deleteCheckpoint: (checkpointId: string) => Promise<void>
  setSelected: (checkpoint: CheckpointSummary | null) => void
  clearConflicts: () => void
  subscribeToEvents: () => () => void
}

export const useCheckpointStore = create<CheckpointStore>((set, get) => ({
  checkpoints: [],
  selectedCheckpoint: null,
  diffs: {},
  conflicts: [],
  loading: false,
  error: null,

  fetchCheckpoints: async (filter) => {
    set({ loading: true, error: null })
    try {
      const cps = (await window.electron.invoke('checkpoint:list', filter)) as CheckpointSummary[]
      set({ checkpoints: cps, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createCheckpoint: async (options) => {
    set({ loading: true, error: null })
    try {
      const cp = (await window.electron.invoke('checkpoint:create', options)) as CheckpointSummary
      set((state) => ({
        checkpoints: [cp, ...state.checkpoints],
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  restoreCheckpoint: async (checkpointId, cwd) => {
    set({ loading: true, error: null, conflicts: [] })
    try {
      const result = (await window.electron.invoke('checkpoint:restore', {
        checkpointId,
        cwd,
      })) as { conflicts: ConflictInfo[] }
      set({ loading: false, conflicts: result.conflicts })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  fetchDiff: async (checkpointId, filePath, cwd) => {
    try {
      const diff = (await window.electron.invoke('checkpoint:diff', {
        checkpointId,
        filePath,
        cwd,
      })) as string
      set((state) => ({
        diffs: { ...state.diffs, [`${checkpointId}:${filePath}`]: diff },
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  fetchAllDiffs: async (checkpointId, cwd) => {
    try {
      const diff = (await window.electron.invoke('checkpoint:diff:all', {
        checkpointId,
        cwd,
      })) as string
      set((state) => ({
        diffs: { ...state.diffs, [`${checkpointId}:`]: diff },
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  deleteCheckpoint: async (checkpointId) => {
    try {
      await window.electron.invoke('checkpoint:delete', { checkpointId })
      set((state) => ({
        checkpoints: state.checkpoints.filter((cp) => cp.id !== checkpointId),
        selectedCheckpoint:
          state.selectedCheckpoint?.id === checkpointId ? null : state.selectedCheckpoint,
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  setSelected: (checkpoint) => set({ selectedCheckpoint: checkpoint }),
  clearConflicts: () => set({ conflicts: [] }),

  subscribeToEvents: () => {
    const unsub = window.electron.on('checkpoint:event', () => {
      const state = get()
      state.fetchCheckpoints()
    })
    return unsub
  },
}))
