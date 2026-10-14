import { create } from 'zustand'
import type { Memo, MemoBinding, MemoEdit } from '../../../shared/memo'

interface MemoState {
  memos: Memo[]
  changedIds: string[]
  /** Mirror of the active conversation's memoId. The conversation record owns
   *  it; this only lets the panel and the Chat turn read it without a lookup. */
  activeConversationId: string | null
  activeMemoId: string | null
  selectedNodes: Record<string, string | null>
  selectNode: (memoId: string, nodeId: string | null) => void
  refresh: () => Promise<void>
  bindConversation: (conversationId: string, memoId: string | null) => void
  create: (title: string) => Promise<Memo>
  edit: (id: string, edit: MemoEdit) => Promise<Memo>
  remove: (id: string, revision: number) => Promise<void>
  receive: (id: string) => void
}

export const useMemoStore = create<MemoState>()((set, get) => ({
  memos: [], changedIds: [], activeConversationId: null, activeMemoId: null, selectedNodes: {},
  selectNode: (memoId, nodeId) => set(state => ({ selectedNodes: { ...state.selectedNodes, [memoId]: nodeId } })),
  refresh: async () => {
    const api = window.electron?.memo
    if (!api) return
    const memos = await api.list()
    set(state => ({ memos, selectedNodes: reconcileSelectedNodes(memos, state.selectedNodes), changedIds: state.changedIds.filter(id => memos.some(memo => memo.id === id)) }))
  },
  bindConversation: (conversationId, memoId) => set(state => state.activeConversationId === conversationId && state.activeMemoId === memoId
    ? state
    : { ...state, activeConversationId: conversationId, activeMemoId: memoId, changedIds: memoId ? state.changedIds.filter(id => id !== memoId) : state.changedIds }),
  create: async title => {
    const memo = await window.electron.memo!.create(title)
    await get().refresh()
    return memo
  },
  edit: async (id, edit) => {
    const memo = await window.electron.memo!.edit(id, edit)
    set(state => {
      const memos = state.memos.map(item => item.id === id ? memo : item)
      return { memos, selectedNodes: reconcileSelectedNodes(memos, state.selectedNodes) }
    })
    return memo
  },
  remove: async (id, revision) => {
    await window.electron.memo!.remove(id, revision)
    set(state => {
      const memos = state.memos.filter(item => item.id !== id)
      return { memos, selectedNodes: reconcileSelectedNodes(memos, state.selectedNodes), changedIds: state.changedIds.filter(item => item !== id) }
    })
  },
  receive: id => set(state => ({ changedIds: [...new Set([...state.changedIds, id])] })),
}))

export function selectedMemoNodeId(memo: Memo | undefined, selectedNodes: Record<string, string | null>): string | null {
  const stored = memo && selectedNodes[memo.id]
  return memo?.nodes.some(node => node.id === stored) ? stored! : memo?.nodes[0]?.id ?? null
}

function reconcileSelectedNodes(memos: Memo[], selectedNodes: Record<string, string | null>) {
  return Object.fromEntries(memos.map(memo => [memo.id, selectedMemoNodeId(memo, selectedNodes)]))
}

/** The memo a Chat turn is bound to: the active conversation's own file, fixed
 * at send time. Unbound turns may explicitly create their first memo. */
export function memoBinding(conversationId: string, messageId: string): MemoBinding | undefined {
  const state = useMemoStore.getState()
  return state.activeConversationId === conversationId && state.activeMemoId
    ? { memoId: state.activeMemoId, messageId, selectedNodeId: selectedMemoNodeId(state.memos.find(memo => memo.id === state.activeMemoId), state.selectedNodes) }
    : undefined
}
