import { describe, expect, it } from 'vitest'
import {
  sortKnowledgeCards,
  toKnowledgeCard,
  toKnowledgeCards,
  truthSnapshotToKnowledgeCards,
} from '../../../src/shared/knowledge-card'
import type { KnowledgeSearchHit } from '../../../src/shared/knowledge'

function makeHit(overrides: Partial<KnowledgeSearchHit> = {}): KnowledgeSearchHit {
  return {
    id: 'hit-1',
    type: 'observation',
    title: 'Sample title',
    content: 'Sample content body for the search hit.',
    score: 1.25,
    bm25Score: 1.1,
    workspaceId: 'ws-1',
    workspaceName: 'Workspace',
    workspacePath: 'C:/workspace',
    source: 'manual',
    tags: ['#phase/7', 'retrieval'],
    fileRefs: ['src/shared/knowledge.ts'],
    sourceObservationIds: ['obs-1'],
    createdAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('toKnowledgeCard', () => {
  it('maps document types to card kinds', () => {
    expect(toKnowledgeCard(makeHit({ type: 'memory-fact' })).kind).toBe('fact')
    expect(toKnowledgeCard(makeHit({ type: 'fact-candidate' })).kind).toBe('fact')
    expect(toKnowledgeCard(makeHit({ type: 'wiki-patch' })).kind).toBe('wiki')
    expect(toKnowledgeCard(makeHit({ type: 'wiki-page' })).kind).toBe('wiki')
    expect(toKnowledgeCard(makeHit({ type: 'observation' })).kind).toBe('observation')
    expect(toKnowledgeCard(makeHit({ type: 'graph-candidate' })).kind).toBe('graph')
    expect(toKnowledgeCard(makeHit({ type: 'graph-edge' })).kind).toBe('graph')
  })

  it('defaults fact-candidate status to proposed when missing', () => {
    const card = toKnowledgeCard(
      makeHit({ type: 'fact-candidate', status: undefined }),
    )
    expect(card.status).toBe('proposed')
    expect(card.rawType).toBe('fact-candidate')
  })

  it('uses score with bm25Score fallback and maps source refs', () => {
    const withScore = toKnowledgeCard(makeHit({ score: 2.5, bm25Score: 0.4 }))
    expect(withScore.score).toBe(2.5)

    const fallback = toKnowledgeCard(
      makeHit({ score: undefined as unknown as number, bm25Score: 0.77 }),
    )
    expect(fallback.score).toBe(0.77)

    expect(withScore.sourceRefs).toEqual({
      observationIds: ['obs-1'],
      fileRefs: ['src/shared/knowledge.ts'],
    })
    expect(withScore.workspaceId).toBe('ws-1')
    expect(withScore.workspacePath).toBe('C:/workspace')
  })

  it('truncates long content into a 240-char summary', () => {
    const long = 'x'.repeat(300)
    const card = toKnowledgeCard(makeHit({ content: long }))
    expect(card.summary.length).toBe(240)
    expect(card.summary.endsWith('…')).toBe(true)
    expect(card.summary.startsWith('x'.repeat(239))).toBe(true)
  })

  it('maps a hit list via toKnowledgeCards', () => {
    const cards = toKnowledgeCards([
      makeHit({ id: 'a', type: 'wiki-patch' }),
      makeHit({ id: 'b', type: 'graph-candidate' }),
    ])
    expect(cards.map((c) => c.kind)).toEqual(['wiki', 'graph'])
  })
})

describe('sortKnowledgeCards', () => {
  it('prefers active status, then higher score', () => {
    const cards = toKnowledgeCards([
      makeHit({ id: 'low-active', score: 0.2, status: 'active' }),
      makeHit({ id: 'high-proposed', score: 9, status: 'proposed' }),
      makeHit({ id: 'mid-active', score: 1.5, status: 'active' }),
      makeHit({ id: 'no-status', score: 5 }),
    ])

    const sorted = sortKnowledgeCards(cards)
    expect(sorted.map((c) => c.id)).toEqual([
      'mid-active',
      'low-active',
      'high-proposed',
      'no-status',
    ])
  })
})

describe('truthSnapshotToKnowledgeCards', () => {
  it('maps accepted facts, wiki pages, and graph edges into the shared card model', () => {
    const cards = truthSnapshotToKnowledgeCards({
      facts: [{ id: 'fact-1', content: 'Accepted fact', concepts: ['accepted'], files: [], tags: ['fact'], confidence: 0.8, version: 1, status: 'active', provenance: { workspaceId: 'ws-1', workspaceName: 'Workspace', workspacePath: 'C:/work', source: 'manual', sourceObservationIds: ['obs-1'], fileRefs: ['src/a.ts'], actor: 'tester', createdAt: '2026-07-12T00:00:00.000Z' } }],
      wikiPages: [{ slug: 'wiki-1', title: 'Published page', markdown: '# Page', tags: ['wiki'], status: 'published', sourceFactIds: ['fact-1'], updatedAt: '2026-07-12T00:00:00.000Z', version: 1, workspaceId: 'ws-1' }],
      graphEdges: [{ id: 'edge-1', from: 'A', to: 'B', type: 'depends_on', confidence: 0.7, sourceFactIds: ['fact-1'], workspaceId: 'ws-1', createdAt: '2026-07-12T00:00:00.000Z' }],
    })

    expect(cards.map((card) => card.kind).sort()).toEqual(['fact', 'graph', 'wiki'])
    expect(cards.find((card) => card.id === 'fact-1')).toEqual(
      expect.objectContaining({ status: 'active', rawType: 'memory-fact' }),
    )
  })
})
