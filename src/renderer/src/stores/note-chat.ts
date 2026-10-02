import { create } from 'zustand'
import type { NoteChatChange } from '../../../shared/note-chat'
import { useBlueprintStore } from './blueprint'

export const useNoteChatStore = create<{
  changes: NoteChatChange[]
  receive: (change: NoteChatChange) => void
}>((set) => ({
  changes: [],
  receive: change => {
    set(state => ({ changes: [change, ...state.changes.filter(item => item.id !== change.id)] }))
    void useBlueprintStore.getState().refreshAfterAnalysis()
  },
}))
