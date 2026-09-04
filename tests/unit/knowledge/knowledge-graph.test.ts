import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeGraphView,
  graphLayoutStorageKey,
  layoutKnowledgeGraph,
  layoutWorkspaceFor,
  loadStoredLayout,
  mergeStoredLayout,
  recordForGraphEdge,
  recordForGraphNode,
} from '../../../src/renderer/src/components/knowledge/knowledgeGraph'
import type { KnowledgeWorkbenchSnapshot } from '../../../src/renderer/src/services/knowledge'
import type {
  CandidateFact,
  GraphEdge,
  KnowledgeProvenance,
  MemoryFact,
  Observation,
} from '../../../src/shared/knowledge'

function provenance(workspaceId = 'ws-1', observationIds: string[] = ['obs-1']): KnowledgeProvenance {
  return {
    workspaceId,
    workspaceName: 'Workspace',
    workspacePath: 'C:/work',
    source: 'manual',
    sourceObservationIds: observationIds,
    fileRefs: [],
    actor: 'tester',
    createdAt: '2026-07-12T00:00:00.000Z',
  }
}

function fact(id: string, overrides: Partial<MemoryFact> = {}): MemoryFact {
  return {
    id,
    content: `Fact ${id} content`,
    concepts: [],
    files: [],
    tags: [],
    confidence: 0.8,
    version: 1,
    status: 'active',
    kind: 'fact',
    provenance: provenance(),
    ...overrides,
  }
}

function candidate(id: string, overrides: Partial<CandidateFact> = {}): CandidateFact {
  return {
    id,
    type: 'fact',
    status: 'proposed',
    fact: fact(`fact-${id}`),
    derivation: 'deterministic',
    evidence: { observationIds: ['obs-1'] },
    ...overrides,
  }
}

function observation(id: string): Observation {
  return {
    id,
    workspaceId: 'ws-1',
    workspaceName: 'Workspace',
    workspacePath: 'C:/work',
    source: 'manual',
    type: 'user-note',
    content: `Observation ${id} body`,
    summary: `Observation ${id}`,
    fileRefs: [],
    tags: [],
    visibility: 'workspace',
    actor: 'tester',
    createdAt: '2026-07-12T00:00:00.000Z',
    retentionClass: 'evidence',
    contentHash: 'a'.repeat(64),
    dedupeKey: 'b'.repeat(64),
    contentLength: 10,
    compactionStatus: 'active',
  }
}

function snapshot(overrides: Partial<KnowledgeWorkbenchSnapshot> = {}): KnowledgeWorkbenchSnapshot {
  return {
    observations: [],
    factCandidates: [],
    wikiPatches: [],
    graphCandidates: [],
    auditEvents: [],
    retentionStats: null,
    libraryCards: [],
    conflicts: [],
    loadedAt: '2026-09-04T00:00:00.000Z',
    usingDemoData: false,
    errors: [],
    ...overrides,
  }
}

describe('buildKnowledgeGraphView (§10.1 adapter)', () => {
  it('maps active facts with kind, evidence and file refs', () => {
    const view = buildKnowledgeGraphView(snapshot({
      truthFacts: [fact('a', { concepts: ['solo'], files: ['src/a.ts'] })],
    }))

    expect(view.truncated).toBe(false)
    expect(view.nodes).toHaveLength(1)
    expect(view.nodes[0]).toEqual(expect.objectContaining({
      id: 'fact:a',
      kind: 'fact',
      factKind: 'fact',
      label: 'Fact a content',
      evidenceIds: ['obs-1'],
    }))
    // Concepts cited once never become entity nodes; observations stay out.
    expect(view.nodes.map((node) => node.kind)).toEqual(['fact'])
    expect(view.edges).toEqual([])
  })

  it('composes synthetic supersedes edges only when the target node exists', () => {
    const view = buildKnowledgeGraphView(snapshot({
      truthFacts: [
        fact('old'),
        fact('new', { supersedes: 'old' }),
        fact('orphan', { supersedes: 'missing' }),
      ],
    }))

    expect(view.edges).toEqual([
      expect.objectContaining({ from: 'fact:new', to: 'fact:old', type: 'supersedes', synthetic: true }),
    ])
  })

  it('marks proposed candidates and composes conflicts_with against truth', () => {
    const view = buildKnowledgeGraphView(snapshot({
      truthFacts: [fact('t1')],
      factCandidates: [candidate('c1', { conflicts: ['t1', 'ghost'] })],
    }))

    const proposal = view.nodes.find((node) => node.id === 'proposal:c1')
    expect(proposal).toEqual(expect.objectContaining({ kind: 'proposal', derivation: 'deterministic' }))
    expect(view.edges).toEqual([
      expect.objectContaining({ from: 'proposal:c1', to: 'fact:t1', type: 'conflicts_with', synthetic: true }),
    ])
  })

  it('aggregates entities cited by two or more facts and links mentions', () => {
    const view = buildKnowledgeGraphView(snapshot({
      truthFacts: [
        fact('a', { concepts: ['shared', 'lonely-a'] }),
        fact('b', { concepts: ['shared', 'lonely-b'] }),
      ],
    }))

    const entity = view.nodes.find((node) => node.id === 'entity:shared')
    expect(entity).toEqual(expect.objectContaining({ kind: 'entity', label: 'shared' }))
    expect(view.nodes.some((node) => node.id === 'entity:lonely-a')).toBe(false)
    expect(view.edges.filter((edge) => edge.to === 'entity:shared')).toHaveLength(2)
  })

  it('maps stored truth edges and drops dangling endpoints', () => {
    const edge = (id: string, from: string, to: string): GraphEdge => ({
      id, from, to, type: 'depends_on', confidence: 0.7, sourceFactIds: [], workspaceId: 'ws-1', createdAt: '2026-07-12T00:00:00.000Z',
    })
    const view = buildKnowledgeGraphView(snapshot({
      truthFacts: [fact('a'), fact('b')],
      truthEdges: [edge('e1', 'a', 'b'), edge('e2', 'a', 'ghost')],
    }))

    expect(view.edges).toEqual([
      expect.objectContaining({ id: 'stored:e1', from: 'fact:a', to: 'fact:b', synthetic: false }),
    ])
  })

  it('keeps observations out by default and expands them one hop on demand', () => {
    const base = snapshot({
      truthFacts: [fact('a')],
      observations: [observation('obs-1'), observation('obs-2')],
    })
    const collapsed = buildKnowledgeGraphView(base)
    expect(collapsed.nodes.some((node) => node.kind === 'observation')).toBe(false)

    const expanded = buildKnowledgeGraphView(base, { expandedEvidence: ['fact:a'] })
    const obsNode = expanded.nodes.find((node) => node.id === 'observation:obs-1')
    expect(obsNode).toEqual(expect.objectContaining({ kind: 'observation', label: 'Observation obs-1' }))
    expect(expanded.edges).toContainEqual(
      expect.objectContaining({ from: 'fact:a', to: 'observation:obs-1', type: 'derived_from', synthetic: true }),
    )
    // Unknown observation ids never materialize nodes.
    expect(expanded.nodes.some((node) => node.id === 'observation:obs-2')).toBe(false)
  })

  it('caps nodes by kind priority and prunes dangling edges', () => {
    const facts = Array.from({ length: 4 }, (_, index) => fact(`f${index}`))
    const view = buildKnowledgeGraphView(
      snapshot({ truthFacts: facts }),
      { nodeLimit: 2 },
    )

    expect(view.truncated).toBe(true)
    expect(view.totalNodes).toBe(4)
    expect(view.nodes.map((node) => node.id)).toEqual(['fact:f0', 'fact:f1'])
    expect(view.edges).toEqual([])
  })

  it('derives inspector records for nodes and conflict edges', () => {
    const view = buildKnowledgeGraphView(snapshot({
      truthFacts: [fact('t1')],
      factCandidates: [candidate('c1', { conflicts: ['t1'] })],
    }))
    const proposal = view.nodes.find((node) => node.id === 'proposal:c1')!
    const record = recordForGraphNode(proposal)
    expect(record).toEqual(expect.objectContaining({
      id: 'proposal:c1',
      derivation: 'deterministic',
      factKind: 'fact',
      sourceIds: ['obs-1'],
    }))

    const conflict = view.edges.find((edge) => edge.type === 'conflicts_with')!
    const edgeRecord = recordForGraphEdge(conflict, view.nodes)
    expect(edgeRecord.title).toContain('conflicts_with')
    expect(edgeRecord.title).toContain('Fact t1 content')
    expect(edgeRecord.tags).toEqual(['conflicts_with'])
  })
})

describe('knowledge graph layout + persistence', () => {
  it('lays out deterministically by BFS depth with stable coordinates', () => {
    const view = buildKnowledgeGraphView(snapshot({
      truthFacts: [fact('a'), fact('b')],
      truthEdges: [{
        id: 'e1', from: 'a', to: 'b', type: 'depends_on', confidence: 0.7,
        sourceFactIds: [], workspaceId: 'ws-1', createdAt: '2026-07-12T00:00:00.000Z',
      }],
    }))
    const first = layoutKnowledgeGraph(view.nodes, view.edges)
    const second = layoutKnowledgeGraph(view.nodes, view.edges)

    expect([...first.entries()]).toEqual([...second.entries()])
    expect(first.get('fact:a')).toEqual({ x: 0, y: 0 })
    expect(first.get('fact:b')).toEqual({ x: 280, y: 0 })
  })

  it('resolves a single layout workspace and stable storage keys', () => {
    const view = buildKnowledgeGraphView(snapshot({ truthFacts: [fact('a')] }))
    expect(layoutWorkspaceFor(view.nodes)).toBe('ws-1')
    expect(layoutWorkspaceFor([...view.nodes, { ...view.nodes[0]!, id: 'fact:x', workspaceId: 'ws-2' }])).toBe('global')
    expect(graphLayoutStorageKey('ws-1')).toBe('janusx:knowledge-graph-layout:ws-1')
  })

  it('merges stored positions only for known nodes with finite coordinates', () => {
    const computed = new Map([['a', { x: 0, y: 0 }]])
    const merged = mergeStoredLayout(computed, {
      a: { x: 111, y: 222 },
      ghost: { x: 1, y: 1 },
      broken: { x: Number.NaN, y: 0 },
    } as never)

    expect(merged.get('a')).toEqual({ x: 111, y: 222 })
    expect(merged.has('ghost')).toBe(false)
    expect(loadStoredLayout('ws-missing-in-test')).toBeNull()
  })
})
