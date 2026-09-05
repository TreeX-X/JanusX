import { describe, expect, it } from 'vitest'
import {
  formatScoreExplanation,
  resolveRecordForTab,
  selectionIdForTab,
} from '../../../src/renderer/src/components/knowledge/KnowledgeWorkbench'
import {
  sortInboxCandidates,
  type InboxCandidate,
  type KnowledgeWorkbenchSnapshot,
} from '../../../src/renderer/src/services/knowledge'
import type { Derivation } from '../../../src/shared/knowledge'

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

function inboxFact(id: string, derivation: Derivation, confidence: number): InboxCandidate {
  return {
    id,
    type: 'fact',
    status: 'proposed',
    derivation,
    evidence: { observationIds: ['obs-1'] },
    fact: {
      id: `fact-${id}`,
      content: id,
      concepts: [],
      files: [],
      tags: [],
      confidence,
      version: 1,
      status: 'proposed',
      kind: 'decision',
      provenance: {
        workspaceId: 'ws-1',
        workspaceName: 'Workspace',
        workspacePath: 'C:/work',
        source: 'manual',
        sourceObservationIds: ['obs-1'],
        fileRefs: [],
        actor: 'tester',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    },
  }
}

describe('Inbox ordering (§5 llm-preferred)', () => {
  it('keeps append order when mode is auto or absent', () => {
    const candidates = [
      inboxFact('det', 'deterministic', 0.95),
      inboxFact('llm', 'llm', 0.5),
    ]

    expect(sortInboxCandidates(candidates, 'auto').map((c) => c.id)).toEqual(['det', 'llm'])
    expect(sortInboxCandidates(candidates, undefined).map((c) => c.id)).toEqual(['det', 'llm'])
    expect(sortInboxCandidates(candidates, 'deterministic-only').map((c) => c.id)).toEqual(['det', 'llm'])
    // No-op modes return the input untouched (no copy, no reorder).
    expect(sortInboxCandidates(candidates, 'auto')).toBe(candidates)
  })

  it('ranks merged first, then llm, then deterministic under llm-preferred', () => {
    const candidates = [
      inboxFact('det', 'deterministic', 0.95),
      inboxFact('llm', 'llm', 0.5),
      inboxFact('merged', 'merged', 0.5),
    ]

    expect(sortInboxCandidates(candidates, 'llm-preferred').map((c) => c.id)).toEqual([
      'merged',
      'llm',
      'det',
    ])
  })

  it('breaks derivation ties by confidence, keeping append order on full ties', () => {
    const candidates = [
      inboxFact('llm-low', 'llm', 0.5),
      inboxFact('llm-high', 'llm', 0.9),
    ]

    expect(sortInboxCandidates(candidates, 'llm-preferred').map((c) => c.id)).toEqual([
      'llm-high',
      'llm-low',
    ])
  })

  it('surfaces llm-preferred order through Inbox selection', () => {
    const data = snapshot()
    data.mode = 'llm-preferred'
    data.factCandidates = [
      inboxFact('det', 'deterministic', 0.95),
      inboxFact('merged', 'merged', 0.6),
    ] as KnowledgeWorkbenchSnapshot['factCandidates']

    expect(selectionIdForTab(data, 'inbox', '')).toBe('merged')
  })
})

describe('formatScoreExplanation (demo parity)', () => {
  it('keeps bm25 and drops zero parts', () => {
    expect(formatScoreExplanation({
      bm25: 1.2, exactTitle: 0.5, titlePhrase: 0, bodyPhrase: 0, confidenceBoost: 0.4, freshnessBoost: 0,
    })).toBe('bm25 1.20 · exactTitle 0.50 · confidenceBoost 0.40')
  })
})
