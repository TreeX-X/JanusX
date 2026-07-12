import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
})
