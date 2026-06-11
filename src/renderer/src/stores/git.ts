import { create } from 'zustand'
import type { GitStatus, GitCommit } from '@/types'

interface GitStore {
  status: GitStatus | null
  commits: GitCommit[]
  loading: boolean
  error: string | null

  fetchStatus: (cwd: string) => Promise<void>
  fetchLog: (cwd: string, maxCount?: number) => Promise<void>
  stageFiles: (cwd: string, paths: string[]) => Promise<void>
  unstageFiles: (cwd: string, paths: string[]) => Promise<void>
  commitChanges: (cwd: string, message: string) => Promise<void>
  pushChanges: (cwd: string) => Promise<void>
  pullChanges: (cwd: string) => Promise<void>
}

export const useGitStore = create<GitStore>((set, get) => ({
  status: null,
  commits: [],
  loading: false,
  error: null,

  fetchStatus: async (cwd) => {
    set({ loading: true, error: null })
    try {
      const status = await window.electron.invoke('git:status', cwd)
      set({ status: status as GitStatus, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  fetchLog: async (cwd, maxCount) => {
    try {
      const commits = await window.electron.invoke('git:log', cwd, maxCount)
      set({ commits: commits as GitCommit[] })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  stageFiles: async (cwd, paths) => {
    set({ loading: true, error: null })
    try {
      const status = await window.electron.invoke('git:stage', cwd, paths)
      set({ status: status as GitStatus, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  unstageFiles: async (cwd, paths) => {
    set({ loading: true, error: null })
    try {
      const status = await window.electron.invoke('git:unstage', cwd, paths)
      set({ status: status as GitStatus, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  commitChanges: async (cwd, message) => {
    set({ loading: true, error: null })
    try {
      const status = await window.electron.invoke('git:commit', cwd, message)
      set({ status: status as GitStatus, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  pushChanges: async (cwd) => {
    set({ loading: true, error: null })
    try {
      await window.electron.invoke('git:push', cwd)
      const status = await window.electron.invoke('git:status', cwd)
      set({ status: status as GitStatus, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  pullChanges: async (cwd) => {
    set({ loading: true, error: null })
    try {
      await window.electron.invoke('git:pull', cwd)
      const status = await window.electron.invoke('git:status', cwd)
      set({ status: status as GitStatus, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },
}))
