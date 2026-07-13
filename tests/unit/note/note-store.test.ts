import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveCard, getCardsByTerminal, useNoteStore } from '../../../src/renderer/src/stores/note'

describe('useNoteStore', () => {
  beforeEach(() => {
    useNoteStore.getState().clearAll()
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns a stable empty array for missing terminal groups', () => {
    const state = useNoteStore.getState()
    expect(getCardsByTerminal(state, 'missing')).toBe(getCardsByTerminal(state, 'missing'))
  })

  it('adds markdown cards in creation order and activates the newest card', () => {
    const first = useNoteStore.getState().addCard('terminal-a')
    const second = useNoteStore.getState().addCard('terminal-a')
    const cards = getCardsByTerminal(useNoteStore.getState(), 'terminal-a')
    expect([first, second]).toEqual([cards[0]?.id, cards[1]?.id])
    expect(cards.map((card) => [card.title, card.content])).toEqual([['Note · 1', ''], ['Note · 2', '']])
    expect(getActiveCard(useNoteStore.getState(), 'terminal-a')?.id).toBe(second)
  })

  it('updates cards, ignores missing targets, and isolates terminal groups', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300)
    const a = useNoteStore.getState().addCard('terminal-a')
    const b = useNoteStore.getState().addCard('terminal-b')
    useNoteStore.getState().updateCard('terminal-a', a, { title: '', content: '# Markdown' })
    useNoteStore.getState().updateCard('terminal-a', b, { content: 'wrong group' })
    expect(getCardsByTerminal(useNoteStore.getState(), 'terminal-a')[0]).toMatchObject({ title: '', content: '# Markdown', updatedAt: 300 })
    expect(getCardsByTerminal(useNoteStore.getState(), 'terminal-b')[0]?.content).toBe('')
  })

  it('ignores empty update fields without changing the card or store state', () => {
    const id = useNoteStore.getState().addCard('terminal-a')
    useNoteStore.getState().updateCard('terminal-a', id, { content: '# Keep' })
    const stateBeforeNoOps = useNoteStore.getState()
    const cardBeforeNoOps = getCardsByTerminal(stateBeforeNoOps, 'terminal-a')[0]

    useNoteStore.getState().updateCard('terminal-a', id, { title: undefined, content: undefined })
    useNoteStore.getState().updateCard('terminal-a', 'missing', { content: 'ignored' })

    expect(useNoteStore.getState()).toBe(stateBeforeNoOps)
    expect(getCardsByTerminal(useNoteStore.getState(), 'terminal-a')[0]).toBe(cardBeforeNoOps)
  })

  it('falls active back to the last remaining card and retains an empty group', () => {
    const first = useNoteStore.getState().addCard('terminal-a')
    const second = useNoteStore.getState().addCard('terminal-a')
    useNoteStore.getState().setActiveCard('terminal-a', first)
    useNoteStore.getState().removeCard('terminal-a', second)
    expect(getActiveCard(useNoteStore.getState(), 'terminal-a')?.id).toBe(first)

    const replacement = useNoteStore.getState().addCard('terminal-a')
    useNoteStore.getState().removeCard('terminal-a', replacement)
    expect(getActiveCard(useNoteStore.getState(), 'terminal-a')?.id).toBe(first)
    useNoteStore.getState().removeCard('terminal-a', first)
    expect(useNoteStore.getState().drafts['terminal-a']).toEqual([])
    expect(useNoteStore.getState().activeCardIdByTerminal['terminal-a']).toBeNull()
  })

  it('validates active ids and removes terminal groups idempotently', () => {
    const id = useNoteStore.getState().addCard('terminal-a')
    const other = useNoteStore.getState().addCard('terminal-b')
    useNoteStore.getState().setActiveCard('terminal-a', 'missing')
    expect(getActiveCard(useNoteStore.getState(), 'terminal-a')?.id).toBe(id)
    useNoteStore.getState().setActiveCard('terminal-a', null)
    expect(getActiveCard(useNoteStore.getState(), 'terminal-a')).toBeNull()
    useNoteStore.getState().removeTerminalGroup('terminal-a')
    const stateAfterRemoval = useNoteStore.getState()
    useNoteStore.getState().removeTerminalGroup('terminal-a')
    expect(useNoteStore.getState()).toBe(stateAfterRemoval)
    expect(useNoteStore.getState().drafts).toEqual({ 'terminal-b': [expect.objectContaining({ id: other })] })
    expect(useNoteStore.getState().activeCardIdByTerminal).toEqual({ 'terminal-b': other })
  })
})
