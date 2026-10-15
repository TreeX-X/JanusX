import { create } from 'zustand'

export interface DraftCard {
  id: string
  /** Draft ownership: a workspaceId, or the project-less global pane scope. */
  scopeId: string
  /** Optional provenance — the terminal the draft was written against, if any. */
  terminalId?: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface DraftCardState {
  drafts: Record<string, DraftCard[]>
  activeDraftIdByScope: Record<string, string | null>
  addDraft: (scopeId: string, terminalId?: string) => string
  removeDraft: (scopeId: string, draftId: string) => void
  updateDraft: (scopeId: string, draftId: string, patch: Partial<Pick<DraftCard, 'title' | 'content'>>) => void
  setActiveDraft: (scopeId: string, draftId: string | null) => void
  removeScopeDraftGroup: (scopeId: string) => void
  /** One-time remap of pre-scope drafts; see {@link migrateLegacyDraftScopes}. */
  scopeMigrated: boolean
  migrateLegacyDraftScopes: (resolveScope: (terminalId: string) => string | null) => void
  clearAll: () => void
}

const EMPTY_DRAFTS = Object.freeze([]) as unknown as DraftCard[]

/** Scope of drafts whose owning terminal could not be resolved; keeps them reachable. */
export const LEGACY_DRAFT_SCOPE = 'legacy-terminal'

export const getDraftsByScope = (state: DraftCardState, scopeId: string): DraftCard[] =>
  state.drafts[scopeId] ?? EMPTY_DRAFTS

export const getActiveDraft = (state: DraftCardState, scopeId: string): DraftCard | null => {
  const activeId = state.activeDraftIdByScope[scopeId]
  return activeId ? getDraftsByScope(state, scopeId).find((draft) => draft.id === activeId) ?? null : null
}

export const useDraftCardStore = create<DraftCardState>()((set, get) => ({
  drafts: {},
  activeDraftIdByScope: {},
  scopeMigrated: false,

  addDraft: (scopeId, terminalId) => {
    const drafts = get().drafts[scopeId] ?? []
    const id = crypto.randomUUID()
    const now = Date.now()
    const draft: DraftCard = {
      id,
      scopeId,
      ...(terminalId ? { terminalId } : {}),
      title: `Draft · ${drafts.length + 1}`,
      content: '',
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({
      drafts: { ...state.drafts, [scopeId]: [...drafts, draft] },
      activeDraftIdByScope: { ...state.activeDraftIdByScope, [scopeId]: id },
    }))
    return id
  },

  removeDraft: (scopeId, draftId) => set((state) => {
    const drafts = state.drafts[scopeId]
    if (!drafts?.some((draft) => draft.id === draftId)) return state
    const remaining = drafts.filter((draft) => draft.id !== draftId)
    const activeDraftIdByScope = state.activeDraftIdByScope[scopeId] === draftId
      ? { ...state.activeDraftIdByScope, [scopeId]: remaining.at(-1)?.id ?? null }
      : state.activeDraftIdByScope
    return { drafts: { ...state.drafts, [scopeId]: remaining }, activeDraftIdByScope }
  }),

  updateDraft: (scopeId, draftId, patch) => set((state) => {
    const drafts = state.drafts[scopeId]
    const hasTitle = patch.title != null
    const hasContent = patch.content != null
    if ((!hasTitle && !hasContent) || !drafts?.some((draft) => draft.id === draftId)) return state
    const updatedAt = Date.now()
    return {
      drafts: {
        ...state.drafts,
        [scopeId]: drafts.map((draft) => draft.id === draftId
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

  setActiveDraft: (scopeId, draftId) => set((state) => {
    if (draftId !== null && !state.drafts[scopeId]?.some((draft) => draft.id === draftId)) return state
    return { activeDraftIdByScope: { ...state.activeDraftIdByScope, [scopeId]: draftId } }
  }),

  removeScopeDraftGroup: (scopeId) => set((state) => {
    if (!(scopeId in state.drafts) && !(scopeId in state.activeDraftIdByScope)) return state
    const drafts = { ...state.drafts }
    const activeDraftIdByScope = { ...state.activeDraftIdByScope }
    delete drafts[scopeId]
    delete activeDraftIdByScope[scopeId]
    return { drafts, activeDraftIdByScope }
  }),

  /**
   * Remap drafts written before ownership moved from terminal to scope. Ids, titles,
   * bodies and timestamps are preserved; groups merge when several terminals shared a
   * workspace. Terminals that no longer resolve land in {@link LEGACY_DRAFT_SCOPE}
   * rather than being dropped. Idempotent, and a no-op after the first call.
   */
  migrateLegacyDraftScopes: (resolveScope) => set((state) => {
    if (state.scopeMigrated) return state
    const drafts: Record<string, DraftCard[]> = {}
    const activeDraftIdByScope: Record<string, string | null> = {}
    for (const [key, group] of Object.entries(state.drafts)) {
      // 迁移前所有键都是 terminalId；迁移后 scopeId 可能是任意 workspaceId，
      // 因此只重映射那些能解析出归属终端的组，其余按原键留下。
      const scopeId = resolveScope(key) ?? key
      const merged = drafts[scopeId] ?? []
      for (const draft of group) {
        merged.push({ ...draft, scopeId, terminalId: draft.terminalId ?? key })
      }
      drafts[scopeId] = merged
    }
    for (const [key, draftId] of Object.entries(state.activeDraftIdByScope)) {
      const scopeId = resolveScope(key) ?? key
      // 同作用域合并时保留任一经解析的选中项，不覆盖已有值。
      if (activeDraftIdByScope[scopeId] == null) activeDraftIdByScope[scopeId] = draftId
    }
    return { drafts, activeDraftIdByScope, scopeMigrated: true }
  }),

  // 连同 scopeMigrated 一起复位：清空后若还标记为已迁移，后续迁移会被跳过。
  clearAll: () => set({ drafts: {}, activeDraftIdByScope: {}, scopeMigrated: false }),
}))
