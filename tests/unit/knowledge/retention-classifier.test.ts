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
  it.each([
    [{ source: 'agent-stream', type: 'system-event', content: '   ' }, 'noise', 'empty-system-event'],
  ] as const)('classifies %s as %s', (input, retentionClass, retentionReason) => {
    const result = classifyRetention(input)
    expect(result.retentionClass).toBe(retentionClass)
    expect(result.retentionReason).toBe(retentionReason)
  })

  it.each([
    [{ source: 'janus-chat', type: 'conversation-turn', content: 'hi' }, 'conversation-turn'],
    [{ source: 'agent-stream', type: 'analysis-result', content: 'ok' }, 'analysis-result'],
    [{ source: 'tool', type: 'tool-call', content: 'edit', fileRefs: ['src/a.ts'] }, 'tool-with-file-refs'],
    [{ source: 'tool', type: 'tool-result', content: 'done', fileRefs: ['src/a.ts'] }, 'tool-with-file-refs'],
    [{ source: 'manual', type: 'user-note', content: 'remember' }, 'user-note'],
    [{ source: 'tool', type: 'tool-call', content: 'noop' }, 'tool-event'],
    [{ source: 'tool', type: 'tool-result', content: 'ok' }, 'tool-event'],
  ] as const)('classifies %s as evidence', (input, retentionReason) => {
    const result = classifyRetention(input)
    expect(result.retentionClass).toBe('evidence')
    expect(result.retentionReason).toBe(retentionReason)
  })

  it.each([
    [{ source: 'agent-stream', type: 'system-event', content: 'task started' }, 'lifecycle-event'],
    [{ source: 'checkpoint', type: 'checkpoint-event', content: 'snap' }, 'checkpoint-event'],
    [{ source: 'git-analyzer', type: 'git-event', content: 'commit' }, 'git-event'],
  ] as const)('classifies %s as operational', (input, retentionReason) => {
    const result = classifyRetention(input)
    expect(result.retentionClass).toBe('operational')
    expect(result.retentionReason).toBe(retentionReason)
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
  it.each([
    ['noise', 'noise'],
    ['operational', 'operational'],
  ] as const)('prunes %s past TTL', (retentionClass, ttlKey) => {
    const obs = makeObservation({ retentionClass })
    const cutoff = Date.parse(LONG_AGO) + (RETENTION_TTL_MS[ttlKey] as number) + 1
    expect(isAutoPrunable(obs, cutoff)).toBe(true)
  })

  it('does not prune noise within TTL', () => {
    const recent = new Date(NOW - 1000).toISOString()
    const obs = makeObservation({ retentionClass: 'noise', createdAt: recent })
    expect(isAutoPrunable(obs, NOW)).toBe(false)
  })

  it.each([
    ['evidence'],
    ['derived'],
    [undefined],
  ])('never prunes %s', (retentionClass) => {
    const obs = makeObservation({ retentionClass })
    expect(isAutoPrunable(obs, Date.parse(LONG_AGO) + 365 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('returns false for invalid createdAt', () => {
    const obs = makeObservation({ retentionClass: 'noise', createdAt: 'not-a-date' })
    expect(isAutoPrunable(obs, NOW)).toBe(false)
  })
})