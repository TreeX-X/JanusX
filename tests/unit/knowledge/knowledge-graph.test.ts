import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeGraphView,
  graphWikiId,
  graphSourceId,
  graphLayoutStorageKey,
  graphNodeCaption,
  graphNodeDotSize,
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
  WikiPage,
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


function wiki(slug: string, overrides: Partial<WikiPage> = {}): WikiPage {
  return { slug, title: slug, markdown: 'Published body', workspaceId: 'ws-1', sourceFactIds: [],
    tags: [], status: 'published', freshness: 'current', version: 1, updatedAt: '2026-10-06', relationIssues: [], ...overrides }
}
const relation = (target: WikiPage, type: 'references' | 'depends_on' = 'references') => ({
  type, target: { workspaceId: target.workspaceId, slug: target.slug, title: target.title, version: target.version, contentHash: 'a'.repeat(64) },
  reason: 'Published reason', sourceFactIds: [],
})
const sourceId = (id: string) => graphSourceId('fact', 'ws-1', id)
function trace(data: KnowledgeWorkbenchSnapshot, options = {}) {
  const page = wiki('root', { sourceFactIds: data.truthFacts?.filter(f => f.provenance.workspaceId === 'ws-1').map(f => f.id) ?? [] })
  return buildKnowledgeGraphView({ ...data, wikiPages: [page] }, { traceWikiId: graphWikiId(page), ...options })
}

describe('Wiki graph projection and source tracing', () => {
  it('projects only published Wiki relationships, preserving direction and deduplicating replay', () => {
    const target = wiki('target')
    const source = wiki('source', { relations: [relation(target), relation(target)] })
    target.relations = [relation(source, 'depends_on')]
    const data = snapshot({ wikiPages: [source, target, wiki('draft', { status: 'draft' })],
      truthFacts: [fact('f', { files: ['shared'] })], factCandidates: [candidate('draft')],
      observations: [observation('obs-1')], truthEdges: [{ from: 'source', to: 'target' } as GraphEdge] })
    const view = buildKnowledgeGraphView(data)
    expect(view.nodes.map(n => n.kind)).toEqual(['wiki', 'wiki'])
    expect(view.edges).toHaveLength(2)
    expect(view.edges).toContainEqual(expect.objectContaining({ from: graphWikiId(source), to: graphWikiId(target), type: 'references' }))
    expect(buildKnowledgeGraphView({ ...data, wikiPages: [...data.wikiPages!].reverse() })).toEqual(view)
    expect(recordForGraphNode(view.nodes[0]!)).toMatchObject({ kind: 'wiki', body: 'Published body', pageSlug: 'source', workspaceId: 'ws-1' })
    expect(recordForGraphEdge(view.edges[0]!, view.nodes).body).toBe('Published reason')
  })

  it.each(['missing', 'ambiguous', 'changed', 'stale', 'invalid', 'unverified'] as const)('omits %s relations and explains why', status => {
    const target = wiki('target')
    const source = wiki('source', { relations: [relation(target)], relationIssues: status === 'unverified' ? undefined : [{ targetSlug: 'target', type: 'references', status }] })
    const view = buildKnowledgeGraphView(snapshot({ wikiPages: [source, target] }))
    expect(view.edges).toEqual([])
    expect(view.diagnostics[0]?.status).toBe(status)
  })

  it('checks workspace, target version, publication and duplicate identities independently of diagnostics', () => {
    const target = wiki('target'), source = wiki('source', { relations: [relation(target)] })
    for (const targets of [[], [{ ...target, version: 2 }], [{ ...target, status: 'draft' as const }], [target, target], [{ ...target, freshness: 'stale' as const }]]) {
      const view = buildKnowledgeGraphView(snapshot({ wikiPages: [source, ...targets] }))
      expect(view.edges).toEqual([])
      expect(view.diagnostics.length).toBeGreaterThan(0)
    }
    const foreign = wiki('target', { workspaceId: 'ws-2' })
    source.relations = [relation(foreign)]
    expect(buildKnowledgeGraphView(snapshot({ wikiPages: [source, foreign] })).edges).toEqual([])
    expect(buildKnowledgeGraphView(snapshot({ wikiPages: [target, foreign] })).nodes).toHaveLength(2)
    expect(buildKnowledgeGraphView(snapshot({ wikiPages: [wiki('private', { workspaceId: 'user' })] })).nodes).toEqual([])
  })

  it('builds facts and entities before resolving replacements and legacy edges, regardless of input order', () => {
    const facts = [fact('new', { supersedes: 'old', concepts: ['shared'] }), fact('old', { files: ['shared'] })]
    const edge: GraphEdge = { id: 'e', from: 'new', to: 'shared', type: 'implemented_in', workspaceId: 'ws-1', confidence: 1, sourceFactIds: [], createdAt: '' }
    const data = snapshot({ truthFacts: facts, truthEdges: [edge, { ...edge, id: 'missing', to: 'ghost' }] })
    const view = trace(data)
    expect(view.edges).toContainEqual(expect.objectContaining({ from: sourceId('new'), to: sourceId('old'), type: 'supersedes' }))
    expect(view.edges).toContainEqual(expect.objectContaining({ from: sourceId('new'), to: graphSourceId('entity', 'ws-1', 'shared'), type: 'implemented_in' }))
    expect(view.diagnostics).toContainEqual({ status: 'missing', target: 'ghost' })
    expect(trace({ ...data, truthFacts: [...facts].reverse() })).toEqual(view)
    expect(recordForGraphNode(view.nodes.find(n => n.id === sourceId('new'))!)).toMatchObject({ id: 'new', kind: 'fact' })
  })

  it('isolates same-named facts, files and old edges by workspace in evidence views', () => {
    const data = snapshot({ truthFacts: [fact('a', { files: ['shared'] }), fact('a', { files: ['shared'], provenance: provenance('ws-2') })],
      truthEdges: [{ id: 'foreign', workspaceId: 'ws-2', from: 'a', to: 'shared' } as GraphEdge] })
    const view = trace(data)
    expect(view.nodes.every(n => n.workspaceId === 'ws-1')).toBe(true)
    expect(view.nodes.filter(n => n.kind === 'fact')).toHaveLength(1)
    expect(view.edges.some(e => e.id === 'stored:foreign')).toBe(false)
  })

  it('loads evidence only by explicit scoped results, with missing, not-loaded and revoked diagnostics', () => {
    const data = snapshot({ truthFacts: [fact('a')], observations: [observation('obs-1')] })
    const expandedEvidence = [sourceId('a')]
    expect(trace(data).nodes.some(n => n.kind === 'observation')).toBe(false)
    expect(trace(data, { expandedEvidence }).diagnostics).toContainEqual({ status: 'not-loaded', target: 'obs-1' })
    const evidence = [{ id: 'obs-1', workspaceId: 'ws-1', status: 'available', content: 'Original evidence' }]
    const view = trace(data, { expandedEvidence, evidence })
    expect(view.nodes.find(n => n.kind === 'observation')?.record?.body).toBe('Original evidence')
    expect(view.edges.some(e => e.to === graphSourceId('observation', 'ws-1', 'obs-1'))).toBe(true)
    for (const status of ['unavailable', 'revoked']) expect(trace(data, { expandedEvidence, evidence: [{ ...evidence[0], status }] }).diagnostics).toContainEqual({ status, target: 'obs-1' })
    expect(trace(data, { expandedEvidence, evidence: [{ ...evidence[0], workspaceId: 'ws-2' }] }).nodes.some(n => n.kind === 'observation')).toBe(false)
  })

  it('reports truncation separately and never returns dangling edges', () => {
    const target = wiki('z'), pages = [wiki('a', { relations: [relation(target)] }), target, wiki('b')]
    const view = buildKnowledgeGraphView(snapshot({ wikiPages: pages }), { nodeLimit: 2 })
    expect(view).toMatchObject({ truncated: true, totalNodes: 3, edges: [], diagnostics: [] })
    expect(view.nodes.map(n => n.label)).toEqual(['a', 'b'])
  })
})

describe('knowledge graph layout + persistence', () => {
  it('lays out deterministically with finite coordinates', () => {
    const view = trace(snapshot({
      truthFacts: [fact('a'), fact('b')],
      truthEdges: [{
        id: 'e1', from: 'a', to: 'b', type: 'depends_on', confidence: 0.7,
        sourceFactIds: [], workspaceId: 'ws-1', createdAt: '2026-07-12T00:00:00.000Z',
      }],
    }))
    const first = layoutKnowledgeGraph(view.nodes, view.edges)
    const second = layoutKnowledgeGraph(view.nodes, view.edges)

    expect(first.size).toBe(view.nodes.length)
    expect([...first.entries()]).toEqual([...second.entries()])
    for (const position of first.values()) {
      expect(Number.isFinite(position.x)).toBe(true)
      expect(Number.isFinite(position.y)).toBe(true)
    }
  })

  it('keeps linked nodes closer than nodes from other components', () => {
    const view = trace(snapshot({
      truthFacts: [fact('a'), fact('b'), fact('lone')],
      truthEdges: [{
        id: 'e1', from: 'a', to: 'b', type: 'depends_on', confidence: 0.7,
        sourceFactIds: [], workspaceId: 'ws-1', createdAt: '2026-07-12T00:00:00.000Z',
      }],
    }))
    const layout = layoutKnowledgeGraph(view.nodes, view.edges)
    const distance = (x: string, y: string) => {
      const a = layout.get(x)!
      const b = layout.get(y)!
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    expect(distance(sourceId('a'), sourceId('b'))).toBeLessThan(distance(sourceId('a'), sourceId('lone')))
  })

  it('derives short dot captions and degree-sized dots', () => {
    expect(graphNodeCaption('short label')).toBe('short label')
    expect(graphNodeCaption(`\n  spaced title  \nsecond line`)).toBe('spaced title')
    expect(graphNodeCaption('x'.repeat(40))).toBe(`${'x'.repeat(23)}…`)
    expect(graphNodeCaption('')).toBe('')

    expect(graphNodeDotSize(0)).toBe(10)
    expect(graphNodeDotSize(3)).toBe(16)
    expect(graphNodeDotSize(100)).toBe(22)
  })

  it('resolves a single layout workspace and stable storage keys', () => {
    const view = trace(snapshot({ truthFacts: [fact('a')] }))
    expect(layoutWorkspaceFor(view.nodes)).toBe('ws-1')
    expect(layoutWorkspaceFor([...view.nodes, { ...view.nodes[0]!, id: 'fact:x', workspaceId: 'ws-2' }])).toBe('global')
    expect(graphLayoutStorageKey('ws-1')).toBe('janusx:knowledge-graph-layout:v2:ws-1')
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
