import { create } from 'zustand'

export interface NoteCard {
  id: string
  terminalId: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface NoteState {
  drafts: Record<string, NoteCard[]>
  activeCardIdByTerminal: Record<string, string | null>
  addCard: (terminalId: string) => string
  removeCard: (terminalId: string, cardId: string) => void
  updateCard: (terminalId: string, cardId: string, patch: Partial<Pick<NoteCard, 'title' | 'content'>>) => void
  setActiveCard: (terminalId: string, cardId: string | null) => void
  removeTerminalGroup: (terminalId: string) => void
  clearAll: () => void
}

const EMPTY_CARDS = Object.freeze([]) as unknown as NoteCard[]

export const getCardsByTerminal = (state: NoteState, terminalId: string): NoteCard[] =>
  state.drafts[terminalId] ?? EMPTY_CARDS

export const getActiveCard = (state: NoteState, terminalId: string): NoteCard | null => {
  const activeId = state.activeCardIdByTerminal[terminalId]
  return activeId ? getCardsByTerminal(state, terminalId).find((card) => card.id === activeId) ?? null : null
}

export const useNoteStore = create<NoteState>()((set, get) => ({
  drafts: {},
  activeCardIdByTerminal: {},

  addCard: (terminalId) => {
    const cards = get().drafts[terminalId] ?? []
    const id = crypto.randomUUID()
    const now = Date.now()
    const card: NoteCard = {
      id,
      terminalId,
      title: `Note · ${cards.length + 1}`,
      content: '',
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({
      drafts: { ...state.drafts, [terminalId]: [...cards, card] },
      activeCardIdByTerminal: { ...state.activeCardIdByTerminal, [terminalId]: id },
    }))
    return id
  },

  removeCard: (terminalId, cardId) => set((state) => {
    const cards = state.drafts[terminalId]
    if (!cards?.some((card) => card.id === cardId)) return state
    const remaining = cards.filter((card) => card.id !== cardId)
    const activeCardIdByTerminal = state.activeCardIdByTerminal[terminalId] === cardId
      ? { ...state.activeCardIdByTerminal, [terminalId]: remaining.at(-1)?.id ?? null }
      : state.activeCardIdByTerminal
    return { drafts: { ...state.drafts, [terminalId]: remaining }, activeCardIdByTerminal }
  }),

  updateCard: (terminalId, cardId, patch) => set((state) => {
    const cards = state.drafts[terminalId]
    const hasTitle = patch.title != null
    const hasContent = patch.content != null
    if ((!hasTitle && !hasContent) || !cards?.some((card) => card.id === cardId)) return state
    const updatedAt = Date.now()
    return {
      drafts: {
        ...state.drafts,
        [terminalId]: cards.map((card) => card.id === cardId
          ? {
              ...card,
              ...(hasTitle ? { title: patch.title } : {}),
              ...(hasContent ? { content: patch.content } : {}),
              updatedAt,
            }
          : card),
      },
    }
  }),

  setActiveCard: (terminalId, cardId) => set((state) => {
    if (cardId !== null && !state.drafts[terminalId]?.some((card) => card.id === cardId)) return state
    return { activeCardIdByTerminal: { ...state.activeCardIdByTerminal, [terminalId]: cardId } }
  }),

  removeTerminalGroup: (terminalId) => set((state) => {
    if (!(terminalId in state.drafts) && !(terminalId in state.activeCardIdByTerminal)) return state
    const drafts = { ...state.drafts }
    const activeCardIdByTerminal = { ...state.activeCardIdByTerminal }
    delete drafts[terminalId]
    delete activeCardIdByTerminal[terminalId]
    return { drafts, activeCardIdByTerminal }
  }),

  clearAll: () => set({ drafts: {}, activeCardIdByTerminal: {} }),
}))
