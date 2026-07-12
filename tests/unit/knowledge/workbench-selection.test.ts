import { describe, expect, it } from 'vitest'
import {
  resolveRecordForTab,
  selectionIdForTab,
} from '../../../src/renderer/src/components/knowledge/KnowledgeWorkbench'
import type { KnowledgeWorkbenchSnapshot } from '../../../src/renderer/src/services/knowledge'

function snapshot(): KnowledgeWorkbenchSnapshot {
  const provenance = {
    workspaceId: 'ws-1',
    workspaceName: 'Workspace',
    workspacePath: 'C:/work',
    source: 'manual' as const,
    sourceObservationIds: ['obs-1'],
    fileRefs: [],
    actor: 'tester',
    createdAt: '2026-07-12T00:00:00.000Z',
  }
  return {
    observations: [],
    factCandidates: [
      { id: 'candidate-proposed', type: 'fact', status: 'proposed', fact: { id: 'fact-proposed', content: 'Proposed', concepts: [], files: [], tags: [], confidence: 0.8, version: 1, status: 'proposed', provenance } },
      { id: 'candidate-applied', type: 'fact', status: 'applied', fact: { id: 'fact-applied', content: 'Applied', concepts: [], files: [], tags: [], confidence: 0.8, version: 1, status: 'active', provenance } },
    ],
    wikiPatches: [],
    graphCandidates: [],
    auditEvents: [],
    retentionStats: null,
    libraryCards: [{ id: 'truth-card', kind: 'fact', title: 'Truth', summary: '', score: 0.9, tags: [], status: 'active', sourceRefs: { observationIds: [], fileRefs: [] } }],
    loadedAt: '2026-07-12T00:00:00.000Z',
    usingDemoData: false,
    errors: [],
  }
}

describe('Knowledge Workbench tab selection', () => {
  it('replaces a candidate selection with truth when Library becomes active', () => {
    const data = snapshot()

    expect(selectionIdForTab(data, 'library', 'candidate-proposed')).toBe('truth-card')
    expect(resolveRecordForTab(data, 'library', 'candidate-proposed')).toBeNull()
    expect(resolveRecordForTab(data, 'library', 'truth-card')).toEqual(
      expect.objectContaining({ id: 'truth-card', reviewType: undefined }),
    )
  })

  it('keeps Inbox scoped to proposed candidates', () => {
    const data = snapshot()

    expect(selectionIdForTab(data, 'inbox', 'candidate-applied')).toBe('candidate-proposed')
    expect(resolveRecordForTab(data, 'inbox', 'candidate-applied')).toBeNull()
    expect(resolveRecordForTab(data, 'inbox', 'candidate-proposed')).toEqual(
      expect.objectContaining({ reviewType: 'fact', status: 'proposed' }),
    )
  })
})
