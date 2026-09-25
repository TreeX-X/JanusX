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

  fetchSessions: (filter?: SessionFilter, opts?: { silent?: boolean }) => Promise<void>
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

  fetchSessions: async (filter, opts) => {
    const key = scopeKeyFor(filter)
    const silent = opts?.silent === true
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
    // Stale-while-revalidate: background refreshes and scope switches keep
    // the visible cards in place. Clearing the list plus a loading banner
    // above it shifted every card per session:event, which read as flicker.
    // See .agents/notes/2026-09-22-session-flicker-storm--3f2c9a41.md
    if (silent && previousKey === key) {
      try {
        const sessions = await window.electron.session.list(filter)
        if (get().scopeKey !== key) return
        set({ sessions })
      } catch (err) {
        if (get().scopeKey === key) {
          set({ error: (err as Error).message })
        }
      }
      return
    }
    set({
      scopeKey: key,
      lastFilter: filter ?? null,
      loading: true,
      error: null,
      ...(previousKey !== key
        ? { selectedSession: null }
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
      await get().fetchSessions(get().lastFilter ?? {}, { silent: true })
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
    // Bulk hook/scan traffic emits session:event per mutation. Without
    // coalescing, each event refetched the whole card list with a loading
    // banner, which read as constant flicker. One trailing refresh per burst
    // keeps cards live without the strobe, mirroring the timeline tick.
    // See .agents/notes/2026-09-22-session-flicker-storm--3f2c9a41.md
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = window.electron.session.onEvent(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const filter = get().lastFilter
        if (!filter && !activeWorkspaceId()) {
          get().clearWorkspaceScope()
          return
        }
        void get().fetchSessions(filter ?? {}, { silent: true })
      }, 500)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  },
}))
