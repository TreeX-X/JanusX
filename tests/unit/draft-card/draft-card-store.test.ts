import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveDraft, getDraftsByTerminal, useDraftCardStore } from '../../../src/renderer/src/stores/draft-card'

describe('useDraftCardStore', () => {
  beforeEach(() => {
    useDraftCardStore.getState().clearAll()
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns a stable empty array for missing terminal groups', () => {
    const state = useDraftCardStore.getState()
    expect(getDraftsByTerminal(state, 'missing')).toBe(getDraftsByTerminal(state, 'missing'))
  })

  it('adds markdown cards in creation order and activates the newest card', () => {
    const first = useDraftCardStore.getState().addDraft('terminal-a')
    const second = useDraftCardStore.getState().addDraft('terminal-a')
    const cards = getDraftsByTerminal(useDraftCardStore.getState(), 'terminal-a')
    expect([first, second]).toEqual([cards[0]?.id, cards[1]?.id])
    expect(cards.map((card) => [card.title, card.content])).toEqual([['Draft · 1', ''], ['Draft · 2', '']])
    expect(getActiveDraft(useDraftCardStore.getState(), 'terminal-a')?.id).toBe(second)
  })

  it('updates cards, ignores missing targets, and isolates terminal groups', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300)
    const a = useDraftCardStore.getState().addDraft('terminal-a')
    const b = useDraftCardStore.getState().addDraft('terminal-b')
    useDraftCardStore.getState().updateDraft('terminal-a', a, { title: '', content: '# Markdown' })
    useDraftCardStore.getState().updateDraft('terminal-a', b, { content: 'wrong group' })
    expect(getDraftsByTerminal(useDraftCardStore.getState(), 'terminal-a')[0]).toMatchObject({ title: '', content: '# Markdown', updatedAt: 300 })
    expect(getDraftsByTerminal(useDraftCardStore.getState(), 'terminal-b')[0]?.content).toBe('')
  })

  it('ignores empty update fields without changing the card or store state', () => {
    const id = useDraftCardStore.getState().addDraft('terminal-a')
    useDraftCardStore.getState().updateDraft('terminal-a', id, { content: '# Keep' })
    const stateBeforeNoOps = useDraftCardStore.getState()
    const cardBeforeNoOps = getDraftsByTerminal(stateBeforeNoOps, 'terminal-a')[0]

    useDraftCardStore.getState().updateDraft('terminal-a', id, { title: undefined, content: undefined })
    useDraftCardStore.getState().updateDraft('terminal-a', 'missing', { content: 'ignored' })

    expect(useDraftCardStore.getState()).toBe(stateBeforeNoOps)
    expect(getDraftsByTerminal(useDraftCardStore.getState(), 'terminal-a')[0]).toBe(cardBeforeNoOps)
  })

  it('falls active back to the last remaining card and retains an empty group', () => {
    const first = useDraftCardStore.getState().addDraft('terminal-a')
    const second = useDraftCardStore.getState().addDraft('terminal-a')
    useDraftCardStore.getState().setActiveDraft('terminal-a', first)
    useDraftCardStore.getState().removeDraft('terminal-a', second)
    expect(getActiveDraft(useDraftCardStore.getState(), 'terminal-a')?.id).toBe(first)

    const replacement = useDraftCardStore.getState().addDraft('terminal-a')
    useDraftCardStore.getState().removeDraft('terminal-a', replacement)
    expect(getActiveDraft(useDraftCardStore.getState(), 'terminal-a')?.id).toBe(first)
    useDraftCardStore.getState().removeDraft('terminal-a', first)
    expect(useDraftCardStore.getState().drafts['terminal-a']).toEqual([])
    expect(useDraftCardStore.getState().activeDraftIdByTerminal['terminal-a']).toBeNull()
  })

  it('validates active ids and removes terminal groups idempotently', () => {
    const id = useDraftCardStore.getState().addDraft('terminal-a')
    const other = useDraftCardStore.getState().addDraft('terminal-b')
    useDraftCardStore.getState().setActiveDraft('terminal-a', 'missing')
    expect(getActiveDraft(useDraftCardStore.getState(), 'terminal-a')?.id).toBe(id)
    useDraftCardStore.getState().setActiveDraft('terminal-a', null)
    expect(getActiveDraft(useDraftCardStore.getState(), 'terminal-a')).toBeNull()
    useDraftCardStore.getState().removeTerminalDraftGroup('terminal-a')
    const stateAfterRemoval = useDraftCardStore.getState()
    useDraftCardStore.getState().removeTerminalDraftGroup('terminal-a')
    expect(useDraftCardStore.getState()).toBe(stateAfterRemoval)
    expect(useDraftCardStore.getState().drafts).toEqual({ 'terminal-b': [expect.objectContaining({ id: other })] })
    expect(useDraftCardStore.getState().activeDraftIdByTerminal).toEqual({ 'terminal-b': other })
  })
})
