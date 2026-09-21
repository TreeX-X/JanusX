import { create } from 'zustand'
import type { TerminalTurnChangesEvent } from '../../../shared/ipc/terminal'

export type { TerminalTurnChangesEvent }

interface TurnChangesStore {
  changesByTerminal: Record<string, TerminalTurnChangesEvent>
  subscribeToEvents: () => () => void
  dismiss: (terminalId: string) => void
}

export const useTurnChangesStore = create<TurnChangesStore>((set) => ({
  changesByTerminal: {},

  subscribeToEvents: () => {
    const unsubscribe = window.electron.terminal.onTurnChanges((event) => {
      set((state) => ({
        changesByTerminal: { ...state.changesByTerminal, [event.id]: event },
      }))
    })
    return unsubscribe
  },

  dismiss: (terminalId) =>
    set((state) => {
      const next = { ...state.changesByTerminal }
      delete next[terminalId]
      return { changesByTerminal: next }
    }),
}))
