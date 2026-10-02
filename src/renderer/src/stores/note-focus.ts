// Note: assistant highlighting never changes mouse selection or execution scope — see .agents/notes/2026-10-02-blueprint-conversation-development--3efc89cf.md
import { create } from 'zustand'
import type { NoteFocusEvent, NoteScopeItem } from '../../../shared/note-chat'

export interface WorkingScope { workspacePath: string; notes: NoteScopeItem[]; excluded: string[] }
export const useNoteFocusStore = create<{
  scopes: Record<string, WorkingScope>
  history: NoteFocusEvent[]
  display: NoteFocusEvent | null
  receive: (event: NoteFocusEvent) => void
  locate: (event: NoteFocusEvent) => void
  remove: (conversationId: string, uri: string) => void
  pin: (conversationId: string, uri: string) => void
  clear: (conversationId: string, forgetHistory?: boolean) => void
}>((set) => ({
  scopes: {}, history: [], display: null,
  receive: event => set(state => {
    const previous = state.scopes[event.conversationId]
    const old = previous?.workspacePath === event.workspacePath ? previous : undefined
    const excluded = old?.excluded ?? []
    const pins = old?.notes.filter(note => note.pinned) ?? []
    const notes = event.mode === 'scope' ? [...pins, ...event.notes.filter(note => !excluded.includes(note.uri) && !pins.some(pin => pin.uri === note.uri))].slice(0, 32) : event.notes
    const effective = { ...event, notes }
    const primary = (items: NoteScopeItem[]) => items.filter(item => item.role === 'target').map(item => item.uri).sort().join('|')
    const sameTarget = primary(notes) === primary(old?.notes ?? [])
    return {
      scopes: event.mode === 'scope' ? { ...state.scopes, [event.conversationId]: { workspacePath: event.workspacePath, notes, excluded } } : state.scopes,
      history: [...state.history.filter(item => item.id !== event.id), effective].slice(-100),
      display: { ...effective, focus: event.focus === 'auto' && (sameTarget || event.mode === 'display') ? 'none' : event.focus },
    }
  }),
  locate: event => set({ display: { ...event, id: crypto.randomUUID(), focus: 'explicit', mode: 'display' } }),
  remove: (conversationId, uri) => set(state => {
    const scope = state.scopes[conversationId]
    if (!scope) return state
    const notes = scope.notes.filter(note => note.uri !== uri)
    return { scopes: { ...state.scopes, [conversationId]: { ...scope, notes, excluded: [...new Set([...scope.excluded, uri])] } },
      display: state.display?.conversationId === conversationId ? { ...state.display, notes: state.display.notes.filter(note => note.uri !== uri), focus: 'none' } : state.display }
  }),
  pin: (conversationId, uri) => set(state => {
    const scope = state.scopes[conversationId]
    if (!scope) return state
    return { scopes: { ...state.scopes, [conversationId]: { ...scope, notes: scope.notes.map(note => note.uri === uri ? { ...note, pinned: !note.pinned } : note) } } }
  }),
  clear: (conversationId, forgetHistory = false) => set(state => ({ scopes: { ...state.scopes, [conversationId]: { workspacePath: state.scopes[conversationId]?.workspacePath ?? '', notes: [], excluded: [] } }, display: state.display?.conversationId === conversationId ? null : state.display,
    history: forgetHistory ? state.history.filter(event => event.conversationId !== conversationId) : state.history })),
}))
