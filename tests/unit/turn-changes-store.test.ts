import { describe, expect, it, vi } from 'vitest'
import { useTurnChangesStore } from '../../src/renderer/src/stores/turn-changes'

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
})
