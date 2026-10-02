import { beforeEach, describe, expect, it } from 'vitest'
import { useNoteFocusStore } from '../../src/renderer/src/stores/note-focus'
import { resolveFocusNodes } from '../../src/renderer/src/features/blueprint/note-focus'
import type { NoteFocusEvent } from '../../src/shared/note-chat'
import type { Blueprint } from '../../src/shared/janus/types'

const event = (id: string, uris = ['note://repo/a', 'note://repo/b']): NoteFocusEvent => ({ id, conversationId: 'chat', workspacePath: 'C:/project', mode: 'scope', focus: 'auto', reason: 'Related work', notes: uris.map((uri, i) => ({ uri, title: uri, role: i ? 'reference' : 'target', reason: 'Relevant' })) })
beforeEach(() => useNoteFocusStore.setState({ scopes: {}, history: [], display: null }))
describe('assistant visual scope', () => {
  it('retains user pins and exclusions across assistant updates', () => {
    const state = useNoteFocusStore.getState()
    state.receive(event('one'))
    state.pin('chat', 'note://repo/a')
    state.remove('chat', 'note://repo/b')
    state.receive(event('two', ['note://repo/b', 'note://repo/c']))
    expect(useNoteFocusStore.getState().scopes.chat.notes.map(note => note.uri)).toEqual(['note://repo/a', 'note://repo/c'])
    expect(useNoteFocusStore.getState().scopes.chat.notes[0].pinned).toBe(true)
  })
  it('does not refocus the same primary target, and history location does not replace scope', () => {
    const state = useNoteFocusStore.getState()
    state.receive(event('one'))
    expect(useNoteFocusStore.getState().display?.focus).toBe('auto')
    state.receive(event('two'))
    expect(useNoteFocusStore.getState().display?.focus).toBe('none')
    const scope = useNoteFocusStore.getState().scopes.chat
    state.locate(event('old', ['note://repo/z']))
    expect(useNoteFocusStore.getState().scopes.chat).toBe(scope)
    expect(useNoteFocusStore.getState().display?.focus).toBe('explicit')
  })
  it('resolves exact URI and checkout, reports ambiguous and missing nodes', () => {
    const blueprint = { nodeIds: ['a', 'b', 'other'], nodes: { a: { sourceUri: 'note://repo/a' }, b: { sourceUri: 'note://repo/b' }, other: { sourceUri: 'note://repo/a' } }, composition: { nodes: { other: { path: 'C:/other' } } } } as unknown as Blueprint
    expect([...resolveFocusNodes(blueprint, 'C:/project', event('one')).roles.keys()]).toEqual(['a', 'b'])
    blueprint.composition!.nodes.other.path = 'C:/project'
    expect(resolveFocusNodes(blueprint, 'C:/project', event('one')).missing).toEqual(['note://repo/a'])
    expect(resolveFocusNodes(blueprint, 'C:/wrong', event('two', ['note://repo/z'])).roles.size).toBe(0)
  })
  it('clearing a conversation removes its history and highlight only', () => {
    const state = useNoteFocusStore.getState()
    state.receive(event('one'))
    state.receive({ ...event('other'), conversationId: 'other' })
    state.clear('chat', true)
    expect(useNoteFocusStore.getState().history.map(item => item.conversationId)).toEqual(['other'])
    expect(useNoteFocusStore.getState().scopes.chat.notes).toEqual([])
  })
})
