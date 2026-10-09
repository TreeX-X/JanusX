import { describe, expect, it } from 'vitest'
import { extractionWindows, relevantKnowledge } from '../../../src/main/knowledge/extraction-context'
import type { MemoryFact, Observation } from '../../../src/shared/knowledge'

describe('task evidence context', () => {
  it('retains early constraints beyond three turns and isolates agents and projects', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ id: `row-${index}`, workspaceId: 'project', scope: 'project', type: 'conversation-turn',
      content: index === 0 ? 'Development only; never production.' : 'Continue implementation.', createdAt: new Date(1000 + index).toISOString(),
      sessionId: 'session', agentId: 'codex', correlationId: `turn-${index}`, tags: ['turn-started'], compactionStatus: 'active' } as Observation))
    const anchor = { ...rows[5], id: 'end', type: 'system-event', tags: ['turn-completed'], metadata: { evidenceStatus: 'complete' } } as Observation
    const windows = extractionWindows([...rows, { ...rows[0], id: 'other-project', workspaceId: 'other' }, { ...rows[0], id: 'other-agent', agentId: 'claude' }, anchor], Date.now())
    expect(windows).toHaveLength(1)
    expect(windows[0].observations.map(row => row.id)).toEqual(rows.map(row => row.id))
  })
  it('replaces an incomplete completion anchor after its persisted reread succeeds', () => {
    const base = { workspaceId: 'project', scope: 'project', type: 'system-event', content: 'completed', createdAt: new Date(1000).toISOString(),
      sessionId: 'session', agentId: 'codex', correlationId: 'turn', tags: ['turn-completed'], compactionStatus: 'active' } as Observation
    const windows = extractionWindows([{ ...base, id: 'pending', metadata: { evidenceStatus: 'transcript-answer-not-ready' } },
      { ...base, id: 'complete', metadata: { evidenceStatus: 'complete' } }], Date.now())
    expect(windows.map(window => window.anchor.id)).toEqual(['complete'])
  })
  it('retrieves old related facts across kind and concept labels from the full corpus', () => {
    const facts = Array.from({ length: 50 }, (_, index) => ({ id: `fact-${index}`, content: 'Unrelated rendering configuration.', kind: 'fact', concepts: ['ui'], files: [] } as unknown as MemoryFact))
    const older = { id: 'old', content: 'Production backup retention is thirty days.', kind: 'procedure', concepts: ['operations'], files: [] } as unknown as MemoryFact
    expect(relevantKnowledge([older, ...facts], 'Production backup retention is seven days.')[0].id).toBe('old')
  })
})
