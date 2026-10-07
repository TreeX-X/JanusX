import { create } from 'zustand'
import type { TerminalTurnChangesEvent } from '../../../shared/ipc/terminal'

export type { TerminalTurnChangesEvent }
export const TURN_HISTORY_LIMIT = 20

interface TurnChangesStore {
  changesByTerminal: Record<string, TerminalTurnChangesEvent>
  historyByTerminal: Record<string, TerminalTurnChangesEvent[]>
  lastEventByTerminal: Record<string, TerminalTurnChangesEvent>
  subscribeToEvents: () => () => void
  clearTerminal: (terminalId: string) => void
}

let subscribers = 0
let unsubscribe: (() => void) | undefined

// Note: one IPC subscription feeds latest state and nonempty history independently — see .agents/notes/2026-09-23-terminal-right-island-turn-history--70beb72a.md
export const useTurnChangesStore = create<TurnChangesStore>((set) => ({
  changesByTerminal: {},
  historyByTerminal: {},
  lastEventByTerminal: {},

  subscribeToEvents: () => {
    if (subscribers++ === 0) {
      unsubscribe = window.electron.terminal.onTurnChanges((event) => {
        set(state => {
          const previous = state.lastEventByTerminal[event.id]
          if (previous) {
            if (event.turnId && event.turnId === previous.turnId) return state
            if (event.sequence !== undefined && previous.sequence !== undefined) {
              if (event.sequence <= previous.sequence) return state
            } else if (event.endedAt <= previous.endedAt) return state
          }
          const changesByTerminal = { ...state.changesByTerminal }
          const hasChanges = event.available !== false && event.fileCount > 0
          if (hasChanges) changesByTerminal[event.id] = event
          else delete changesByTerminal[event.id]
          return {
            changesByTerminal,
            lastEventByTerminal: { ...state.lastEventByTerminal, [event.id]: event },
            historyByTerminal: hasChanges
              ? { ...state.historyByTerminal, [event.id]: [...(state.historyByTerminal[event.id] ?? []), event].slice(-TURN_HISTORY_LIMIT) }
              : state.historyByTerminal,
          }
        })
      })
    }
    let released = false
    return () => {
      if (released) return
      released = true
      if (--subscribers === 0) {
        unsubscribe?.()
        unsubscribe = undefined
      }
    }
  },

  clearTerminal: terminalId => set(state => {
    const changesByTerminal = { ...state.changesByTerminal }
    const historyByTerminal = { ...state.historyByTerminal }
    const lastEventByTerminal = { ...state.lastEventByTerminal }
    delete changesByTerminal[terminalId]
    delete historyByTerminal[terminalId]
    delete lastEventByTerminal[terminalId]
    return { changesByTerminal, historyByTerminal, lastEventByTerminal }
  }),
}))
