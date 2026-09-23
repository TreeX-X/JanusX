import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useTurnChangesStore, TURN_HISTORY_LIMIT } from '../../src/renderer/src/stores/turn-changes'

type TurnCallback = (event: Record<string, unknown>) => void

function installElectron() {
  const handlers = new Map<string, TurnCallback>()
  const stub = {
    terminal: {
      onTurnChanges: vi.fn((callback: TurnCallback) => {
        handlers.set('turnChanges', callback)
        return () => {
          handlers.delete('turnChanges')
        }
      }),
    },
  };
  (globalThis as { window?: unknown }).window = { electron: stub }
  return handlers
}

function turnEvent(id: string, endedAt: string, checkpointId = `cp-${endedAt}`) {
  return {
    id,
    kind: 'done',
    checkpointId,
    files: [],
    fileCount: 0,
    additions: 0,
    deletions: 0,
    endedAt,
  }
}

beforeEach(() => {
  useTurnChangesStore.setState({ changesByTerminal: {}, historyByTerminal: {} })
})

describe('turn-changes store', () => {
  it('collects per-terminal turn ends and dismisses them', () => {
    const handlers = installElectron()
    const unsubscribe = useTurnChangesStore.getState().subscribeToEvents()
    const event = {
      id: 'term-1',
      kind: 'done',
      checkpointId: 'cp-1',
      files: [],
      fileCount: 0,
      additions: 0,
      deletions: 0,
      endedAt: '2026-09-21T00:00:00.000Z',
    }
    handlers.get('turnChanges')?.(event)
    expect(useTurnChangesStore.getState().changesByTerminal['term-1']).toMatchObject({
      id: 'term-1',
      kind: 'done',
    })
    useTurnChangesStore.getState().dismiss('term-1')
    expect(useTurnChangesStore.getState().changesByTerminal['term-1']).toBeUndefined()
    unsubscribe()
    expect(handlers.has('turnChanges')).toBe(false)
  })

  it('keeps a bounded per-terminal history and falls back on dismiss', () => {
    const handlers = installElectron()
    const unsubscribe = useTurnChangesStore.getState().subscribeToEvents()
    handlers.get('turnChanges')?.(turnEvent('term-1', '2026-09-21T00:00:00.000Z', 'cp-1'))
    handlers.get('turnChanges')?.(turnEvent('term-1', '2026-09-21T00:01:00.000Z', 'cp-2'))
    expect(useTurnChangesStore.getState().historyByTerminal['term-1']).toHaveLength(2)
    expect(useTurnChangesStore.getState().changesByTerminal['term-1']).toMatchObject({ checkpointId: 'cp-2' })
    useTurnChangesStore.getState().dismiss('term-1')
    expect(useTurnChangesStore.getState().changesByTerminal['term-1']).toMatchObject({ checkpointId: 'cp-1' })
    expect(useTurnChangesStore.getState().historyByTerminal['term-1']).toHaveLength(1)
    unsubscribe()
  })

  it('caps history at the limit and clears per terminal', () => {
    const handlers = installElectron()
    const unsubscribe = useTurnChangesStore.getState().subscribeToEvents()
    for (let i = 0; i < TURN_HISTORY_LIMIT + 5; i += 1) {
      handlers.get('turnChanges')?.(turnEvent('term-1', `2026-09-21T00:${String(i).padStart(2, '0')}:00.000Z`, `cp-${i}`))
    }
    expect(useTurnChangesStore.getState().historyByTerminal['term-1']).toHaveLength(TURN_HISTORY_LIMIT)
    useTurnChangesStore.getState().clearTerminal('term-1')
    expect(useTurnChangesStore.getState().changesByTerminal['term-1']).toBeUndefined()
    expect(useTurnChangesStore.getState().historyByTerminal['term-1']).toBeUndefined()
    unsubscribe()
  })
})
