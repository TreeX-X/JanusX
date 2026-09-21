import { create } from 'zustand'
import { useWorkspaceStore } from './workspace'
import type {
  AgentSessionDetail,
  AgentSessionSummary,
  SessionFilter,
} from '../../../shared/ipc/session'

export type { AgentSessionDetail, AgentSessionSummary }

interface SessionStore {
  scopeKey: string | null
  lastFilter: SessionFilter | null
  sessions: AgentSessionSummary[]
  selectedSession: AgentSessionDetail | null
  loading: boolean
  error: string | null

  fetchSessions: (filter?: SessionFilter) => Promise<void>
  fetchSessionDetail: (sessionId: string) => Promise<void>
  continueSession: (sessionId: string, engine?: string) => Promise<{ sessionId: string; terminalId: string } | null>
  clearWorkspaceScope: () => void
  setSelected: (session: AgentSessionDetail | null) => void
  subscribeToEvents: () => () => void
}

function activeWorkspaceId(): string | null {
  return useWorkspaceStore.getState().activeWorkspaceId
}

function scopeKeyFor(filter?: SessionFilter): string {
  if (filter?.workspaceId) return `ws:${filter.workspaceId}`
  if (filter?.cwd) return `cwd:${filter.cwd}`
  if (filter?.includeArchived) return 'archived'
  return 'all'
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  scopeKey: null,
  lastFilter: null,
  sessions: [],
  selectedSession: null,
  loading: false,
  error: null,

  fetchSessions: async (filter) => {
    const key = scopeKeyFor(filter)
    if (filter?.workspaceId === undefined && filter?.cwd === undefined && !activeWorkspaceId() && key !== 'all') {
      set({
        scopeKey: null,
        lastFilter: null,
        sessions: [],
        selectedSession: null,
        loading: false,
        error: null,
      })
      return
    }

    const previousKey = get().scopeKey
    set({
      scopeKey: key,
      lastFilter: filter ?? null,
      loading: true,
      error: null,
      ...(previousKey !== key
        ? { sessions: [], selectedSession: null }
        : {}),
    })
    try {
      const sessions = await window.electron.session.list(filter)
      if (get().scopeKey !== key) return
      set({ sessions, loading: false })
    } catch (err) {
      if (get().scopeKey === key) {
        set({ error: (err as Error).message, loading: false })
      }
    }
  },

  fetchSessionDetail: async (sessionId) => {
    try {
      const detail = await window.electron.session.get(sessionId)
      if (detail) set({ selectedSession: detail })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  continueSession: async (sessionId, engine) => {
    set({ error: null })
    try {
      const result = await window.electron.session.continue({ sessionId, engine })
      await get().fetchSessions()
      return result
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  clearWorkspaceScope: () =>
    set({
      scopeKey: null,
      lastFilter: null,
      sessions: [],
      selectedSession: null,
      loading: false,
      error: null,
    }),

  setSelected: (session) => set({ selectedSession: session }),

  subscribeToEvents: () => {
    const unsubscribe = window.electron.session.onEvent(() => {
      const filter = get().lastFilter
      if (!filter && !activeWorkspaceId()) {
        get().clearWorkspaceScope()
        return
      }
      void get().fetchSessions(filter ?? {})
    })
    return unsubscribe
  },
}))
