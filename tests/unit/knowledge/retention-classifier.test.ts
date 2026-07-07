import { describe, expect, it } from 'vitest'
import {
  classifyRetention,
  isAutoPrunable,
  RETENTION_TTL_MS,
} from '../../../src/main/knowledge/retention-classifier'
import type { Observation } from '../../../src/shared/knowledge'

const LONG_AGO = '2024-01-01T00:00:00.000Z'
const NOW = Date.now()

function makeObservation(overrides: Partial<Observation>): Observation {
  return {
    id: 'obs-1',
    workspaceId: 'ws',
    workspaceName: 'ws',
    workspacePath: 'C:/work',
    source: 'manual',
    type: 'user-note',
    content: 'x',
    fileRefs: [],
    tags: [],
    visibility: 'global',
    actor: 'tester',
    createdAt: LONG_AGO,
    ...overrides,
  }
}

describe('classifyRetention', () => {
  it('classifies empty system-event as noise', () => {
    const result = classifyRetention({
      source: 'agent-stream',
      type: 'system-event',
      content: '   ',
    })
    expect(result.retentionClass).toBe('noise')
    expect(result.retentionReason).toBe('empty-system-event')
  })

  it('classifies conversation-turn as evidence', () => {
    const result = classifyRetention({ source: 'janus-chat', type: 'conversation-turn', content: 'hi' })
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe('conversation-turn')
  })

  it('classifies analysis-result as evidence', () => {
    const result = classifyRetention({ source: 'agent-stream', type: 'analysis-result', content: 'ok' })
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe('analysis-result')
  })

  it('classifies tool-call with file refs as evidence', () => {
    const result = classifyRetention({
      source: 'tool',
      type: 'tool-call',
      content: 'edit',
      fileRefs: ['src/a.ts'],
    })
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe('tool-with-file-refs')
  })

  it('classifies tool-result with file refs as evidence', () => {
    const result = classifyRetention({
      source: 'tool',
      type: 'tool-result',
      content: 'done',
      fileRefs: ['src/a.ts'],
    })
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe('tool-with-file-refs')
  })

  it('classifies user-note as evidence', () => {
    const result = classifyRetention({ source: 'manual', type: 'user-note', content: 'remember' })
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe('user-note')
  })

  it('classifies lifecycle system-event (with content, no file refs) as operational', () => {
    const result = classifyRetention({
      source: 'agent-stream',
      type: 'system-event',
      content: 'task started',
    })
    expect(result.retentionClass).toBe('operational')
    expect(result.retentionReason).toBe('lifecycle-event')
  })

  it('classifies checkpoint-event as operational', () => {
    const result = classifyRetention({ source: 'checkpoint', type: 'checkpoint-event', content: 'snap' })
    expect(result.retentionClass).toBe('operational')
    expect(result.retentionReason).toBe('checkpoint-event')
  })

  it('classifies git-event as operational', () => {
    const result = classifyRetention({ source: 'git-analyzer', type: 'git-event', content: 'commit' })
    expect(result.retentionClass).toBe('operational')
    expect(result.retentionReason).toBe('git-event')
  })

  it('classifies tool-call without file refs as evidence (fallback)', () => {
    const result = classifyRetention({ source: 'tool', type: 'tool-call', content: 'noop' })
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe('tool-event')
  })

  it('defaults unmatched to evidence', () => {
    // tool-result with no file refs falls to rule 9
    const result = classifyRetention({ source: 'tool', type: 'tool-result', content: 'ok' })
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe('tool-event')
  })

  it('computes sha256 contentHash and UTF-8 contentLength', () => {
    const content = 'héllo' // 'é' is 2 bytes in UTF-8
    const result = classifyRetention({ source: 'manual', type: 'user-note', content })
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.contentLength).toBe(Buffer.byteLength(content, 'utf8'))
    expect(result.contentLength).toBe(6)
  })
})

describe('isAutoPrunable', () => {
  it('prunes noise past TTL', () => {
    const obs = makeObservation({ retentionClass: 'noise' })
    const cutoff = Date.parse(LONG_AGO) + (RETENTION_TTL_MS.noise as number) + 1
    expect(isAutoPrunable(obs, cutoff)).toBe(true)
  })

  it('does not prune noise within TTL', () => {
    const recent = new Date(NOW - 1000).toISOString()
    const obs = makeObservation({ retentionClass: 'noise', createdAt: recent })
    expect(isAutoPrunable(obs, NOW)).toBe(false)
  })

  it('prunes operational past TTL', () => {
    const obs = makeObservation({ retentionClass: 'operational' })
    const cutoff = Date.parse(LONG_AGO) + (RETENTION_TTL_MS.operational as number) + 1
    expect(isAutoPrunable(obs, cutoff)).toBe(true)
  })

  it('never prunes evidence', () => {
    const obs = makeObservation({ retentionClass: 'evidence' })
    expect(isAutoPrunable(obs, Date.parse(LONG_AGO) + 365 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('never prunes derived', () => {
    const obs = makeObservation({ retentionClass: 'derived' })
    expect(isAutoPrunable(obs, Date.parse(LONG_AGO) + 365 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('never prunes unknown retention class (safe default)', () => {
    const obs = makeObservation({ retentionClass: undefined })
    expect(isAutoPrunable(obs, Date.parse(LONG_AGO) + 365 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('returns false for invalid createdAt', () => {
    const obs = makeObservation({ retentionClass: 'noise', createdAt: 'not-a-date' })
    expect(isAutoPrunable(obs, NOW)).toBe(false)
  })
})