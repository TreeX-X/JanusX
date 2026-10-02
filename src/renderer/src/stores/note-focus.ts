// Note: assistant highlighting never changes mouse selection or execution scope — see .agents/notes/2026-10-02-blueprint-conversation-development--3efc89cf.md
import { create } from 'zustand'
import type { NoteFocusEvent, NoteScopeItem } from '../../../shared/note-chat'

export interface WorkingScope { workspacePath: string; notes: NoteScopeItem[]; excluded: string[] }
export const useNoteFocusStore = create<{
  scopes: Record<string, WorkingScope>
  history: NoteFocusEvent[]
  display: NoteFocusEvent | null
  displays: Record<string, NoteFocusEvent>
  activeConversationId: string | null
  hidden: Record<string, string[]>
  reportHidden: (conversationId: string, ids: string[]) => void
  activate: (conversationId: string | null) => void
  receive: (event: NoteFocusEvent) => void
  locate: (event: NoteFocusEvent) => void
  remove: (conversationId: string, uri: string) => void
  pin: (conversationId: string, uri: string) => void
  clear: (conversationId: string, forgetHistory?: boolean) => void
}>((set) => ({
  scopes: {}, history: [], display: null, displays: {}, activeConversationId: null,
  hidden: {},
  reportHidden: (id, ids) => set(state => JSON.stringify(state.hidden[id]) === JSON.stringify(ids) ? state : { hidden: { ...state.hidden, [id]: ids } }),
  activate: activeConversationId => set(state => ({ activeConversationId, display: activeConversationId ? state.displays[activeConversationId] ?? null : null })),
  receive: event => set(state => {
    const previous = state.scopes[event.conversationId]
    const old = previous?.workspacePath === event.workspacePath ? previous : undefined
    const excluded = old?.excluded ?? []
    const pins = old?.notes.filter(note => note.pinned) ?? []
    const preserved = event.mode === 'access' ? (old?.notes ?? pins).map(note => !note.pinned && event.notes.some(item => item.uri === note.uri && item.role === 'target')
      ? { ...note, role: 'target' as const } : note) : pins
    const notes = event.mode === 'scope' || event.focus === 'none' ? [...preserved, ...event.notes.filter(note => !excluded.includes(note.uri) && !preserved.some(pin => pin.uri === note.uri))].slice(0, 32) : event.notes
    const effective = { ...event, notes }
    const primary = (items: NoteScopeItem[]) => items.filter(item => item.role === 'target').map(item => item.uri).sort().join('|')
    const sameTarget = primary(notes) === primary(old?.notes ?? [])
    const display = { ...effective, focus: event.focus === 'auto' && (sameTarget || event.mode === 'display') ? 'none' as const : event.focus }
    return {
      scopes: event.mode === 'scope' ? { ...state.scopes, [event.conversationId]: { workspacePath: event.workspacePath, notes, excluded } } : state.scopes,
      history: [...state.history.filter(item => item.id !== event.id), event.mode === 'access' ? event : effective].slice(-100),
      displays: { ...state.displays, [event.conversationId]: display },
      display: state.activeConversationId === event.conversationId ? display : state.display,
    }
  }),
  locate: event => set(state => {
    const display: NoteFocusEvent = { ...event, id: crypto.randomUUID(), focus: 'explicit', mode: 'display' }
    return { displays: { ...state.displays, [event.conversationId]: display },
      display: state.activeConversationId === event.conversationId ? display : state.display }
  }),
  remove: (conversationId, uri) => set(state => {
    const scope = state.scopes[conversationId]
    if (!scope) return state
    const notes = scope.notes.filter(note => note.uri !== uri)
    const cached = state.displays[conversationId]
    return { displays: cached ? { ...state.displays, [conversationId]: { ...cached, notes: cached.notes.filter(note => note.uri !== uri), focus: 'none' } } : state.displays,
      scopes: { ...state.scopes, [conversationId]: { ...scope, notes, excluded: [...new Set([...scope.excluded, uri])] } },
      display: state.display?.conversationId === conversationId ? { ...state.display, notes: state.display.notes.filter(note => note.uri !== uri), focus: 'none' } : state.display }
  }),
  pin: (conversationId, uri) => set(state => {
    const scope = state.scopes[conversationId]
    if (!scope) return state
    return { scopes: { ...state.scopes, [conversationId]: { ...scope, notes: scope.notes.map(note => note.uri === uri ? { ...note, pinned: !note.pinned } : note) } } }
  }),
  clear: (conversationId, forgetHistory = false) => set(state => ({ displays: Object.fromEntries(Object.entries(state.displays).filter(([id]) => id !== conversationId)), scopes: { ...state.scopes, [conversationId]: { workspacePath: state.scopes[conversationId]?.workspacePath ?? '', notes: [], excluded: [] } }, display: state.display?.conversationId === conversationId ? null : state.display,
    history: forgetHistory ? state.history.filter(event => event.conversationId !== conversationId) : state.history })),
}))
