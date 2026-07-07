import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  Observation,
} from '../../../src/shared/knowledge'

const mocks = vi.hoisted(() => ({
  getDefaultModel: vi.fn(),
  getLanguageModel: vi.fn(),
  getAiModule: vi.fn(),
}))

vi.mock('../../../src/main/llm/LlmService', () => ({
  llmService: {
    getDefaultModel: mocks.getDefaultModel,
    getLanguageModel: mocks.getLanguageModel,
    getAiModule: mocks.getAiModule,
  },
}))

async function loadService() {
  vi.resetModules()
  return import('../../../src/main/knowledge/extract-service')
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-' + Math.random().toString(36).slice(2, 8),
    workspaceId: 'ws-id',
    workspaceName: 'ws-name',
    workspacePath: 'C:/work',
    source: 'manual',
    type: 'user-note',
    content: 'Decided to use Postgres for persistence instead of SQLite.',
    fileRefs: ['src/db.ts'],
    tags: ['design'],
    visibility: 'global',
    actor: 'tester',
    createdAt: '2026-07-07T00:00:00.000Z',
    retentionClass: 'evidence',
    ...overrides,
  }
}

function setupLlm(object: unknown): void {
  mocks.getDefaultModel.mockResolvedValue({
    provider: { id: 'openai-compatible' },
    modelId: 'gpt-test',
  })
  mocks.getLanguageModel.mockResolvedValue({ id: 'test-model' })
  mocks.getAiModule.mockResolvedValue({
    generateObject: vi.fn(async () => ({ object })),
  })
}

describe('KnowledgeExtractService', () => {
  let knowledgeRoot: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-extract-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
    mocks.getDefaultModel.mockReset()
    mocks.getLanguageModel.mockReset()
    mocks.getAiModule.mockReset()
  })

  afterEach(async () => {
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) {
      delete process.env.JANUSX_KNOWLEDGE_ROOT
    } else {
      process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    }
  })

  it('degrades safely when no default LLM is configured', async () => {
    mocks.getDefaultModel.mockResolvedValue(null)
    const { knowledgeExtractService } = await loadService()

    const result = await knowledgeExtractService.extract({
      observations: [makeObservation()],
    })

    expect(result.facts).toEqual([])
    expect(result.wikiPatches).toEqual([])
    expect(result.graphEdges).toEqual([])
    expect(result.degraded?.reason).toBe('no-default-llm')
    expect(result.auditEventId).toBeUndefined()
  })

  it('returns empty candidates when no evidence observations are provided', async () => {
    setupLlm({ facts: [], wikiPatches: [], graphEdges: [] })
    const { knowledgeExtractService } = await loadService()

    const result = await knowledgeExtractService.extract({
      observations: [{ ...makeObservation(), retentionClass: 'operational' }],
    })

    expect(result.degraded?.reason).toBe('no-evidence')
    expect(result.facts).toEqual([])
  })

  it('maps LLM output into candidates with provenance and appends to candidate files', async () => {
    setupLlm({
      facts: [
        {
          content: 'Project persistence layer uses Postgres.',
          concepts: ['persistence', 'postgres'],
          files: ['src/db.ts'],
          tags: ['design'],
          confidence: 0.9,
        },
      ],
      wikiPatches: [
        {
          pageSlug: 'persistence-design',
          title: 'Persistence Design',
          patchMarkdown: '## Postgres chosen\n- rationale:(pg)',
          rationale: 'Records latest design decision.',
          confidence: 0.8,
        },
      ],
      graphEdges: [
        {
          from: 'persistence',
          to: 'postgres',
          type: 'implemented_in',
          confidence: 0.7,
        },
      ],
    })
    const { knowledgeExtractService } = await loadService()

    const observations = [
      makeObservation({ id: 'obs-evidence-1' }),
      makeObservation({ id: 'obs-evidence-2', content: 'Pick Postgres driver pg.' }),
    ]
    const result = await knowledgeExtractService.extract({ observations })

    expect(result.facts).toHaveLength(1)
    const fact = result.facts[0] as CandidateFact
    expect(fact.type).toBe('fact')
    expect(fact.status).toBe('proposed')
    expect(fact.fact.content).toBe('Project persistence layer uses Postgres.')
    expect(fact.fact.confidence).toBeCloseTo(0.9)
    expect(fact.fact.version).toBe(1)
    expect(fact.fact.status).toBe('proposed')
    expect(fact.fact.provenance.sourceObservationIds).toEqual([
      'obs-evidence-1',
      'obs-evidence-2',
    ])
    expect(fact.fact.provenance.workspaceId).toBe('ws-id')
    expect(fact.fact.provenance.source).toBe('system')
    expect(fact.fact.provenance.actor).toBe('knowledge-extract')
    expect(fact.fact.provenance.fileRefs).toEqual(['src/db.ts'])

    expect(result.wikiPatches).toHaveLength(1)
    const patch = result.wikiPatches[0] as CandidateWikiPatch
    expect(patch.type).toBe('wiki-patch')
    expect(patch.pageSlug).toBe('persistence-design')
    expect(patch.provenance.sourceObservationIds).toEqual([
      'obs-evidence-1',
      'obs-evidence-2',
    ])

    expect(result.graphEdges).toHaveLength(1)
    const edge = result.graphEdges[0] as CandidateGraphEdge
    expect(edge.type).toBe('graph-edge')
    expect(edge.edge.from).toBe('persistence')
    expect(edge.edge.to).toBe('postgres')
    expect(edge.edge.type).toBe('implemented_in')
    expect(edge.edge.workspaceId).toBe('ws-id')

    // candidate files written
    const factFile = await readFile(join(knowledgeRoot, 'facts/candidates.jsonl'), 'utf8')
    expect(factFile).toContain(fact.id)
    expect(factFile).not.toContain('"supersedes"') // sanity: not a fact.jsonl record
    const patchFile = await readFile(join(knowledgeRoot, 'wiki/patches.jsonl'), 'utf8')
    expect(patchFile).toContain(patch.id)
    const graphFile = await readFile(join(knowledgeRoot, 'graph/candidates.jsonl'), 'utf8')
    expect(graphFile).toContain(edge.id)

    // audit trail
    const auditFile = await readFile(join(knowledgeRoot, 'audit/audit.jsonl'), 'utf8')
    expect(auditFile).toContain('"action":"candidate_proposed"')
    expect(auditFile).toContain(fact.id)
    expect(result.auditEventId).toBeTruthy()
  })

  it('does not write instruments to accepted-only collections', async () => {
    setupLlm({
      facts: [
        {
          content: 'fact',
          concepts: [],
          files: [],
          tags: [],
          confidence: 0.6,
        },
      ],
      wikiPatches: [],
      graphEdges: [],
    })
    const { knowledgeExtractService } = await loadService()

    await knowledgeExtractService.extract({ observations: [makeObservation()] })

    // accepted-only collections are never created/touched by the extract service.
    const facts = await readFile(join(knowledgeRoot, 'facts/facts.jsonl')).catch(
      () => null,
    )
    const edges = await readFile(join(knowledgeRoot, 'graph/edges.jsonl')).catch(
      () => null,
    )
    expect(facts).toBeNull()
    expect(edges).toBeNull()
  })

  it('degrades when generateObject throws', async () => {
    mocks.getDefaultModel.mockResolvedValue({
      provider: { id: 'openai-compatible' },
      modelId: 'gpt-test',
    })
    mocks.getLanguageModel.mockResolvedValue({ id: 'test-model' })
    mocks.getAiModule.mockResolvedValue({
      generateObject: vi.fn(async () => {
        throw new Error('provider-down')
      }),
    })
    const { knowledgeExtractService } = await loadService()

    const result = await knowledgeExtractService.extract({
      observations: [makeObservation()],
    })

    expect(result.degraded?.reason).toBe('generate-object-failed')
    expect(result.degraded?.detail).toContain('provider-down')
    expect(result.facts).toEqual([])
    expect(result.auditEventId).toBeUndefined()
  })

  it('listFactCandidates / listGraphCandidates / listWikiPatchCandidates read back appended rows', async () => {
    setupLlm({
      facts: [
        {
          content: 'f1',
          concepts: [],
          files: [],
          tags: [],
          confidence: 0.4,
        },
      ],
      wikiPatches: [],
      graphEdges: [
        { from: 'a', to: 'b', type: 'mentions', confidence: 0.3 },
      ],
    })
    const { knowledgeExtractService } = await loadService()

    await knowledgeExtractService.extract({ observations: [makeObservation()] })

    const factCandidates = await knowledgeExtractService.listFactCandidates()
    expect(factCandidates).toHaveLength(1)
    expect(factCandidates[0]?.type).toBe('fact')
    const graphCandidates = await knowledgeExtractService.listGraphCandidates()
    expect(graphCandidates).toHaveLength(1)
    const patchCandidates = await knowledgeExtractService.listWikiPatchCandidates()
    expect(patchCandidates).toHaveLength(0)
  })
})