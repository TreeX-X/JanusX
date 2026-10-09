import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTurnChangesStore as store, TURN_HISTORY_LIMIT, type TerminalTurnChangesEvent } from '../../src/renderer/src/stores/turn-changes'

const handlers = new Set<(event: TerminalTurnChangesEvent) => void>()
const releases: (() => void)[] = []
const subscribe = () => { const release = store.getState().subscribeToEvents(); releases.push(release); return release }
const emit = (event: TerminalTurnChangesEvent) => handlers.forEach(handler => handler(event))
const listen = vi.fn((callback: (event: TerminalTurnChangesEvent) => void) => {
  handlers.add(callback)
  return () => { handlers.delete(callback) }
})
function event(sequence: number, fileCount = 1, id = 'a'): TerminalTurnChangesEvent {
  return { id, sequence, turnId: `${id}-${sequence}`, kind: 'done', checkpointId: 'same-checkpoint',
    endedAt: new Date(sequence * 1000).toISOString(), fileCount, additions: fileCount, deletions: 0,
    files: fileCount ? [{ path: 'test.ts', status: 'modified', additions: 1, deletions: 0, size: 8 }] : [] }
}
beforeEach(() => {
  store.setState({ changesByTerminal: {}, historyByTerminal: {}, lastEventByTerminal: {} })
  listen.mockClear()
  Object.assign(globalThis, { window: { electron: { terminal: { onTurnChanges: listen } } } })
})
afterEach(() => { releases.splice(0).forEach(release => release()); handlers.clear() })

describe('turn change history', () => {
  it('shares one listener across mounted islands and releases it after the last unmount', () => {
    const first = subscribe()
    subscribe()
    emit(event(1))
    expect(listen).toHaveBeenCalledTimes(1)
    expect(store.getState().historyByTerminal.a).toHaveLength(1)
    first(); first()
    emit(event(2))
    expect(store.getState().historyByTerminal.a).toHaveLength(2)
    releases[1]()
    expect(handlers.size).toBe(0)
    subscribe()
    expect(handlers.size).toBe(1)
  })
  it('clears latest on consecutive no-change turns without extending or deleting history', () => {
    subscribe()
    emit(event(1))
    const history = store.getState().historyByTerminal.a
    emit(event(2, 0)); emit(event(3, 0))
    expect(store.getState().changesByTerminal.a).toBeUndefined()
    expect(store.getState().historyByTerminal.a).toBe(history)
    expect(store.getState().lastEventByTerminal.a.sequence).toBe(3)
  })
  it('ignores duplicate and late events even after a no-change turn clears latest', () => {
    subscribe()
    emit(event(1)); emit(event(1)); emit(event(2, 0)); emit(event(1))
    expect(store.getState().changesByTerminal.a).toBeUndefined()
    expect(store.getState().historyByTerminal.a).toHaveLength(1)
  })
  it('keeps identical changes from distinct turns and isolates terminals', () => {
    subscribe()
    emit(event(1)); emit(event(2)); emit(event(1, 1, 'b')); emit(event(3, 0))
    expect(store.getState().historyByTerminal.a).toHaveLength(2)
    expect(store.getState().changesByTerminal.b.fileCount).toBe(1)
  })
  it('bounds history and clears all state for a closed terminal', () => {
    subscribe()
    for (let i = 1; i <= TURN_HISTORY_LIMIT + 5; i++) emit(event(i))
    expect(store.getState().historyByTerminal.a).toHaveLength(TURN_HISTORY_LIMIT)
    store.getState().clearTerminal('a')
    expect(store.getState().historyByTerminal.a).toBeUndefined()
    expect(store.getState().changesByTerminal.a).toBeUndefined()
    expect(store.getState().lastEventByTerminal.a).toBeUndefined()
  })
  it('clears stale latest on capture failure while preserving the last change record', () => {
    subscribe()
    emit(event(1)); emit({ ...event(2, 0), available: false })
    expect(store.getState().changesByTerminal.a).toBeUndefined()
    expect(store.getState().lastEventByTerminal.a.available).toBe(false)
    expect(store.getState().historyByTerminal.a).toHaveLength(1)
  })
})
