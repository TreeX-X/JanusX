import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { KnowledgeContextService } from '../../../src/main/knowledge/context-service'
import {
  capObservationsPerWorkspace,
  confidenceBoostFor,
  freshnessBoostFor,
  KnowledgeRecallService,
  recallFilterKey,
  RECALL_RANKER,
} from '../../../src/main/knowledge/recall-service'
import {
  hasEmbeddingProvider,
  resolveEmbeddingProvider,
} from '../../../src/main/knowledge/search/embedding-provider'
import type {
  CandidateFact,
  KnowledgeTruthSnapshot,
  MemoryFact,
  Observation,
} from '../../../src/shared/knowledge'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

const FIXED_NOW = Date.parse('2026-09-04T00:00:00.000Z')

function fact(id: string, content: string, overrides: Partial<MemoryFact> = {}): MemoryFact {
  return {
    id,
    content,
    concepts: ['phase3'],
    files: [],
    tags: [],
    confidence: 0.9,
    version: 1,
    status: 'active',
    kind: 'fact',
    provenance: {
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspacePath: 'C:/workspace-a',
      source: 'manual',
      sourceObservationIds: [`obs-${id}`],
      fileRefs: [],
      actor: 'tester',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
    ...overrides,
  }
}

function observation(id: string, overrides: Partial<Observation> = {}): Observation {
  return {
    id,
    workspaceId: 'workspace-a',
    workspaceName: 'Workspace A',
    workspacePath: 'C:/workspace-a',
    source: 'manual',
    type: 'user-note',
    content: `phase3 evidence ${id}`,
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
    ...overrides,
  }
}

function sources(snapshot: KnowledgeTruthSnapshot, observations: Observation[] = [], candidates: CandidateFact[] = []) {
  return {
    listTruth: async () => snapshot,
    listObservations: async () => observations,
    listAllObservations: async () => observations,
    resolveObservationContent: async (obs: Observation) => obs.content,
    readCandidates: async <T,>(path: string) =>
      (path === 'facts/candidates.jsonl' ? candidates as T[] : []),
  }
}

describe('Phase3 retrieval', () => {
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT
  let knowledgeRoot: string

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-phase3-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
  })

  it('decays engineering strength on a warm index and excludes facts at their expiry', async () => {
    let now = FIXED_NOW
    const snapshot = { facts: [
      fact('warm', 'phase3 strength', { recallState: { strength: 0.8, anchorAt: new Date(now).toISOString(), lastAccessAt: new Date(now).toISOString(), recentRequests: [] } }),
      fact('cold', 'phase3 strength', { habitStrength: 0.1 }),
      fact('expires', 'phase3 strength', { ttl: new Date(now + 1).toISOString() }),
      fact('archived', 'phase3 strength', { status: 'archived' }),
      fact('invalid-ttl', 'phase3 strength', { ttl: 'invalid' }),
    ], wikiPages: [], graphEdges: [] }
    const recall = new KnowledgeRecallService(sources(snapshot), () => now)
    const request = { query: 'phase3 strength', layer: 'truth' as const, workspaceId: 'workspace-a' }
    const first = await recall.recall(request)
    expect(first.documents[0]!.hit.id).toBe('warm')
    expect(first.documents).toHaveLength(3)
    expect(first.documents[0]!.scoreExplanation.strengthBoost).toBe(0.4)
    const builtAt = recall.getLastIndexBuildAt()
    now += 30 * 86400000
    const later = await recall.recall(request)
    expect(later.documents.find(doc => doc.hit.id === 'warm')!.scoreExplanation.strengthBoost).toBe(0.2)
    expect(later.documents.some(doc => doc.hit.id === 'expires')).toBe(false)
    expect(recall.getLastIndexBuildAt()).toBe(builtAt)
    const restarted = await new KnowledgeRecallService(sources(snapshot), () => now).recall(request)
    expect(later.documents.map(doc => [doc.hit.id, doc.score])).toEqual(restarted.documents.map(doc => [doc.hit.id, doc.score]))
    expect(snapshot.facts[0]!.version).toBe(1)
    expect(snapshot.facts[0]!.status).toBe('active')
  })

  it('creates receipts only for engineering facts surviving the final context budget', async () => {
    const snapshot = { facts: [fact('one', 'phase3 receipt'), fact('two', 'phase3 receipt')], wikiPages: [], graphEdges: [] }
    const context = new KnowledgeContextService({ list: async () => snapshot })
    const result = await context.search({ query: 'phase3 receipt', workspaceId: 'workspace-a', maxItems: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.projectMemoryDelivery).toMatchObject({ scope: 'project', section: result.compactContext,
      facts: [{ id: result.items[0]!.id, workspaceId: 'workspace-a', hash: expect.stringMatching(/^[a-f0-9]{64}$/) }] })
    const clipped = await context.search({ query: 'phase3 receipt', workspaceId: 'workspace-a', maxChars: 1 })
    expect(clipped.projectMemoryDelivery!.facts).toEqual([])
    expect(snapshot.facts.every(item => !item.recallState)).toBe(true)
  })

  it('ranks higher confidence first on otherwise identical text', async () => {
    const recall = new KnowledgeRecallService(sources({
      facts: [
        fact('low', 'phase3 identical ranking text', { confidence: 0.1 }),
        fact('high', 'phase3 identical ranking text', { confidence: 0.95 }),
      ],
      wikiPages: [],
      graphEdges: [],
    }), () => FIXED_NOW)

    const result = await recall.recall({ query: 'phase3 identical ranking', layer: 'truth', workspaceId: 'workspace-a' })

    expect(result.documents.map((d) => d.hit.id)).toEqual(['high', 'low'])
    const [first, second] = result.documents
    expect(first?.scoreExplanation.confidenceBoost).toBeGreaterThan(second?.scoreExplanation.confidenceBoost ?? 0)
    expect(first?.scoreExplanation).toEqual(expect.objectContaining({
      bm25: expect.any(Number),
      exactTitle: expect.any(Number),
      titlePhrase: expect.any(Number),
      bodyPhrase: expect.any(Number),
      confidenceBoost: expect.any(Number),
      freshnessBoost: expect.any(Number),
    }))
    const explained = Object.values(first?.scoreExplanation ?? {}).reduce((a, b) => a + b, 0)
    expect(first?.score).toBeCloseTo(explained, 10)
  })

  it('ranks fresher records first on otherwise identical text', async () => {
    const recall = new KnowledgeRecallService(sources({
      facts: [
        fact('stale', 'phase3 freshness ranking text', {
          provenance: { ...fact('x', 'y').provenance, createdAt: '2025-01-01T00:00:00.000Z' },
        }),
        fact('fresh', 'phase3 freshness ranking text', {
          provenance: { ...fact('x', 'y').provenance, createdAt: '2026-09-01T00:00:00.000Z' },
        }),
      ],
      wikiPages: [],
      graphEdges: [],
    }), () => FIXED_NOW)

    const result = await recall.recall({ query: 'phase3 freshness ranking', layer: 'truth', workspaceId: 'workspace-a' })

    expect(result.documents.map((d) => d.hit.id)).toEqual(['fresh', 'stale'])
    expect(result.documents[0]?.scoreExplanation.freshnessBoost)
      .toBeGreaterThan(result.documents[1]?.scoreExplanation.freshnessBoost ?? 0)
  })

  it('computes pure boost helpers on known values', () => {
    expect(confidenceBoostFor(0.9)).toBeCloseTo(0.45, 10)
    expect(confidenceBoostFor(undefined)).toBeCloseTo(0.25, 10)
    expect(confidenceBoostFor(2)).toBeCloseTo(0.5, 10)
    // Same-day record gets the full freshness weight; half-life decays it.
    expect(freshnessBoostFor('2026-09-04T00:00:00.000Z', FIXED_NOW)).toBeCloseTo(0.5, 10)
    expect(freshnessBoostFor('2026-03-08T00:00:00.000Z', FIXED_NOW)).toBeCloseTo(0.25, 10)
    expect(freshnessBoostFor('not-a-date', FIXED_NOW)).toBe(0)
    // Millisecond jitter inside one day must not move the boost.
    expect(freshnessBoostFor('2026-09-01T00:00:00.000Z', FIXED_NOW))
      .toBe(freshnessBoostFor('2026-09-01T00:00:00.000Z', FIXED_NOW + 3_600_000))
  })

  it('filters observations by agent and session while truth stays shared', async () => {
    const recall = new KnowledgeRecallService(sources(
      { facts: [fact('shared-truth', 'phase3 agent shared truth token')], wikiPages: [], graphEdges: [] },
      [
        observation('obs-agent-a', { content: 'phase3 agent filter token alpha', agentId: 'agent-a', sessionId: 's-1' }),
        observation('obs-agent-b', { content: 'phase3 agent filter token alpha', agentId: 'agent-b', sessionId: 's-2' }),
      ],
    ), () => FIXED_NOW)

    const byAgent = await recall.recall({
      query: 'phase3 agent filter token',
      layer: 'governance',
      workspaceId: 'workspace-a',
      agentId: 'agent-a',
    })
    const obsIds = byAgent.documents.filter((d) => d.hit.type === 'observation').map((d) => d.hit.id)
    expect(obsIds).toEqual(['obs-agent-a'])
    // Curated truth is shared across agents and still visible.
    expect(byAgent.documents.map((d) => d.hit.id)).toContain('shared-truth')
    for (const doc of byAgent.documents.filter((d) => d.hit.type === 'observation')) {
      expect(doc.hit.agentId).toBe('agent-a')
    }

    const bySession = await recall.recall({
      query: 'phase3 agent filter token',
      layer: 'governance',
      workspaceId: 'workspace-a',
      sessionId: 's-2',
    })
    expect(bySession.documents.filter((d) => d.hit.type === 'observation').map((d) => d.hit.id))
      .toEqual(['obs-agent-b'])
  })

  it('filters every document kind by time bounds', async () => {
    const recall = new KnowledgeRecallService(sources({
      facts: [
        fact('old-fact', 'phase3 time bound token', {
          provenance: { ...fact('x', 'y').provenance, createdAt: '2026-01-01T00:00:00.000Z' },
        }),
        fact('new-fact', 'phase3 time bound token', {
          provenance: { ...fact('x', 'y').provenance, createdAt: '2026-08-01T00:00:00.000Z' },
        }),
      ],
      wikiPages: [],
      graphEdges: [],
    }), () => FIXED_NOW)

    const since = await recall.recall({
      query: 'phase3 time bound',
      layer: 'truth',
      workspaceId: 'workspace-a',
      since: '2026-06-01T00:00:00.000Z',
    })
    expect(since.documents.map((d) => d.hit.id)).toEqual(['new-fact'])

    const until = await recall.recall({
      query: 'phase3 time bound',
      layer: 'truth',
      workspaceId: 'workspace-a',
      until: '2026-06-01T00:00:00.000Z',
    })
    expect(until.documents.map((d) => d.hit.id)).toEqual(['old-fact'])
  })

  it('exposes candidate derivation on hits', async () => {
    const candidate: CandidateFact = {
      id: 'candidate-llm',
      type: 'fact',
      status: 'proposed',
      fact: { ...fact('fact-llm', 'phase3 derivation llm token'), status: 'proposed' },
      derivation: 'llm',
      evidence: { observationIds: ['obs-1'] },
    }
    const recall = new KnowledgeRecallService(
      sources({ facts: [], wikiPages: [], graphEdges: [] }, [], [candidate]),
      () => FIXED_NOW,
    )

    const result = await recall.recall({
      query: 'phase3 derivation llm',
      layer: 'governance',
      workspaceId: 'workspace-a',
      types: ['fact-candidate'],
    })

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]?.hit.derivation).toBe('llm')
  })

  it('caps observations per workspace instead of globally', () => {
    const noisy = Array.from({ length: 10 }, (_, i) =>
      observation(`noisy-${i}`, { workspaceId: 'ws-noisy', createdAt: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }))
    const quiet = [observation('quiet-1', { workspaceId: 'ws-quiet' })]
    const capped = capObservationsPerWorkspace([...noisy, ...quiet], 3)

    expect(capped.filter((o) => o.workspaceId === 'ws-noisy')).toHaveLength(3)
    expect(capped.filter((o) => o.workspaceId === 'ws-quiet')).toHaveLength(1)
    // Newest-first within the capped workspace.
    expect(capped.filter((o) => o.workspaceId === 'ws-noisy').map((o) => o.id))
      .toEqual(['noisy-9', 'noisy-8', 'noisy-7'])
  })

  it('keeps a quiet workspace visible when another workspace is noisy', async () => {
    const noisy = Array.from({ length: 8 }, (_, i) =>
      observation(`noisy-${i}`, {
        workspaceId: 'ws-noisy',
        workspaceName: 'Noisy',
        workspacePath: 'C:/noisy',
        content: `noisy filler token ${i}`,
        createdAt: '2026-08-15T00:00:00.000Z',
      }))
    const quiet = [observation('quiet-target', {
      workspaceId: 'ws-quiet',
      workspaceName: 'Quiet',
      workspacePath: 'C:/quiet',
      content: 'quiet unique recall token persists',
    })]
    const recall = new KnowledgeRecallService(
      sources({ facts: [], wikiPages: [], graphEdges: [] }, [...noisy, ...quiet]),
      () => FIXED_NOW,
    )

    const result = await recall.recall({
      query: 'quiet unique recall token',
      layer: 'governance',
      workspaceId: 'ws-quiet',
    })

    expect(result.documents.map((d) => d.hit.id)).toContain('quiet-target')
  })

  it('tracks the last index build time for §6 freshness metrics', async () => {
    const recall = new KnowledgeRecallService(
      sources({ facts: [], wikiPages: [], graphEdges: [] }),
      () => FIXED_NOW,
    )
    expect(recall.getLastIndexBuildAt()).toBeNull()

    await recall.recall({ query: 'phase3', layer: 'truth', workspaceId: 'workspace-a' })
    expect(recall.getLastIndexBuildAt()).toBe(new Date(FIXED_NOW).toISOString())

    // Cache hit rebuilds nothing: the stamp must not move.
    await recall.recall({ query: 'phase3 again', layer: 'truth', workspaceId: 'workspace-a' })
    expect(recall.getLastIndexBuildAt()).toBe(new Date(FIXED_NOW).toISOString())
  })

  it('builds stable filter keys and stays on the BM25 ranker without embeddings', async () => {
    const base = { query: 'q', layer: 'governance' as const, workspaceId: 'workspace-a' }
    expect(recallFilterKey(base)).toBe(recallFilterKey({ ...base }))
    expect(recallFilterKey(base)).not.toBe(recallFilterKey({ ...base, workspaceId: 'workspace-b' }))
    expect(recallFilterKey(base)).not.toBe(recallFilterKey({ ...base, agentId: 'agent-a' }))
    expect(RECALL_RANKER).toBe('bm25')
    await expect(resolveEmbeddingProvider()).resolves.toBeNull()
    expect(hasEmbeddingProvider(null)).toBe(false)
  })
})
