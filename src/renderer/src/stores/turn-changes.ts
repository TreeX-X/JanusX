import { create } from 'zustand'
import type { TerminalTurnChangesEvent } from '../../../shared/ipc/terminal'

export type { TerminalTurnChangesEvent }

/** Per-terminal turn history depth; the island keeps the latest turns only. */
export const TURN_HISTORY_LIMIT = 20

interface TurnChangesStore {
  /** Latest turn per terminal (drives the persistent pill). */
  changesByTerminal: Record<string, TerminalTurnChangesEvent>
  /** Bounded per-terminal turn history, oldest first. */
  historyByTerminal: Record<string, TerminalTurnChangesEvent[]>
  subscribeToEvents: () => () => void
  /** Drop the latest turn; falls back to the previous one when history remains. */
  dismiss: (terminalId: string) => void
  /** Drop all turns for a terminal (terminal close). */
  clearTerminal: (terminalId: string) => void
}

export const useTurnChangesStore = create<TurnChangesStore>((set) => ({
  changesByTerminal: {},
  historyByTerminal: {},

  subscribeToEvents: () => {
    const unsubscribe = window.electron.terminal.onTurnChanges((event) => {
      set((state) => {
        const history = [...(state.historyByTerminal[event.id] ?? []), event].slice(-TURN_HISTORY_LIMIT)
        return {
          changesByTerminal: { ...state.changesByTerminal, [event.id]: event },
          historyByTerminal: { ...state.historyByTerminal, [event.id]: history },
        }
      })
    })
    return unsubscribe
  },

  dismiss: (terminalId) =>
    set((state) => {
      const history = state.historyByTerminal[terminalId]
      if (!history || history.length === 0) {
        if (!(terminalId in state.changesByTerminal)) return state
        const next = { ...state.changesByTerminal }
        delete next[terminalId]
        return { changesByTerminal: next }
      }
      const remaining = history.slice(0, -1)
      const nextChanges = { ...state.changesByTerminal }
      const nextHistory = { ...state.historyByTerminal }
      if (remaining.length === 0) {
        delete nextChanges[terminalId]
        delete nextHistory[terminalId]
      } else {
        nextChanges[terminalId] = remaining[remaining.length - 1]
        nextHistory[terminalId] = remaining
      }
      return { changesByTerminal: nextChanges, historyByTerminal: nextHistory }
    }),

  clearTerminal: (terminalId) =>
    set((state) => {
      if (!(terminalId in state.changesByTerminal) && !(terminalId in state.historyByTerminal)) return state
      const changesByTerminal = { ...state.changesByTerminal }
      const historyByTerminal = { ...state.historyByTerminal }
      delete changesByTerminal[terminalId]
      delete historyByTerminal[terminalId]
      return { changesByTerminal, historyByTerminal }
    }),
}))
