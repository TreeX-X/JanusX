import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveDraft, getDraftsByScope, useDraftCardStore } from '../../../src/renderer/src/stores/draft-card'

describe('useDraftCardStore', () => {
  beforeEach(() => {
    useDraftCardStore.getState().clearAll()
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns a stable empty array for missing scopes', () => {
    const state = useDraftCardStore.getState()
    expect(getDraftsByScope(state, 'missing')).toBe(getDraftsByScope(state, 'missing'))
  })

  it('adds markdown cards in creation order and activates the newest card', () => {
    const first = useDraftCardStore.getState().addDraft('workspace-a')
    const second = useDraftCardStore.getState().addDraft('workspace-a')
    const cards = getDraftsByScope(useDraftCardStore.getState(), 'workspace-a')
    expect([first, second]).toEqual([cards[0]?.id, cards[1]?.id])
    expect(cards.map((card) => [card.title, card.content])).toEqual([['Draft · 1', ''], ['Draft · 2', '']])
    expect(getActiveDraft(useDraftCardStore.getState(), 'workspace-a')?.id).toBe(second)
  })

  it('records the originating terminal as optional metadata without owning the card', () => {
    const id = useDraftCardStore.getState().addDraft('workspace-a', 'terminal-a')
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-a')[0]).toMatchObject({
      id,
      scopeId: 'workspace-a',
      terminalId: 'terminal-a',
    })
    // 没有终端来源时不写 terminalId 字段，而不是留一个 undefined 键。
    useDraftCardStore.getState().addDraft('workspace-a')
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-a')[1]).not.toHaveProperty('terminalId')
  })

  it('updates cards, ignores missing targets, and isolates scopes', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300)
    const a = useDraftCardStore.getState().addDraft('workspace-a')
    const b = useDraftCardStore.getState().addDraft('workspace-b')
    useDraftCardStore.getState().updateDraft('workspace-a', a, { title: '', content: '# Markdown' })
    useDraftCardStore.getState().updateDraft('workspace-a', b, { content: 'wrong scope' })
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-a')[0]).toMatchObject({ title: '', content: '# Markdown', updatedAt: 300 })
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-b')[0]?.content).toBe('')
  })

  it('ignores empty update fields without changing the card or store state', () => {
    const id = useDraftCardStore.getState().addDraft('workspace-a')
    useDraftCardStore.getState().updateDraft('workspace-a', id, { content: '# Keep' })
    const stateBeforeNoOps = useDraftCardStore.getState()
    const cardBeforeNoOps = getDraftsByScope(stateBeforeNoOps, 'workspace-a')[0]

    useDraftCardStore.getState().updateDraft('workspace-a', id, { title: undefined, content: undefined })
    useDraftCardStore.getState().updateDraft('workspace-a', 'missing', { content: 'ignored' })

    expect(useDraftCardStore.getState()).toBe(stateBeforeNoOps)
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-a')[0]).toBe(cardBeforeNoOps)
  })

  it('falls active back to the last remaining card and retains an empty scope', () => {
    const first = useDraftCardStore.getState().addDraft('workspace-a')
    const second = useDraftCardStore.getState().addDraft('workspace-a')
    useDraftCardStore.getState().setActiveDraft('workspace-a', first)
    useDraftCardStore.getState().removeDraft('workspace-a', second)
    expect(getActiveDraft(useDraftCardStore.getState(), 'workspace-a')?.id).toBe(first)

    const replacement = useDraftCardStore.getState().addDraft('workspace-a')
    useDraftCardStore.getState().removeDraft('workspace-a', replacement)
    expect(getActiveDraft(useDraftCardStore.getState(), 'workspace-a')?.id).toBe(first)
    useDraftCardStore.getState().removeDraft('workspace-a', first)
    expect(useDraftCardStore.getState().drafts['workspace-a']).toEqual([])
    expect(useDraftCardStore.getState().activeDraftIdByScope['workspace-a']).toBeNull()
  })

  it('validates active ids and removes scopes idempotently', () => {
    const id = useDraftCardStore.getState().addDraft('workspace-a')
    const other = useDraftCardStore.getState().addDraft('workspace-b')
    useDraftCardStore.getState().setActiveDraft('workspace-a', 'missing')
    expect(getActiveDraft(useDraftCardStore.getState(), 'workspace-a')?.id).toBe(id)
    useDraftCardStore.getState().setActiveDraft('workspace-a', null)
    expect(getActiveDraft(useDraftCardStore.getState(), 'workspace-a')).toBeNull()
    useDraftCardStore.getState().removeScopeDraftGroup('workspace-a')
    const stateAfterRemoval = useDraftCardStore.getState()
    useDraftCardStore.getState().removeScopeDraftGroup('workspace-a')
    expect(useDraftCardStore.getState()).toBe(stateAfterRemoval)
    expect(useDraftCardStore.getState().drafts).toEqual({ 'workspace-b': [expect.objectContaining({ id: other })] })
    expect(useDraftCardStore.getState().activeDraftIdByScope).toEqual({ 'workspace-b': other })
  })

  it('migrates terminal-keyed groups into their workspace scope, merging shared scopes', () => {
    const fromTerminalA = useDraftCardStore.getState().addDraft('terminal-a', 'terminal-a')
    const fromTerminalB = useDraftCardStore.getState().addDraft('terminal-b', 'terminal-b')
    const fromUnknown = useDraftCardStore.getState().addDraft('terminal-gone', 'terminal-gone')

    useDraftCardStore.getState().migrateLegacyDraftScopes((terminalId) =>
      terminalId === 'terminal-a' || terminalId === 'terminal-b' ? 'workspace-1' : null,
    )

    const state = useDraftCardStore.getState()
    // 同一工作区的两个终端草稿合并到一组，id 与 terminalId 元数据都保留。
    expect(getDraftsByScope(state, 'workspace-1').map((card) => card.id)).toEqual([fromTerminalA, fromTerminalB])
    expect(getDraftsByScope(state, 'workspace-1').map((card) => card.terminalId)).toEqual(['terminal-a', 'terminal-b'])
    // 解析不到归属的终端不丢，留在原键上可恢复。
    expect(getDraftsByScope(state, 'terminal-gone').map((card) => card.id)).toEqual([fromUnknown])
    expect(state.drafts['terminal-a']).toBeUndefined()
  })

  it('runs the legacy migration only once', () => {
    useDraftCardStore.getState().addDraft('terminal-a', 'terminal-a')
    useDraftCardStore.getState().migrateLegacyDraftScopes(() => 'workspace-1')
    const migrated = useDraftCardStore.getState()

    useDraftCardStore.getState().migrateLegacyDraftScopes(() => 'workspace-2')

    expect(useDraftCardStore.getState()).toBe(migrated)
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-1')).toHaveLength(1)
  })
})
