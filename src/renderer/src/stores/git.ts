import { create } from 'zustand'
import type { GitStatus, GitCommit } from '@/types'
import type { GitCommitChange } from '../../../shared/ipc/git'

interface GitStore {
  status: GitStatus | null
  statusCwd: string | null
  commits: GitCommit[]
  loading: boolean
  error: string | null

  fetchStatus: (cwd: string) => Promise<void>
  fetchLog: (cwd: string, maxCount?: number) => Promise<void>
  stageFiles: (cwd: string, paths: string[]) => Promise<void>
  unstageFiles: (cwd: string, paths: string[]) => Promise<void>
  commitChanges: (cwd: string, message: string) => Promise<boolean>
  pushChanges: (cwd: string) => Promise<boolean>
  pullChanges: (cwd: string) => Promise<boolean>
  discardChange: (cwd: string, path: string) => Promise<boolean>
  commitChangesByHash: (cwd: string, hash: string) => Promise<GitCommitChange[]>
}

interface PendingStatusRefresh {
  promise: Promise<void>
  rerun: boolean
}

const pendingStatusRefreshes = new Map<string, PendingStatusRefresh>()

function normalizeCwd(cwd: string): string {
  const normalized = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:/.test(normalized) ? normalized.toLowerCase() : normalized
}

function supersedePendingRefresh(cwd: string): string {
  const statusCwd = normalizeCwd(cwd)
  const pending = pendingStatusRefreshes.get(statusCwd)
  if (pending) pending.rerun = true
  return statusCwd
}

export const useGitStore = create<GitStore>((set) => ({
  status: null,
  statusCwd: null,
  commits: [],
  loading: false,
  error: null,

  fetchStatus: async (cwd) => {
    const statusCwd = normalizeCwd(cwd)
    set((state) => ({
      status: state.statusCwd === statusCwd ? state.status : null,
      statusCwd,
      error: null,
    }))

    const pending = pendingStatusRefreshes.get(statusCwd)
    if (pending) {
      pending.rerun = true
      return pending.promise
    }

    const refresh: PendingStatusRefresh = { promise: Promise.resolve(), rerun: false }
    refresh.promise = (async () => {
      do {
        refresh.rerun = false
        try {
          const status = await window.electron.git.status(cwd)
          if (refresh.rerun) continue
          set((state) => state.statusCwd === statusCwd ? { status, error: null } : {})
        } catch (err: any) {
          if (refresh.rerun) continue
          set((state) => state.statusCwd === statusCwd ? { error: err.message } : {})
        }
      } while (refresh.rerun)
    })().finally(() => {
      if (pendingStatusRefreshes.get(statusCwd) === refresh) {
        pendingStatusRefreshes.delete(statusCwd)
      }
    })
    pendingStatusRefreshes.set(statusCwd, refresh)
    return refresh.promise
  },

  fetchLog: async (cwd, maxCount) => {
    try {
      const commits = await window.electron.git.log(cwd, maxCount)
      set({ commits })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  stageFiles: async (cwd, paths) => {
    set({ loading: true, error: null, statusCwd: normalizeCwd(cwd) })
    try {
      const status = await window.electron.git.stage(cwd, paths)
      const statusCwd = supersedePendingRefresh(cwd)
      set((state) => state.statusCwd === statusCwd ? { status, loading: false } : { loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  unstageFiles: async (cwd, paths) => {
    set({ loading: true, error: null, statusCwd: normalizeCwd(cwd) })
    try {
      const status = await window.electron.git.unstage(cwd, paths)
      const statusCwd = supersedePendingRefresh(cwd)
      set((state) => state.statusCwd === statusCwd ? { status, loading: false } : { loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  commitChanges: async (cwd, message) => {
    set({ loading: true, error: null, statusCwd: normalizeCwd(cwd) })
    try {
      const status = await window.electron.git.commit(cwd, message)
      const statusCwd = supersedePendingRefresh(cwd)
      set((state) => state.statusCwd === statusCwd ? { status, loading: false } : { loading: false })
      return true
    } catch (err: any) {
      set({ error: err.message, loading: false })
      return false
    }
  },

  pushChanges: async (cwd) => {
    set({ loading: true, error: null, statusCwd: normalizeCwd(cwd) })
    try {
      await window.electron.git.push(cwd)
      const status = await window.electron.git.status(cwd)
      const statusCwd = supersedePendingRefresh(cwd)
      set((state) => state.statusCwd === statusCwd ? { status, loading: false } : { loading: false })
      return true
    } catch (err: any) {
      set({ error: err.message, loading: false })
      return false
    }
  },

  pullChanges: async (cwd) => {
    set({ loading: true, error: null, statusCwd: normalizeCwd(cwd) })
    try {
      await window.electron.git.pull(cwd)
      const status = await window.electron.git.status(cwd)
      const statusCwd = supersedePendingRefresh(cwd)
      set((state) => state.statusCwd === statusCwd ? { status, loading: false } : { loading: false })
      return true
    } catch (err: any) {
      set({ error: err.message, loading: false })
      return false
    }
  },

  discardChange: async (cwd, path) => {
    set({ loading: true, error: null, statusCwd: normalizeCwd(cwd) })
    try {
      const status = await window.electron.git.discard(cwd, path)
      const statusCwd = supersedePendingRefresh(cwd)
      set((state) => state.statusCwd === statusCwd ? { status, loading: false } : { loading: false })
      return true
    } catch (err: any) {
      set({ error: err.message, loading: false })
      return false
    }
  },

  commitChangesByHash: async (cwd, hash) => {
    try { return await window.electron.git.commitChanges(cwd, hash) } catch (err: any) { set({ error: err.message }); return [] }
  },
}))
