import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

  it('moves workspaceContext to a sidecar and reattaches on load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'janusx-roundtable-'))
    try {
      const store = new RoundtableStore({ journalPath: join(dir, 'events.jsonl') })
      const context = 'evidence context\n'.repeat(500)
      const state: any = { phase: 'awaiting-user', sessionId: 's2', roundNumber: 1, participants: [], cards: [], errors: [], facts: [], eventIds: ['e1'], version: 1, workspaceResources: [], workspaceContext: context }
      const event: any = { type: 'round:awaiting-user', sessionId: 's2', roundId: 'r1', roundNumber: 1, eventId: 'e1', occurredAt: new Date().toISOString() }
      await store.append('s2', event, state)
      await store.append('s2', { ...event, eventId: 'e2' }, { ...state, version: 2 })

      const journal = await readFile(join(dir, 'events.jsonl'), 'utf8')
      expect(journal).not.toContain('evidence context')
      expect(journal.length).toBeLessThan(context.length)
      expect(await readFile(join(dir, 'roundtable-context-s2.txt'), 'utf8')).toBe(context)

      const loaded = await store.load('s2')
      expect(loaded?.events).toHaveLength(2)
      expect(loaded?.state.workspaceContext).toBe(context)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps loading journal lines that still embed a full context', async () => {    const dir = await mkdtemp(join(tmpdir(), 'janusx-roundtable-'))
    try {
      const journalPath = join(dir, 'events.jsonl')
      const { appendFile } = await import('node:fs/promises')
      const state: any = { phase: 'awaiting-user', sessionId: 's3', roundNumber: 1, participants: [], cards: [], errors: [], facts: [], eventIds: ['e1'], version: 1, workspaceContext: 'legacy context' }
      const event: any = { type: 'round:awaiting-user', sessionId: 's3', roundId: 'r1', roundNumber: 1, eventId: 'e1', occurredAt: new Date().toISOString() }
      // Pre-sidecar journal format: full state embedded in the line, no sidecar.
      await appendFile(journalPath, `${JSON.stringify({ id: 'legacy', sessionId: 's3', event, state })}\n`, 'utf8')
      const store = new RoundtableStore({ journalPath })
      const loaded = await store.load('s3')
      expect(loaded?.state.workspaceContext).toBe('legacy context')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns events in append order with the latest state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'janusx-roundtable-'))
    try {
      const store = new RoundtableStore({ journalPath: join(dir, 'events.jsonl') })
      const base: any = { phase: 'running', sessionId: 's4', roundNumber: 1, participants: [], cards: [], errors: [], facts: [], eventIds: [], version: 0, userMessages: [] }
      await store.append('s4', { type: 'session:created', sessionId: 's4', workflowId: 'w', workflowVersion: '1', eventId: 'e1', occurredAt: '2026-01-01T00:00:00.000Z' } as any, { ...base, version: 1, eventIds: ['e1'] })
      await store.append('s4', { type: 'user:message', sessionId: 's4', message: { id: 'u1', text: 'hi', roundNumber: 1, createdAt: '2026-01-01T00:00:00.000Z' }, eventId: 'e2', occurredAt: '2026-01-01T00:00:01.000Z' } as any, { ...base, version: 2, eventIds: ['e1', 'e2'], userMessages: [{ id: 'u1', text: 'hi', roundNumber: 1, createdAt: '2026-01-01T00:00:00.000Z', sourceEventId: 'e2' }] })

      const loaded = await store.load('s4')
      expect(loaded?.events.map((item) => item.eventId)).toEqual(['e1', 'e2'])
      expect(loaded?.state.version).toBe(2)
      expect(loaded?.state.userMessages).toHaveLength(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('persists concurrent appends without losing lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'janusx-roundtable-'))
    try {
      const store = new RoundtableStore({ journalPath: join(dir, 'events.jsonl') })
      const base: any = { phase: 'running', sessionId: 's5', roundNumber: 1, participants: [], cards: [], errors: [], facts: [], eventIds: [], version: 0, userMessages: [] }
      await Promise.all([1, 2, 3].map((n) => store.append('s5', { type: 'round:awaiting-user', sessionId: 's5', roundId: `r${n}`, roundNumber: n, eventId: `e${n}`, occurredAt: '2026-01-01T00:00:00.000Z' } as any, { ...base, version: n })))

      const loaded = await store.load('s5')
      expect(loaded?.events).toHaveLength(3)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
