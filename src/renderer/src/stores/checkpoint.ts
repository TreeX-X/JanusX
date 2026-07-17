import { create } from 'zustand'
import { useWorkspaceStore } from './workspace'
import type { CheckpointConflict as ConflictInfo, CheckpointSummary } from '../../../shared/ipc/checkpoint'

export type { CheckpointSummary, ConflictInfo }

interface CheckpointStore {
  workspaceCwd: string | null
  checkpoints: CheckpointSummary[]
  selectedCheckpoint: CheckpointSummary | null
  diffs: Record<string, string>
  conflicts: ConflictInfo[]
  loading: boolean
  error: string | null

  fetchCheckpoints: (filter?: { terminalId?: string; engine?: string; cwd?: string }) => Promise<void>
  createCheckpoint: (options: { terminalId: string; engine: string; prompt: string; cwd: string }) => Promise<void>
  restoreCheckpoint: (checkpointId: string, cwd: string) => Promise<void>
  fetchDiff: (checkpointId: string, filePath: string, cwd: string) => Promise<void>
  fetchAllDiffs: (checkpointId: string, cwd: string) => Promise<void>
  deleteCheckpoint: (checkpointId: string, cwd?: string) => Promise<void>
  clearWorkspaceScope: () => void
  setSelected: (checkpoint: CheckpointSummary | null) => void
  clearConflicts: () => void
  subscribeToEvents: () => () => void
}

export const useCheckpointStore = create<CheckpointStore>((set, get) => ({
  workspaceCwd: null,
  checkpoints: [],
  selectedCheckpoint: null,
  diffs: {},
  conflicts: [],
  loading: false,
  error: null,

  fetchCheckpoints: async (filter) => {
    const cwd = filter?.cwd?.trim() || null
    if (!cwd) {
      set({
        workspaceCwd: null,
        checkpoints: [],
        selectedCheckpoint: null,
        diffs: {},
        conflicts: [],
        loading: false,
        error: null,
      })
      return
    }

    const previousCwd = get().workspaceCwd
    set({
      workspaceCwd: cwd,
      loading: true,
      error: null,
      ...(previousCwd !== cwd
        ? {
            checkpoints: [],
            selectedCheckpoint: null,
            diffs: {},
            conflicts: [],
          }
        : {}),
    })
    try {
      const cps = await window.electron.checkpoint.list({ ...filter, cwd })
      if (get().workspaceCwd !== cwd) return
      set({ checkpoints: cps, loading: false })
    } catch (err) {
      if (get().workspaceCwd === cwd) {
        set({ error: (err as Error).message, loading: false })
      }
    }
  },

  createCheckpoint: async (options) => {
    const cwd = options.cwd.trim()
    if (!cwd) return

    set({ loading: true, error: null })
    try {
      const cp = await window.electron.checkpoint.create({ ...options, cwd })
      set((state) => ({
        workspaceCwd: cwd,
        checkpoints: state.workspaceCwd && state.workspaceCwd !== cwd ? [cp] : [cp, ...state.checkpoints],
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  restoreCheckpoint: async (checkpointId, cwd) => {
    set({ loading: true, error: null, conflicts: [] })
    try {
      const result = await window.electron.checkpoint.restore(checkpointId, cwd)
      set({ loading: false, conflicts: result.conflicts })
      await get().fetchCheckpoints({ cwd })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  fetchDiff: async (checkpointId, filePath, cwd) => {
    try {
      const diff = await window.electron.checkpoint.diff(checkpointId, filePath, cwd)
      set((state) => ({
        diffs: { ...state.diffs, [`${checkpointId}:${filePath}`]: diff },
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  fetchAllDiffs: async (checkpointId, cwd) => {
    try {
      const diff = await window.electron.checkpoint.diffAll(checkpointId, cwd)
      set((state) => ({
        diffs: { ...state.diffs, [`${checkpointId}:`]: diff },
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  deleteCheckpoint: async (checkpointId, cwd) => {
    try {
      await window.electron.checkpoint.delete(checkpointId, cwd)
      set((state) => ({
        checkpoints: state.checkpoints.filter((cp) => cp.id !== checkpointId),
        selectedCheckpoint:
          state.selectedCheckpoint?.id === checkpointId ? null : state.selectedCheckpoint,
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  clearWorkspaceScope: () =>
    set({
      workspaceCwd: null,
      checkpoints: [],
      selectedCheckpoint: null,
      diffs: {},
      conflicts: [],
      loading: false,
      error: null,
    }),

  setSelected: (checkpoint) => set({ selectedCheckpoint: checkpoint }),
  clearConflicts: () => set({ conflicts: [] }),

  subscribeToEvents: () => {
    const unsub = window.electron.checkpoint.onEvent((event) => {
      if (event.type === 'error') {
        set({ error: event.error ?? 'Checkpoint event failed' })
        return
      }
      const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState()
      const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
      if (!activeWorkspace?.path) {
        get().clearWorkspaceScope()
        return
      }

      get().fetchCheckpoints({ cwd: activeWorkspace.path })
    })
    return unsub
  },
}))
