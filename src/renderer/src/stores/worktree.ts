import { create } from 'zustand'
import type { RepoIdentity, WorktreeInfo, WorktreeStatus } from '../../../shared/ipc/worktree'

interface WorktreeUiState {
  expandedSessionId?: string | null
  expandedCheckpointId?: string | null
}

/**
 * Stable empty refs for selectors: inline `?? []` fallbacks allocate per
 * snapshot and drive infinite re-renders (black screen via update-depth
 * crash). Always fall back to these.
 */
export const EMPTY_WORKTREE_LIST: WorktreeInfo[] = []
export const EMPTY_STRING_LIST: string[] = []
export const EMPTY_PENDING_LIST: PendingCreation[] = []

export interface PendingCreation {
  id: string
  name: string
  branch?: string
  startFrom?: string
  linkedIssue?: string
  error?: string
}

interface WorktreeStore {
  worktreesByWorkspace: Record<string, WorktreeInfo[]>
  identities: Record<string, RepoIdentity | null>
  avatars: Record<string, string>
  activePaths: Record<string, string>
  uiByPath: Record<string, WorktreeUiState>
  preservedBranches: Record<string, string[]>
  pendingCreations: Record<string, PendingCreation[]>
  expandRequests: Record<string, number>

  fetchWorktrees: (workspaceId: string, workspacePath: string) => Promise<void>
  fetchIdentity: (workspacePath: string) => Promise<void>
  setActivePath: (workspaceId: string, path: string) => void
  activePath: (workspaceId: string | null, fallbackPath?: string) => string | null
  uiForPath: (path: string) => WorktreeUiState
  setUiForPath: (path: string, patch: Partial<WorktreeUiState>) => void
  createWorktree: (
    workspaceId: string,
    workspacePath: string,
    input: { name: string; branch?: string; startFrom?: string; linkedIssue?: string },
  ) => Promise<{ shared: string[]; copied: string[]; path: string }>
  retryCreation: (workspaceId: string, workspacePath: string, pendingId: string) => Promise<void>
  cancelCreation: (workspaceId: string, workspacePath: string, pendingId: string) => Promise<void>
  deleteWorktree: (
    workspaceId: string,
    workspacePath: string,
    worktreePath: string,
    force?: boolean,
  ) => Promise<{ branchKept?: string }>
  deleteBranch: (workspaceId: string, workspacePath: string, branch: string, force?: boolean) => Promise<void>
  worktreeStatus: (worktreePath: string) => Promise<WorktreeStatus>
  clearWorkspace: (workspaceId: string) => void
}

export const useWorktreeStore = create<WorktreeStore>((set, get) => ({
  worktreesByWorkspace: {},
  identities: {},
  avatars: {},
  activePaths: {},
  uiByPath: {},
  preservedBranches: {},
  pendingCreations: {},
  expandRequests: {},

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

  createWorktree: async (workspaceId, workspacePath, input) => {
    const creationId = crypto.randomUUID()
    const pending: PendingCreation = {
      id: creationId,
      name: input.name,
      ...(input.branch ? { branch: input.branch } : {}),
      ...(input.startFrom ? { startFrom: input.startFrom } : {}),
      ...(input.linkedIssue ? { linkedIssue: input.linkedIssue } : {}),
    }
    set((state) => ({
      pendingCreations: {
        ...state.pendingCreations,
        [workspaceId]: [...(state.pendingCreations[workspaceId] ?? []), pending],
      },
      expandRequests: { ...state.expandRequests, [workspaceId]: (state.expandRequests[workspaceId] ?? 0) + 1 },
    }))
    try {
      const result = await window.electron.worktree.create({ workspaceId, workspacePath, creationId, ...input })
      const worktrees = await window.electron.worktree.list(workspaceId, workspacePath).catch(() => [])
      set((state) => ({
        worktreesByWorkspace: { ...state.worktreesByWorkspace, [workspaceId]: worktrees },
        activePaths: { ...state.activePaths, [workspaceId]: result.worktree.path },
        pendingCreations: {
          ...state.pendingCreations,
          [workspaceId]: (state.pendingCreations[workspaceId] ?? []).filter((p) => p.id !== creationId),
        },
      }))
      return { shared: result.shared, copied: result.copied, path: result.worktree.path }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set((state) => ({
        pendingCreations: {
          ...state.pendingCreations,
          [workspaceId]: (state.pendingCreations[workspaceId] ?? []).map((p) =>
            p.id === creationId ? { ...p, error: message } : p,
          ),
        },
      }))
      throw err
    }
  },

  retryCreation: async (workspaceId, workspacePath, pendingId) => {
    const pending = get().pendingCreations[workspaceId]?.find((p) => p.id === pendingId)
    if (!pending) return
    set((state) => ({
      pendingCreations: {
        ...state.pendingCreations,
        [workspaceId]: (state.pendingCreations[workspaceId] ?? []).map((p) =>
          p.id === pendingId ? { ...p, error: undefined } : p,
        ),
      },
    }))
    try {
      const result = await window.electron.worktree.create({
        workspaceId,
        workspacePath,
        creationId: pending.id,
        name: pending.name,
        branch: pending.branch,
        startFrom: pending.startFrom,
        linkedIssue: pending.linkedIssue,
      })
      const worktrees = await window.electron.worktree.list(workspaceId, workspacePath).catch(() => [])
      set((state) => ({
        worktreesByWorkspace: { ...state.worktreesByWorkspace, [workspaceId]: worktrees },
        activePaths: { ...state.activePaths, [workspaceId]: result.worktree.path },
        pendingCreations: {
          ...state.pendingCreations,
          [workspaceId]: (state.pendingCreations[workspaceId] ?? []).filter((p) => p.id !== pendingId),
        },
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set((state) => ({
        pendingCreations: {
          ...state.pendingCreations,
          [workspaceId]: (state.pendingCreations[workspaceId] ?? []).map((p) =>
            p.id === pendingId ? { ...p, error: message } : p,
          ),
        },
      }))
    }
  },

  cancelCreation: async (workspaceId, workspacePath, pendingId) => {
    try {
      await window.electron.worktree.cancelCreate(pendingId, workspacePath)
    } catch {
      // Already finished or never started; dropping the row is still correct.
    }
    const worktrees = await window.electron.worktree.list(workspaceId, workspacePath).catch(() => [])
    set((state) => ({
      worktreesByWorkspace: { ...state.worktreesByWorkspace, [workspaceId]: worktrees },
      pendingCreations: {
        ...state.pendingCreations,
        [workspaceId]: (state.pendingCreations[workspaceId] ?? []).filter((p) => p.id !== pendingId),
      },
    }))
  },

  deleteWorktree: async (workspaceId, workspacePath, worktreePath, force) => {
    const result = await window.electron.worktree.delete({ workspacePath, worktreePath, force })
    const worktrees = await window.electron.worktree.list(workspaceId, workspacePath).catch(() => [])
    set((state) => ({
      worktreesByWorkspace: { ...state.worktreesByWorkspace, [workspaceId]: worktrees },
      activePaths:
        state.activePaths[workspaceId] === worktreePath
          ? { ...state.activePaths, [workspaceId]: workspacePath }
          : state.activePaths,
      preservedBranches: result.branchKept
        ? {
            ...state.preservedBranches,
            [workspaceId]: [...(state.preservedBranches[workspaceId] ?? []).filter((b) => b !== result.branchKept), result.branchKept],
          }
        : state.preservedBranches,
    }))
    return { branchKept: result.branchKept }
  },

  deleteBranch: async (workspaceId, workspacePath, branch, force) => {
    await window.electron.worktree.deleteBranch(workspacePath, branch, force)
    set((state) => ({
      preservedBranches: {
        ...state.preservedBranches,
        [workspaceId]: (state.preservedBranches[workspaceId] ?? []).filter((b) => b !== branch),
      },
    }))
  },

  worktreeStatus: async (worktreePath) => {
    return window.electron.worktree.status(worktreePath)
  },

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
