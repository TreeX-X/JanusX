import { create } from 'zustand'
import type { RepoIdentity, WorktreeInfo } from '../../../shared/ipc/worktree'

interface WorktreeUiState {
  expandedSessionId?: string | null
  expandedCheckpointId?: string | null
}

interface WorktreeStore {
  worktreesByWorkspace: Record<string, WorktreeInfo[]>
  identities: Record<string, RepoIdentity | null>
  avatars: Record<string, string>
  activePaths: Record<string, string>
  uiByPath: Record<string, WorktreeUiState>

  fetchWorktrees: (workspaceId: string, workspacePath: string) => Promise<void>
  fetchIdentity: (workspacePath: string) => Promise<void>
  setActivePath: (workspaceId: string, path: string) => void
  activePath: (workspaceId: string | null, fallbackPath?: string) => string | null
  uiForPath: (path: string) => WorktreeUiState
  setUiForPath: (path: string, patch: Partial<WorktreeUiState>) => void
  clearWorkspace: (workspaceId: string) => void
}

export const useWorktreeStore = create<WorktreeStore>((set, get) => ({
  worktreesByWorkspace: {},
  identities: {},
  avatars: {},
  activePaths: {},
  uiByPath: {},

  fetchWorktrees: async (workspaceId, workspacePath) => {
    try {
      const worktrees = await window.electron.worktree.list(workspaceId, workspacePath)
      set((state) => ({
        worktreesByWorkspace: { ...state.worktreesByWorkspace, [workspaceId]: worktrees },
        activePaths: state.activePaths[workspaceId]
          ? state.activePaths
          : { ...state.activePaths, [workspaceId]: workspacePath },
      }))
    } catch {
      // Non-git checkouts simply have no linked worktrees.
    }
  },

  fetchIdentity: async (workspacePath) => {
    if (workspacePath in get().identities) return
    try {
      const identity = await window.electron.worktree.identity(workspacePath)
      set((state) => ({
        identities: { ...state.identities, [workspacePath]: identity },
      }))
      if (identity?.avatarUrl && !(workspacePath in get().avatars)) {
        try {
          const avatar = await window.electron.worktree.avatar(workspacePath)
          if (avatar.dataUrl) {
            set((state) => ({
              avatars: { ...state.avatars, [workspacePath]: avatar.dataUrl as string },
            }))
          }
        } catch {
          // Letter fallback stays.
        }
      }
    } catch {
      set((state) => ({
        identities: { ...state.identities, [workspacePath]: null },
      }))
    }
  },

  setActivePath: (workspaceId, path) =>
    set((state) => ({
      activePaths: { ...state.activePaths, [workspaceId]: path },
    })),

  activePath: (workspaceId, fallbackPath) => {
    if (!workspaceId) return fallbackPath ?? null
    return get().activePaths[workspaceId] ?? fallbackPath ?? null
  },

  uiForPath: (path) => get().uiByPath[path] ?? {},

  setUiForPath: (path, patch) =>
    set((state) => ({
      uiByPath: { ...state.uiByPath, [path]: { ...state.uiByPath[path], ...patch } },
    })),

  clearWorkspace: (workspaceId) =>
    set((state) => {
      const worktreesByWorkspace = { ...state.worktreesByWorkspace }
      const activePaths = { ...state.activePaths }
      delete worktreesByWorkspace[workspaceId]
      delete activePaths[workspaceId]
      return { worktreesByWorkspace, activePaths }
    },
  ),
}))
