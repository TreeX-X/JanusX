import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtemp } from 'fs/promises'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { knowledgeSearchService } from '../../../src/main/knowledge/search-service'
import type { CandidateFact } from '../../../src/shared/knowledge'

function makeCandidate(overrides: Partial<CandidateFact> = {}): CandidateFact {
  return {
    id: 'candidate-phase7',
    type: 'fact',
    status: 'proposed',
    fact: {
      id: 'fact-phase7',
      content: 'Phase 7 controlled recall uses BM25 with source refs.',
      concepts: ['KnowledgeSearchService', 'BM25', 'controlled recall'],
      files: ['src/main/knowledge/search-service.ts'],
      tags: ['phase7', 'retrieval'],
      confidence: 0.91,
      version: 1,
      status: 'proposed',
      provenance: {
        workspaceId: 'workspace-a',
        workspaceName: 'Workspace A',
        workspacePath: 'C:/workspace-a',
        source: 'manual',
        sourceObservationIds: ['obs-source-a'],
        fileRefs: ['src/main/knowledge/search-service.ts'],
        actor: 'test',
        createdAt: '2026-07-08T00:00:00.000Z',
      },
    },
    ...overrides,
  }
}

describe('KnowledgeSearchService', () => {
  let workspacePath: string
  let knowledgeRoot: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), 'janusx-search-workspace-'))
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-search-root-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true })
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) {
      delete process.env.JANUSX_KNOWLEDGE_ROOT
    } else {
      process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    }
  })

  it('returns BM25 ranked hits with source refs and compact context', async () => {
    const target = await knowledgeObservationService.capture({
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'BM25 recall must return source refs for JanusX knowledge search.',
      fileRefs: ['src/main/knowledge/search-service.ts'],
      tags: ['phase7', 'retrieval'],
      actor: 'tester',
    })
    await knowledgeObservationService.capture({
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'Unrelated terminal lifecycle event.',
      actor: 'tester',
    })

    const result = await knowledgeSearchService.search({
      query: 'bm25 source refs',
      limit: 5,
    })

    expect(result.indexStats.documentCount).toBeGreaterThanOrEqual(2)
    expect(result.hits[0]?.id).toBe(target.id)
    expect(result.hits[0]?.bm25Score).toBeGreaterThan(0)
    expect(result.hits[0]?.scoreExplanation).toEqual(expect.objectContaining({
      bm25: expect.any(Number),
      exactTitle: expect.any(Number),
      titlePhrase: expect.any(Number),
      bodyPhrase: expect.any(Number),
    }))
    expect(result.hits[0]?.sourceObservationIds).toEqual([target.id])
    expect(result.hits[0]?.fileRefs).toContain('src/main/knowledge/search-service.ts')
    expect(result.compactContext).toContain(`refs=${target.id}`)
  })

  it('filters by workspace, tags, files, source, and document type', async () => {
    await mkdir(join(knowledgeRoot, 'facts'), { recursive: true })
    const match = makeCandidate()
    const other = makeCandidate({
      id: 'candidate-other',
      fact: {
        ...makeCandidate().fact,
        id: 'fact-other',
        content: 'Phase 7 controlled recall belongs to a different workspace.',
        provenance: {
          ...makeCandidate().fact.provenance,
          workspaceId: 'workspace-b',
          workspaceName: 'Workspace B',
          workspacePath: 'C:/workspace-b',
        },
      },
    })
    await writeFile(
      join(knowledgeRoot, 'facts/candidates.jsonl'),
      `${JSON.stringify(match)}\n${JSON.stringify(other)}\n`,
      'utf8',
    )

    const result = await knowledgeSearchService.search({
      query: 'controlled recall bm25',
      workspaceId: 'workspace-a',
      tags: ['#phase7'],
      files: ['search-service.ts'],
      source: 'manual',
      types: ['fact-candidate'],
    })

    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]?.id).toBe('candidate-phase7')
    expect(result.hits[0]?.type).toBe('fact-candidate')

    const sourceMismatch = await knowledgeSearchService.search({
      query: 'controlled recall bm25',
      source: 'janus-chat',
      types: ['fact-candidate'],
    })
    expect(sourceMismatch.hits).toHaveLength(0)
  })

  it('searches resolved blob content instead of only the preview', async () => {
    const longContent = `${'A'.repeat(2400)} deepblobtoken searchable after preview`
    const observation = await knowledgeObservationService.capture({
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: longContent,
      actor: 'tester',
    })
    expect(observation.blobRef).toBeTruthy()
    expect(observation.content).not.toContain('deepblobtoken')

    const result = await knowledgeSearchService.search({
      query: 'deepblobtoken',
      types: ['observation'],
    })

    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]?.id).toBe(observation.id)
    expect(result.hits[0]?.content).toContain('deepblobtoken')
  })

  it('degrades empty query without returning arbitrary hits', async () => {
    await knowledgeObservationService.capture({
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'searchable content',
      actor: 'tester',
    })

    const result = await knowledgeSearchService.search({ query: '   ' })

    expect(result.hits).toEqual([])
    expect(result.compactContext).toBe('')
    expect(result.degraded?.reason).toBe('empty-query')
  })
})
