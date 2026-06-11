import { create } from 'zustand'

interface AgentSessionInfo {
  id: string
  engine: string
  startedAt: string
  status: string
}

interface AgentEvent {
  type: string
  delta?: string
  fullText?: string
  text?: string
  id?: string
  name?: string
  arg?: string
  filePath?: string
  message?: string
  exitCode?: number
}

interface AgentStore {
  sessions: AgentSessionInfo[]
  events: Record<string, AgentEvent[]>
  loading: boolean
  error: string | null

  fetchSessions: () => Promise<void>
  appendEvent: (sessionId: string, event: AgentEvent) => void
  clearEvents: (sessionId: string) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  sessions: [],
  events: {},
  loading: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null })
    try {
      const sessions = (await window.electron.invoke('agent:listSessions')) as AgentSessionInfo[]
      set({ sessions, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  appendEvent: (sessionId, event) => {
    set((state) => ({
      events: {
        ...state.events,
        [sessionId]: [...(state.events[sessionId] ?? []), event],
      },
    }))
  },

  clearEvents: (sessionId) => {
    set((state) => {
      const events = { ...state.events }
      delete events[sessionId]
      return { events }
    })
  },
}))
