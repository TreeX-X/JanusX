import { create } from 'zustand'

export interface DraftCard {
  id: string
  terminalId: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface DraftCardState {
  drafts: Record<string, DraftCard[]>
  activeDraftIdByTerminal: Record<string, string | null>
  addDraft: (terminalId: string) => string
  removeDraft: (terminalId: string, draftId: string) => void
  updateDraft: (terminalId: string, draftId: string, patch: Partial<Pick<DraftCard, 'title' | 'content'>>) => void
  setActiveDraft: (terminalId: string, draftId: string | null) => void
  removeTerminalDraftGroup: (terminalId: string) => void
  clearAll: () => void
}

const EMPTY_DRAFTS = Object.freeze([]) as unknown as DraftCard[]

export const getDraftsByTerminal = (state: DraftCardState, terminalId: string): DraftCard[] =>
  state.drafts[terminalId] ?? EMPTY_DRAFTS

export const getActiveDraft = (state: DraftCardState, terminalId: string): DraftCard | null => {
  const activeId = state.activeDraftIdByTerminal[terminalId]
  return activeId ? getDraftsByTerminal(state, terminalId).find((draft) => draft.id === activeId) ?? null : null
}

export const useDraftCardStore = create<DraftCardState>()((set, get) => ({
  drafts: {},
  activeDraftIdByTerminal: {},

  addDraft: (terminalId) => {
    const drafts = get().drafts[terminalId] ?? []
    const id = crypto.randomUUID()
    const now = Date.now()
    const draft: DraftCard = {
      id,
      terminalId,
      title: `Draft · ${drafts.length + 1}`,
      content: '',
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({
      drafts: { ...state.drafts, [terminalId]: [...drafts, draft] },
      activeDraftIdByTerminal: { ...state.activeDraftIdByTerminal, [terminalId]: id },
    }))
    return id
  },

  removeDraft: (terminalId, draftId) => set((state) => {
    const drafts = state.drafts[terminalId]
    if (!drafts?.some((draft) => draft.id === draftId)) return state
    const remaining = drafts.filter((draft) => draft.id !== draftId)
    const activeDraftIdByTerminal = state.activeDraftIdByTerminal[terminalId] === draftId
      ? { ...state.activeDraftIdByTerminal, [terminalId]: remaining.at(-1)?.id ?? null }
      : state.activeDraftIdByTerminal
    return { drafts: { ...state.drafts, [terminalId]: remaining }, activeDraftIdByTerminal }
  }),

  updateDraft: (terminalId, draftId, patch) => set((state) => {
    const drafts = state.drafts[terminalId]
    const hasTitle = patch.title != null
    const hasContent = patch.content != null
    if ((!hasTitle && !hasContent) || !drafts?.some((draft) => draft.id === draftId)) return state
    const updatedAt = Date.now()
    return {
      drafts: {
        ...state.drafts,
        [terminalId]: drafts.map((draft) => draft.id === draftId
          ? {
              ...draft,
              ...(hasTitle ? { title: patch.title } : {}),
              ...(hasContent ? { content: patch.content } : {}),
              updatedAt,
            }
          : draft),
      },
    }
  }),

  setActiveDraft: (terminalId, draftId) => set((state) => {
    if (draftId !== null && !state.drafts[terminalId]?.some((draft) => draft.id === draftId)) return state
    return { activeDraftIdByTerminal: { ...state.activeDraftIdByTerminal, [terminalId]: draftId } }
  }),

  removeTerminalDraftGroup: (terminalId) => set((state) => {
    if (!(terminalId in state.drafts) && !(terminalId in state.activeDraftIdByTerminal)) return state
    const drafts = { ...state.drafts }
    const activeDraftIdByTerminal = { ...state.activeDraftIdByTerminal }
    delete drafts[terminalId]
    delete activeDraftIdByTerminal[terminalId]
    return { drafts, activeDraftIdByTerminal }
  }),

  clearAll: () => set({ drafts: {}, activeDraftIdByTerminal: {} }),
}))
