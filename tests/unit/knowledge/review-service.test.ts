import { reviewCandidateInput } from '../../../src/shared/review-candidate-snapshot'
import { reviewFixture } from './review-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'
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
    sourceFactIds: [],
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

    const result = await knowledgeReviewService.rejectCandidate(await reviewFixture({
      type: 'fact',
      id: candidate.id,
      reviewNotes: 'not durable enough',
    }))

    expect(result.candidate.status).toBe('rejected')
    expect(result.candidate.reviewNotes).toBe('not durable enough')
    expect(result.auditEvents).toHaveLength(1)
    expect(result.auditEvents[0]?.action).toBe('candidate_rejected')

    const stored = await readJsonl<CandidateFact>('facts/candidates.jsonl')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.status).toBe('rejected')
    expect(stored[0]?.reviewNotes).toBe('not durable enough')
  })

  it('rejects an entire proposal batch containing raw tool evidence before any writes', async () => {
    const valid = makeFactCandidate()
    const raw = makeFactCandidate({ id: 'raw' })
    raw.fact.content = JSON.stringify({ chunk_id: 'fixture', wall_time_seconds: 0.5, exit_code: 0, output: 'we decided to use sqlite' })
    const { proposeFactCandidates } = await loadService()
    await seedJsonl('facts/candidates.jsonl', [])
    await expect(proposeFactCandidates([valid, raw])).rejects.toThrow('Raw execution evidence')
    expect(await readJsonl('facts/candidates.jsonl')).toEqual([])
  })

  it('blocks approval of a legacy raw source candidate but allows audited rejection', async () => {
    const candidate = makeFactCandidate()
    candidate.fact.content = '2255\t@media (prefers-reduced-motion: reduce) {'
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()
    const input = await reviewFixture({ type: 'fact', id: candidate.id })
    await expect(knowledgeReviewService.applyCandidate(input)).rejects.toThrow('Raw execution evidence')
    expect((await readJsonl<CandidateFact>('facts/candidates.jsonl'))[0].status).toBe('proposed')
    const result = await knowledgeReviewService.rejectCandidate({ ...input, reviewNotes: 'Raw source listing, not durable knowledge' })
    expect(result.candidate.status).toBe('rejected')
    expect(result.auditEvents[0]?.action).toBe('candidate_rejected')
  })

  it('applies a proposed fact into facts.jsonl with approved+applied audits', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({
      type: 'fact',
      id: candidate.id,
    }))

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

  it('honors an explicit human actor override in review audits', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({
      type: 'fact',
      id: candidate.id,
      actor: 'human-review',
    }))

    expect(result.candidate.status).toBe('applied')
    expect(result.auditEvents).toHaveLength(2)
    for (const event of result.auditEvents) {
      expect(event.provenance.actor).toBe('human-review')
    }
  })

  it('applies a graph-edge candidate into edges.jsonl', async () => {
    const candidate = makeGraphCandidate()
    await seedJsonl('graph/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({
      type: 'graph-edge',
      id: candidate.id,
    }))

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

    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({
      type: 'wiki-patch',
      id: candidate.id,
      reviewNotes: 'lgtm',
    }))

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
      createHash('sha256').update(candidate.provenance.workspaceId).digest('hex'),
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
      'wiki/pages/' + createHash('sha256').update(candidate.provenance.workspaceId).digest('hex') + '/knowledge-engine/persistence.md',
    )
    expect(index.pages[0]?.version).toBe(1)
  })

  it('unions candidate sourceFactIds into the published wiki index entry', async () => {
    const candidate = makeWikiCandidate({ sourceFactIds: ['fact-new', 'fact-new'] })
    await seedJsonl('wiki/patches.jsonl', [candidate])
    await mkdir(join(knowledgeRoot, 'wiki', 'pages'), { recursive: true })
    await writeFile(join(knowledgeRoot, 'wiki', 'pages', 'persistence-design.md'), '# Existing page')
    await writeFile(
      join(knowledgeRoot, 'wiki', 'pages-index.json'),
      JSON.stringify({
        version: 1,
        pages: [{
          slug: candidate.pageSlug,
          title: candidate.title,
          relativePath: 'wiki/pages/persistence-design.md',
          tags: [],
          status: 'published',
          sourceFactIds: ['fact-old'],
          updatedAt: '2026-07-12T00:00:00.000Z',
          version: 1,
          workspaceId: 'ws-id',
        }],
      }),
      'utf8',
    )
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'wiki-patch', id: candidate.id }))

    expect(result.applied?.page?.sourceFactIds).toEqual(['fact-old', 'fact-new'])
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
      knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: 'missing' })),
    ).rejects.toThrow(/not found/i)

    await expect(
      knowledgeReviewService.rejectCandidate(await reviewFixture({ type: 'fact', id: 'cand-b' })),
    ).rejects.toThrow(/not proposed/i)
  })

  it('treats repeated reject as an idempotent no-op', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const first = await knowledgeReviewService.rejectCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))
    const second = await knowledgeReviewService.rejectCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))

    expect(first.candidate.status).toBe('rejected')
    expect(second.candidate.status).toBe('rejected')
    expect(second.auditEvents).toEqual([])
  })

  it('serializes concurrent fact apply calls without duplicating truth', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const results = await Promise.all([
      knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id })),
      knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id })),
    ])

    const facts = await readJsonl<MemoryFact>('facts/facts.jsonl')
    expect(facts.filter((fact) => fact.id === candidate.fact.id)).toHaveLength(1)
    expect(results.map((result) => result.auditEvents.length).sort()).toEqual([0, 2])
  })

  it('does not duplicate an already materialized wiki patch on retry', async () => {    const candidate = makeWikiCandidate()
    await seedJsonl('wiki/patches.jsonl', [candidate])
    const pagePath = join(knowledgeRoot, 'wiki', 'pages', `${candidate.pageSlug}.md`)
    await mkdir(join(pagePath, '..'), { recursive: true })
    await writeFile(pagePath, `# ${candidate.title}\n\n${candidate.patchMarkdown}\n`, 'utf8')
    const { knowledgeReviewService } = await loadService()

    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'wiki-patch', id: candidate.id }))

    const markdown = await readFile(pagePath, 'utf8')
    expect(markdown.split(candidate.patchMarkdown)).toHaveLength(2)
  })

  it('restores candidate and truth when required audit persistence fails', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()
    const { knowledgeAuditService } = await import('../../../src/main/knowledge/audit-service')
    vi.spyOn(knowledgeAuditService, 'recordBatch').mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))).rejects.toThrow('audit unavailable')

    expect((await readJsonl<CandidateFact>('facts/candidates.jsonl'))[0]?.status).toBe('proposed')
    await expect(readFile(join(process.env.JANUSX_KNOWLEDGE_ROOT!, 'facts/facts.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
    vi.restoreAllMocks()
  })

  it('archives the old fact and continues its version on supersede apply', async () => {
    const oldFact: MemoryFact = {
      id: 'fact-old',
      content: 'Persistence uses SQLite.',
      concepts: [],
      files: ['src/db.ts'],
      tags: [],
      confidence: 0.8,
      version: 3,
      status: 'active',
      kind: 'fact',
      provenance: provenance({ sourceObservationIds: ['obs-old'] }),
    }
    await seedJsonl('facts/facts.jsonl', [oldFact])
    const candidate = makeFactCandidate({
      id: 'cand-supersede',
      derivation: 'llm',
      evidence: { observationIds: ['obs-new'] },
      fact: {
        ...makeFactCandidate().fact,
        id: 'fact-new',
        content: 'Persistence uses Postgres.',
        kind: 'fact',
        supersedes: 'fact-old',
        provenance: provenance({ sourceObservationIds: ['obs-new'], actor: 'knowledge-extract' }),
      },
    })
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()

    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))

    expect(result.applied?.fact?.id).toBe('fact-new')
    expect(result.applied?.fact?.version).toBe(4)
    expect(result.applied?.fact?.status).toBe('active')
    expect(result.auditEvents.map((event) => event.action)).toEqual([
      'candidate_approved',
      'fact_superseded',
      'candidate_applied',
    ])
    const supersededAudit = result.auditEvents.find((event) => event.action === 'fact_superseded')
    expect(supersededAudit?.targetId).toBe('fact-old')

    const facts = await readJsonl<MemoryFact>('facts/facts.jsonl')
    expect(facts).toHaveLength(2)
    expect(facts.find((fact) => fact.id === 'fact-old')?.status).toBe('archived')
    expect(facts.find((fact) => fact.id === 'fact-new')?.version).toBe(4)
  })

  it('refuses to apply a candidate whose supersedes target is missing or inactive', async () => {
    const archived: MemoryFact = {
      ...makeFactCandidate().fact,
      id: 'fact-archived',
      kind: 'fact',
      status: 'archived',
    }
    await seedJsonl('facts/facts.jsonl', [archived])
    const dangling = makeFactCandidate({
      id: 'cand-dangling',
      derivation: 'llm',
      evidence: { observationIds: ['obs-new'] },
      fact: {
        ...makeFactCandidate().fact,
        id: 'fact-dangling',
        kind: 'fact',
        supersedes: 'fact-missing',
      },
    })
    const stale = makeFactCandidate({
      id: 'cand-stale',
      derivation: 'llm',
      evidence: { observationIds: ['obs-new'] },
      fact: {
        ...makeFactCandidate().fact,
        id: 'fact-stale',
        kind: 'fact',
        supersedes: 'fact-archived',
      },
    })
    await seedJsonl('facts/candidates.jsonl', [dangling, stale])
    const { knowledgeReviewService } = await loadService()

    await expect(
      knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: 'cand-dangling' })),
    ).rejects.toThrow(/no active truth fact/i)
    await expect(
      knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: 'cand-stale' })),
    ).rejects.toThrow(/no active truth fact/i)

    const candidates = await readJsonl<CandidateFact>('facts/candidates.jsonl')
    expect(candidates.map((candidate) => candidate.status)).toEqual(['proposed', 'proposed'])
    expect(await readJsonl<MemoryFact>('facts/facts.jsonl')).toHaveLength(1)
  })
  it.each(['wiki-patch', 'graph-edge'] as const)('refuses damaged %s candidates without dropping records', async type => {
    const candidate = type === 'wiki-patch' ? makeWikiCandidate() : makeGraphCandidate()
    const path = type === 'wiki-patch' ? 'wiki/patches.jsonl' : 'graph/candidates.jsonl'
    await seedJsonl(path, [candidate])
    const original = (await readFile(join(knowledgeRoot, path), 'utf8')) + '{damaged\n'
    await writeFile(join(knowledgeRoot, path), original)
    const { knowledgeReviewService, proposeDerivedCandidates } = await loadService()
    await expect(proposeDerivedCandidates([{ ...candidate, id: 'new' }])).rejects.toThrow()
    await expect(knowledgeReviewService.rejectCandidate(await reviewCandidateInput(candidate))).rejects.toThrow()
    expect(await readFile(join(knowledgeRoot, path), 'utf8')).toBe(original)
  })

  it.each(['applyCandidate', 'rejectCandidate'] as const)('rejects stale content for %s and requires a fresh snapshot', async action => {
    const candidate = makeFactCandidate()
    const input = await reviewCandidateInput(candidate)
    const changed = { ...candidate, fact: { ...candidate.fact, content: 'Changed after display' } }
    await seedJsonl('facts/candidates.jsonl', [changed])
    const { knowledgeReviewService } = await loadService()
    await expect(knowledgeReviewService[action](input)).rejects.toThrow('Candidate changed')
    expect((await readJsonl<CandidateFact>('facts/candidates.jsonl'))[0].status).toBe('proposed')
    await knowledgeReviewService[action](await reviewCandidateInput(changed))
  })

  it.each(['applyCandidate', 'rejectCandidate'] as const)('rejects missing snapshot for %s', async action => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const { knowledgeReviewService } = await loadService()
    await expect(knowledgeReviewService[action]({ type: 'fact', id: candidate.id, candidateHash: '' })).rejects.toThrow('snapshot missing')
  })

  it.each(['wiki-patch', 'graph-edge'] as const)('binds %s content and evidence', async type => {
    const candidate = type === 'wiki-patch' ? makeWikiCandidate() : makeGraphCandidate()
    const input = await reviewCandidateInput(candidate)
    const changed = { ...candidate, evidence: { observationIds: ['new-source'] } }
    await seedJsonl(type === 'wiki-patch' ? 'wiki/patches.jsonl' : 'graph/candidates.jsonl', [changed])
    const { knowledgeReviewService } = await loadService()
    await expect(knowledgeReviewService.applyCandidate(input)).rejects.toThrow('Candidate changed')
  })

  it('keeps retries idempotent with the original displayed snapshot', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    const input = await reviewCandidateInput(candidate)
    const { knowledgeReviewService } = await loadService()
    await knowledgeReviewService.applyCandidate(input)
    expect((await knowledgeReviewService.applyCandidate(input)).auditEvents).toEqual([])
  })

  it.each(['facts/facts.jsonl', 'graph/edges.jsonl', 'wiki/pages-index.json'])('preserves malformed truth store %s', async path => {
    const candidate = path.startsWith('facts') ? makeFactCandidate() : path.startsWith('graph') ? makeGraphCandidate() : makeWikiCandidate()
    const candidatesPath = candidate.type === 'fact' ? 'facts/candidates.jsonl' : candidate.type === 'graph-edge' ? 'graph/candidates.jsonl' : 'wiki/patches.jsonl'
    await seedJsonl(candidatesPath, [candidate])
    const original = '{broken record\n'
    await writeFile(join(knowledgeRoot, path), original)
    const { knowledgeReviewService } = await loadService()
    await expect(knowledgeReviewService.applyCandidate(await reviewCandidateInput(candidate))).rejects.toThrow()
    expect(await readFile(join(knowledgeRoot, path), 'utf8')).toBe(original)
    expect((await readJsonl<CandidateFact>(candidatesPath))[0].status).toBe('proposed')
  })

  it('does not treat an unreadable truth path as an empty file', async () => {
    const candidate = makeFactCandidate()
    await seedJsonl('facts/candidates.jsonl', [candidate])
    await mkdir(join(knowledgeRoot, 'facts/facts.jsonl'))
    const { knowledgeReviewService } = await loadService()
    await expect(knowledgeReviewService.applyCandidate(await reviewCandidateInput(candidate))).rejects.toThrow()
    expect((await readJsonl<CandidateFact>('facts/candidates.jsonl'))[0].status).toBe('proposed')
  })

  it.each(['wiki-patch', 'graph-edge'] as const)('preserves %s admissions across an audit rollback', async type => {
    const candidate = type === 'wiki-patch' ? makeWikiCandidate() : makeGraphCandidate()
    const next = { ...candidate, id: 'arrived-during-review' }
    const path = type === 'wiki-patch' ? 'wiki/patches.jsonl' : 'graph/candidates.jsonl'
    await seedJsonl(path, [candidate])
    const { knowledgeReviewService, proposeDerivedCandidates } = await loadService()
    const { knowledgeAuditService } = await import('../../../src/main/knowledge/audit-service')
    let entered!: () => void
    let release!: () => void
    const waiting = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const spy = vi.spyOn(knowledgeAuditService, 'recordBatch').mockImplementationOnce(async () => {
      entered(); await gate; throw new Error('audit unavailable')
    })
    const applied = knowledgeReviewService.applyCandidate(await reviewCandidateInput(candidate))
    const rejected = expect(applied).rejects.toThrow('audit unavailable')
    await waiting
    const admission = proposeDerivedCandidates([next])
    release()
    try { await Promise.all([rejected, admission]) } finally { spy.mockRestore() }
    expect((await readJsonl<CandidateFact>(path)).map(item => [item.id, item.status])).toEqual([[candidate.id, 'proposed'], [next.id, 'proposed']])
  })

})
