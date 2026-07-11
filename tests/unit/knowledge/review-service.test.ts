import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  KnowledgeProvenance,
  MemoryFact,
} from '../../../src/shared/knowledge'

async function loadService() {
  // Ensure knowledgeRootPath() sees the temp env for this module load.
  return import('../../../src/main/knowledge/review-service')
}

function provenance(overrides: Partial<KnowledgeProvenance> = {}): KnowledgeProvenance {
  return {
    workspaceId: 'ws-id',
    workspaceName: 'ws-name',
    workspacePath: 'C:/work',
    source: 'manual',
    sourceObservationIds: ['obs-1'],
    fileRefs: ['src/a.ts'],
    actor: 'tester',
    createdAt: '2026-07-07T00:00:00.000Z',
    ...overrides,
  }
}

function makeFactCandidate(overrides: Partial<CandidateFact> = {}): CandidateFact {
  const fact: MemoryFact = {
    id: 'memory-fact-1',
    content: 'Use Postgres for persistence.',
    concepts: ['postgres'],
    files: ['src/db.ts'],
    tags: ['design'],
    confidence: 0.9,
    version: 1,
    status: 'proposed',
    provenance: provenance(),
  }
  return {
    id: 'cand-fact-1',
    type: 'fact',
    status: 'proposed',
    fact,
    ...overrides,
  }
}

function makeWikiCandidate(overrides: Partial<CandidateWikiPatch> = {}): CandidateWikiPatch {
  return {
    id: 'cand-wiki-1',
    type: 'wiki-patch',
    status: 'proposed',
    pageSlug: 'persistence-design',
    title: 'Persistence Design',
    patchMarkdown: '## Postgres\n- chosen for durability',
    rationale: 'records design decision',
    confidence: 0.85,
    provenance: provenance(),
    ...overrides,
  }
}

function makeGraphCandidate(overrides: Partial<CandidateGraphEdge> = {}): CandidateGraphEdge {
  return {
    id: 'cand-edge-1',
    type: 'graph-edge',
    status: 'proposed',
    edge: {
      id: 'edge-1',
      from: 'persistence',
      to: 'postgres',
      type: 'implemented_in',
      confidence: 0.8,
      sourceFactIds: ['memory-fact-1'],
      workspaceId: 'ws-id',
      createdAt: '2026-07-07T00:00:00.000Z',
    },
    ...overrides,
  }
}

async function seedJsonl(relativePath: string, records: unknown[]): Promise<void> {
  const root = process.env.JANUSX_KNOWLEDGE_ROOT!
  const absolutePath = join(root, relativePath)
  await mkdir(join(absolutePath, '..'), { recursive: true })
  const body = records.map((record) => JSON.stringify(record)).join('\n')
  await writeFile(absolutePath, body.length > 0 ? `${body}\n` : '', 'utf8')
}

async function readJsonl<T>(relativePath: string): Promise<T[]> {
  const absolutePath = join(process.env.JANUSX_KNOWLEDGE_ROOT!, relativePath)
  const content = await readFile(absolutePath, 'utf8')
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

describe('KnowledgeReviewService', () => {
  let knowledgeRoot: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-review-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) {
      delete process.env.JANUSX_KNOWLEDGE_ROOT
    } else {
      process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    }
  })

  it('rejects a proposed fact and writes candidate_rejected audit', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.rejectCandidate({
      type: 'fact',
      id: candidate.id,
      reviewNotes: 'not durable enough',
    })

    expect(result.candidate.status).toBe('rejected')
    expect(result.candidate.reviewNotes).toBe('not durable enough')
    expect(result.auditEvents).toHaveLength(1)
    expect(result.auditEvents[0]?.action).toBe('candidate_rejected')

    const stored = await readJsonl<CandidateFact>('facts/candidates.jsonl')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.status).toBe('rejected')
    expect(stored[0]?.reviewNotes).toBe('not durable enough')
  })

  it('applies a proposed fact into facts.jsonl with approved+applied audits', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate({
      type: 'fact',
      id: candidate.id,
    })

    expect(result.candidate.status).toBe('applied')
    expect(result.applied?.fact?.status).toBe('active')
    expect(result.applied?.fact?.content).toBe(candidate.fact.content)
    expect(result.auditEvents.map((event) => event.action)).toEqual([
      'candidate_approved',
      'candidate_applied',
    ])

    const candidates = await readJsonl<CandidateFact>('facts/candidates.jsonl')
    expect(candidates[0]?.status).toBe('applied')

    const facts = await readJsonl<MemoryFact>('facts/facts.jsonl')
    expect(facts).toHaveLength(1)
    expect(facts[0]?.id).toBe(candidate.fact.id)
    expect(facts[0]?.status).toBe('active')
  })

  it('applies a graph-edge candidate into edges.jsonl', async () => {
    const candidate = makeGraphCandidate()
    await seedJsonl('graph/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate({
      type: 'graph-edge',
      id: candidate.id,
    })

    expect(result.candidate.status).toBe('applied')
    expect(result.applied?.edge?.from).toBe('persistence')
    expect(result.applied?.edge?.to).toBe('postgres')

    const edges = await readJsonl<{ id: string; from: string; to: string }>('graph/edges.jsonl')
    expect(edges).toHaveLength(1)
    expect(edges[0]?.id).toBe(candidate.edge.id)
  })

  it('applies a wiki-patch candidate into pages markdown and pages-index', async () => {
    const candidate = makeWikiCandidate({
      pageSlug: 'knowledge-engine/persistence',
    })
    await seedJsonl('wiki/patches.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate({
      type: 'wiki-patch',
      id: candidate.id,
      reviewNotes: 'lgtm',
    })

    expect(result.candidate.status).toBe('applied')
    expect(result.applied?.page?.slug).toBe('knowledge-engine/persistence')
    expect(result.applied?.page?.markdown).toContain('Postgres')
    expect(result.auditEvents.map((event) => event.action)).toEqual([
      'candidate_approved',
      'wiki_updated',
      'candidate_applied',
    ])

    const pagePath = join(
      knowledgeRoot,
      'wiki',
      'pages',
      'knowledge-engine',
      'persistence.md',
    )
    const markdown = await readFile(pagePath, 'utf8')
    expect(markdown).toContain('# Persistence Design')
    expect(markdown).toContain('chosen for durability')

    const indexRaw = await readFile(join(knowledgeRoot, 'wiki', 'pages-index.json'), 'utf8')
    const index = JSON.parse(indexRaw) as {
      version: number
      pages: Array<{ slug: string; relativePath: string; version: number }>
    }
    expect(index.version).toBe(1)
    expect(index.pages).toHaveLength(1)
    expect(index.pages[0]?.slug).toBe('knowledge-engine/persistence')
    expect(index.pages[0]?.relativePath.replace(/\\/g, '/')).toBe(
      'wiki/pages/knowledge-engine/persistence.md',
    )
    expect(index.pages[0]?.version).toBe(1)
  })

  it('refuses non-proposed candidates and missing ids', async () => {
    const proposed = makeFactCandidate({ id: 'cand-a' })
    const already = makeFactCandidate({
      id: 'cand-b',
      status: 'applied',
      fact: { ...makeFactCandidate().fact, id: 'memory-fact-2', status: 'active' },
    })
    await seedJsonl('facts/candidates.jsonl', [proposed, already])
    const { knowledgeReviewService } = await loadService()

    await expect(
      knowledgeReviewService.applyCandidate({ type: 'fact', id: 'missing' }),
    ).rejects.toThrow(/not found/i)

    await expect(
      knowledgeReviewService.rejectCandidate({ type: 'fact', id: 'cand-b' }),
    ).rejects.toThrow(/not proposed/i)
  })
})
