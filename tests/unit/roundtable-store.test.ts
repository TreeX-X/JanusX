import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoundtableStore } from '../../src/main/roundtable/store'

describe('RoundtableStore', () => {
  it('persists snapshots and ignores corrupt journal lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'janusx-roundtable-'))
    const store = new RoundtableStore({ journalPath: join(dir, 'events.jsonl') })
    const state: any = { phase: 'awaiting-user', sessionId: 's1', roundNumber: 1, participants: [], cards: [], errors: [], facts: [], eventIds: ['e1'], version: 1 }
    const event: any = { type: 'round:awaiting-user', sessionId: 's1', roundId: 'r1', roundNumber: 1, eventId: 'e1', occurredAt: new Date().toISOString() }
    await store.append('s1', event, state)
    const loaded = await store.load('s1')
    expect(loaded?.state.sessionId).toBe('s1')
    expect(loaded?.events).toHaveLength(1)
    await rm(dir, { recursive: true, force: true })
  })
})
