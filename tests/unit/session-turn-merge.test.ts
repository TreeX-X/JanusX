import { describe, expect, it } from 'vitest'
import { mergeTranscriptTurns } from '../../src/renderer/src/lib/session-turn-merge'
import type { SessionTurnRecord } from '../../src/shared/ipc/session'

const fallback = { createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T01:00:00.000Z' }

function turn(partial: Partial<SessionTurnRecord>): SessionTurnRecord {
  return {
    id: partial.id ?? 't',
    kind: partial.kind ?? 'done',
    startedAt: partial.startedAt ?? fallback.createdAt,
    endedAt: partial.endedAt ?? fallback.updatedAt,
    ...partial,
  } as SessionTurnRecord
}

describe('session turn merge', () => {
  it('does not attach a stale cached answer to a newly appended unanswered question', () => {
    const base = [turn({ id: 'prompt-seed', prompt: 'q1' }), turn({ id: 'answer-seed', excerpt: 'old a1' })]
    const merged = mergeTranscriptTurns(base, [{ prompt: 'q1', excerpt: 'a1' }, { prompt: 'new q2' }], fallback)
    expect(merged[1]).toMatchObject({ prompt: 'new q2' })
    expect(merged[1].excerpt).toBeUndefined()
  })

  it('returns registry turns untouched without a transcript', () => {
    const base = [turn({ id: 'a', kind: 'failed', checkpointId: 'cp-1', prompt: 'q', excerpt: 'e' })]
    expect(mergeTranscriptTurns(base, [], fallback)).toEqual(base)
  })

  it('renders transcript pairs as prose-only turns without registry data', () => {
    const merged = mergeTranscriptTurns([], [{ prompt: 'q', excerpt: 'a' }], fallback)
    expect(merged).toEqual([
      {
        id: 'transcript-0',
        kind: 'done',
        checkpointId: undefined,
        startedAt: fallback.createdAt,
        endedAt: fallback.updatedAt,
        prompt: 'q',
        excerpt: 'a',
      },
    ])
  })

  it('aligns equal counts from the end and keeps registry identity', () => {
    const base = [
      turn({ id: 'a', kind: 'done', checkpointId: 'cp-1', prompt: 'q1', excerpt: 'stale' }),
      turn({ id: 'b', kind: 'interrupted', checkpointId: 'cp-2', prompt: 'q2' }),
    ]
    const merged = mergeTranscriptTurns(
      base,
      [
        { prompt: 'q1', excerpt: 'fresh a1' },
        { prompt: 'q2', excerpt: 'fresh a2' },
      ],
      fallback,
    )
    expect(merged).toEqual([
      { ...base[0], prompt: 'q1', excerpt: 'fresh a1' },
      { ...base[1], prompt: 'q2', excerpt: 'fresh a2' },
    ])
    expect(merged[1].kind).toBe('interrupted')
    expect(merged[1].checkpointId).toBe('cp-2')
  })

  it('prepends earlier transcript turns the registry never recorded', () => {
    const base = [turn({ id: 'a', prompt: 'q2', checkpointId: 'cp-1' })]
    const merged = mergeTranscriptTurns(
      base,
      [
        { prompt: 'q1', excerpt: 'a1' },
        { prompt: 'q2', excerpt: 'a2' },
      ],
      fallback,
    )
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ id: 'transcript-0', prompt: 'q1', excerpt: 'a1' })
    expect(merged[1]).toMatchObject({ id: 'a', prompt: 'q2', excerpt: 'a2', checkpointId: 'cp-1' })
  })

  it('keeps registry prose when the window cut transcript turns', () => {
    const base = [
      turn({ id: 'a', prompt: 'q1', excerpt: 'registry a1' }),
      turn({ id: 'b', prompt: 'q2', excerpt: 'registry a2' }),
    ]
    const merged = mergeTranscriptTurns(base, [{ prompt: 'q2', excerpt: 'a2' }], fallback)
    expect(merged).toEqual([
      { ...base[0], prompt: 'q1', excerpt: 'registry a1' },
      { ...base[1], prompt: 'q2', excerpt: 'a2' },
    ])
  })
})
