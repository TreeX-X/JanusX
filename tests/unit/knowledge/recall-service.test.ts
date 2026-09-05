import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { KnowledgeContextService } from '../../../src/main/knowledge/context-service'
import { KnowledgeRecallService } from '../../../src/main/knowledge/recall-service'
import { KnowledgeSearchService } from '../../../src/main/knowledge/search-service'
import type {
  CandidateFact,
  KnowledgeTruthSnapshot,
  MemoryFact,
  Observation,
} from '../../../src/shared/knowledge'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

function fact(id: string, content: string): MemoryFact {
  return {
    id,
    content,
    concepts: ['unified', 'recall'],
    files: [],
    tags: ['truth'],
    confidence: 0.9,
    version: 1,
    status: 'active',
    provenance: {
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspacePath: 'C:/workspace-a',
      source: 'manual',
      sourceObservationIds: [`obs-${id}`],
      fileRefs: [`src/${id}.ts`],
      actor: 'tester',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
  }
}

function sources(snapshot: KnowledgeTruthSnapshot, candidates: CandidateFact[] = []) {
  const observation: Observation = {
    id: 'observation-governance',
    workspaceId: 'workspace-a',
    workspaceName: 'Workspace A',
    workspacePath: 'C:/workspace-a',
    source: 'manual',
    type: 'user-note',
    content: 'governance-only evidence token',
    fileRefs: [],
    tags: [],
    visibility: 'workspace',
    actor: 'tester',
    createdAt: '2026-07-12T00:00:00.000Z',
  }
  return {
    listTruth: async () => snapshot,
    listObservations: async () => [observation],
    resolveObservationContent: async () => observation.content,
    readCandidates: async <T,>(path: string) =>
      path === 'facts/candidates.jsonl' ? candidates as T[] : [],
  }
}

describe('KnowledgeRecallService', () => {
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT
  let knowledgeRoot: string

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-recall-root-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
  })

  it('isolates truth from governance while governance includes evidence and candidates', async () => {
    const accepted = fact('accepted', 'accepted truth token')
    const candidate: CandidateFact = {
      id: 'candidate',
      type: 'fact',
      status: 'proposed',
      fact: { ...fact('candidate-fact', 'governance-only candidate token'), status: 'proposed' },
    }
    const recall = new KnowledgeRecallService(sources({
      facts: [accepted],
      wikiPages: [],
      graphEdges: [],
    }, [candidate]))

    const truth = await recall.recall({
      query: 'governance-only',
      layer: 'truth',
      workspaceId: 'workspace-a',
    })
    const governance = await recall.recall({
      query: 'governance-only',
      layer: 'governance',
      workspaceId: 'workspace-a',
    })

    expect(truth.documents).toEqual([])
    expect(governance.documents.map((document) => document.hit.type).sort()).toEqual([
      'fact-candidate',
      'observation',
    ])
  })

  it('excludes rejected and applied candidates from governance recall', async () => {
    const proposed: CandidateFact = {
      id: 'candidate-proposed',
      type: 'fact',
      status: 'proposed',
      fact: { ...fact('fact-proposed', 'candidate lifecycle token'), status: 'proposed' },
    }
    const rejected: CandidateFact = {
      ...proposed,
      id: 'candidate-rejected',
      status: 'rejected',
      fact: { ...proposed.fact, id: 'fact-rejected' },
    }
    const applied: CandidateFact = {
      ...proposed,
      id: 'candidate-applied',
      status: 'applied',
      fact: { ...proposed.fact, id: 'fact-applied' },
    }
    const recall = new KnowledgeRecallService(sources({
      facts: [],
      wikiPages: [],
      graphEdges: [],
    }, [proposed, rejected, applied]))

    const result = await recall.recall({
      query: 'candidate lifecycle',
      layer: 'governance',
      workspaceId: 'workspace-a',
      types: ['fact-candidate'],
    })

    expect(result.documents.map((document) => document.hit.id)).toEqual(['candidate-proposed'])
  })

  it('recalls accepted facts, published wiki pages, and accepted graph edges', async () => {
    const recall = new KnowledgeRecallService(sources({
      facts: [fact('fact-a', 'unified recall truth')],
      wikiPages: [{
        slug: 'wiki-a',
        title: 'Unified Recall Wiki',
        markdown: 'unified recall truth',
        tags: [],
        status: 'published',
        sourceFactIds: ['fact-a'],
        updatedAt: '2026-07-12T00:00:00.000Z',
        version: 1,
        workspaceId: 'workspace-a',
      }],
      graphEdges: [{
        id: 'graph-a',
        from: 'Recall',
        to: 'Truth',
        type: 'depends_on',
        confidence: 0.8,
        sourceFactIds: ['fact-a'],
        workspaceId: 'workspace-a',
        createdAt: '2026-07-12T00:00:00.000Z',
      }],
    }))

    const result = await recall.recall({
      query: 'unified recall truth',
      layer: 'truth',
      workspaceId: 'workspace-a',
    })

    expect(result.documents.map((document) => document.hit.type).sort()).toEqual([
      'graph-edge',
      'memory-fact',
      'wiki-page',
    ])
  })

  it('keeps search and context adapters in the same truth ranking order', async () => {
    const snapshot = {
      facts: [fact('fact-a', 'shared adapter recall'), fact('fact-b', 'shared adapter recall detail')],
      wikiPages: [],
      graphEdges: [],
    }
    const recall = new KnowledgeRecallService(sources(snapshot))
    const search = new KnowledgeSearchService(recall)
    const context = new KnowledgeContextService({ list: async () => snapshot }, recall)

    const searchResult = await search.search({
      query: 'shared adapter recall',
      workspaceId: 'workspace-a',
      types: ['memory-fact'],
    })
    const contextResult = await context.search({
      query: 'shared adapter recall',
      workspaceId: 'workspace-a',
    })

    expect(searchResult.hits.map((hit) => hit.id)).toEqual(
      contextResult.items.map((item) => item.id),
    )
  })

  it('ranks an exact title phrase ahead of incidental body repetition', async () => {    const recall = new KnowledgeRecallService(sources({
      facts: [fact('body-heavy', 'release protocol release protocol release protocol incidental detail')],
      wikiPages: [{
        slug: 'release-protocol', title: 'Release Protocol', markdown: 'short operational guide',
        tags: [], status: 'published', sourceFactIds: [], updatedAt: '2026-07-12T00:00:00.000Z',
        version: 1, workspaceId: 'workspace-a',
      }],
      graphEdges: [],
    }))

    const result = await recall.recall({ query: 'release protocol', layer: 'truth', workspaceId: 'workspace-a' })

    expect(result.documents[0]?.hit.id).toBe('release-protocol')
    expect(result.documents[0]?.scoreExplanation.exactTitle).toBe(3)
    expect(result.documents[0]?.scoreExplanation.bodyPhrase).toBe(0)
  })

  it('ranks a wiki slug match ahead of repeated body mentions', async () => {
    const recall = new KnowledgeRecallService(sources({
      facts: [fact('heavy', 'crane crane crane overview')],
      wikiPages: [{
        slug: 'harbor-crane', title: 'Dock Manual', markdown: 'crane safety rules apply',
        tags: [], status: 'published', sourceFactIds: [], updatedAt: '2026-07-12T00:00:00.000Z',
        version: 1, workspaceId: 'workspace-a',
      }],
      graphEdges: [],
    }))

    const result = await recall.recall({ query: 'harbor crane', layer: 'truth', workspaceId: 'workspace-a' })

    expect(result.documents[0]?.hit.id).toBe('harbor-crane')
    expect(result.documents[0]?.scoreExplanation.slugMatch).toBe(2)
  })

  it('rewards partial query-term overlap in wiki titles', async () => {
    const recall = new KnowledgeRecallService(sources({
      facts: [fact('heavy', 'harbor harbor harbor dock')],
      wikiPages: [{
        slug: 'dock-manual', title: 'Dock Manual', markdown: 'harbor crane safety rules',
        tags: [], status: 'published', sourceFactIds: [], updatedAt: '2026-07-12T00:00:00.000Z',
        version: 1, workspaceId: 'workspace-a',
      }],
      graphEdges: [],
    }))

    const result = await recall.recall({ query: 'harbor manual', layer: 'truth', workspaceId: 'workspace-a' })

    expect(result.documents[0]?.hit.id).toBe('dock-manual')
    expect(result.documents[0]?.scoreExplanation.titleTerm).toBeCloseTo(0.6)
    expect(result.documents[0]?.scoreExplanation.slugMatch).toBe(0)
  })

  it('inherits wiki file and observation provenance from linked facts', async () => {
    const recall = new KnowledgeRecallService(sources({
      facts: [fact('fact-a', 'unified recall truth')],
      wikiPages: [{
        slug: 'wiki-a',
        title: 'Unified Recall Wiki',
        markdown: 'unified recall truth',
        tags: [],
        status: 'published',
        sourceFactIds: ['fact-a'],
        updatedAt: '2026-07-12T00:00:00.000Z',
        version: 1,
        workspaceId: 'workspace-a',
      }],
      graphEdges: [],
    }))

    const result = await recall.recall({ query: 'unified recall', layer: 'truth', workspaceId: 'workspace-a' })
    const wiki = result.documents.find((document) => document.hit.id === 'wiki-a')!

    expect(wiki.hit.fileRefs).toEqual(['src/fact-a.ts'])
    expect(wiki.hit.workspacePath).toBe('C:/workspace-a')
    expect(wiki.hit.sourceObservationIds).toEqual(['obs-fact-a'])
    expect(wiki.contextItem?.provenance.fileRefs).toEqual(['src/fact-a.ts'])
    expect(wiki.contextItem?.provenance.observationIds).toEqual(['obs-fact-a'])
  })

  it('excerptAroundQuery keeps the match in view for long pages', async () => {
    const { excerptAroundQuery } = await import('../../../src/main/knowledge/recall-service')

    expect(excerptAroundQuery('short page', 'query')).toBe('short page')
    const long = `${'filler '.repeat(600)}needle${' filler'.repeat(600)}`
    const excerpt = excerptAroundQuery(long, 'needle')
    expect(excerpt.length).toBeLessThanOrEqual(1500)
    expect(excerpt).toContain('needle')
    expect(excerpt.startsWith('…')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
    const headless = excerptAroundQuery(long, 'absent-term-xyz')
    expect(headless.endsWith('…')).toBe(true)
    expect(headless.startsWith('…')).toBe(false)
  })
})
