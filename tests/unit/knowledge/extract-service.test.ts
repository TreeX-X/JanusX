import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  Observation,
} from '../../../src/shared/knowledge'

const mocks = vi.hoisted(() => ({
  getDefaultModel: vi.fn(),
  getLanguageModel: vi.fn(),
  generateObject: vi.fn(),
}))

vi.mock('../../../src/main/llm/LlmService', () => ({
  llmService: {
    getDefaultModel: mocks.getDefaultModel,
    getLanguageModel: mocks.getLanguageModel,
  },
}))
vi.mock('../../../src/main/llm/ai-runtime', () => ({
  generateObject: mocks.generateObject,
}))
// Phase 2: extract-service now reaches configService (merge-mode fallback)
// through deterministic-extractor.
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

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
  mocks.generateObject.mockResolvedValue({ object })
}

describe('KnowledgeExtractService', () => {
  let knowledgeRoot: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-extract-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
    mocks.getDefaultModel.mockReset()
    mocks.getLanguageModel.mockReset()
    mocks.generateObject.mockReset()
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
    mocks.generateObject.mockImplementation(async () => {
      throw new Error('provider-down')
    })
    const { knowledgeExtractService } = await loadService()

    const result = await knowledgeExtractService.extract(
      { observations: [makeObservation()] },
      { sleepMs: async () => {} },
    )

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

  describe('Phase 2: kind / supersedes / timeout / retry / merge', () => {
    async function seedJsonl(relativePath: string, records: unknown[]): Promise<void> {
      const absolutePath = join(knowledgeRoot, relativePath)
      await mkdir(dirname(absolutePath), { recursive: true })
      const body = records.map((record) => JSON.stringify(record)).join('\n')
      await writeFile(absolutePath, body.length > 0 ? `${body}\n` : '', 'utf8')
    }

    function truthProvenance() {
      return {
        workspaceId: 'ws-id',
        workspaceName: 'ws-name',
        workspacePath: 'C:/work',
        source: 'manual',
        sourceObservationIds: ['obs-old'],
        fileRefs: [],
        actor: 'tester',
        createdAt: '2026-07-07T00:00:00.000Z',
      }
    }

    function seedTruth(id: string, overrides: Record<string, unknown> = {}) {
      return {
        id,
        content: 'Old persistence uses SQLite.',
        concepts: [],
        files: ['src/db.ts'],
        tags: [],
        confidence: 0.8,
        version: 2,
        status: 'active',
        kind: 'fact',
        provenance: truthProvenance(),
        ...overrides,
      }
    }

    function seedDeterministicCandidate(id: string, content: string, confidence: number) {
      const provenance = {
        ...truthProvenance(),
        source: 'tool',
        sourceObservationIds: ['o1'],
        fileRefs: ['src/db.ts'],
        actor: 'knowledge-deterministic',
      }
      return {
        id,
        type: 'fact',
        status: 'proposed',
        fact: {
          id: `fact-${id}`,
          content,
          concepts: [],
          files: ['src/db.ts'],
          tags: [],
          confidence,
          version: 1,
          status: 'proposed',
          kind: 'fact',
          provenance,
        },
        derivation: 'deterministic',
        evidence: { observationIds: ['o1'], snippets: [content] },
      }
    }

    async function readCandidates(): Promise<CandidateFact[]> {
      const { knowledgeExtractService } = await loadService()
      return knowledgeExtractService.listFactCandidates()
    }

    it('maps kind and keeps validated supersedes, drops hallucinated ones', async () => {
      await seedJsonl('facts/facts.jsonl', [seedTruth('truth-1')])
      setupLlm({
        facts: [
          {
            content: 'Persistence now uses Postgres.',
            concepts: [],
            files: ['src/db.ts'],
            tags: [],
            confidence: 0.85,
            kind: 'decision',
            supersedes: 'truth-1',
          },
          {
            content: 'Unrelated note.',
            concepts: [],
            files: [],
            tags: [],
            confidence: 0.5,
            kind: 'fact',
            supersedes: 'ghost-id',
          },
        ],
        wikiPatches: [],
        graphEdges: [],
      })
      const { knowledgeExtractService } = await loadService()

      const result = await knowledgeExtractService.extract(
        { observations: [makeObservation({ id: 'o1' })] },
        { mode: 'auto', sleepMs: async () => {} },
      )

      expect(result.facts).toHaveLength(2)
      expect(result.facts[0]?.fact.kind).toBe('decision')
      expect(result.facts[0]?.fact.supersedes).toBe('truth-1')
      expect(result.facts[1]?.fact.kind).toBe('fact')
      expect(result.facts[1]?.fact.supersedes).toBeUndefined()
    })

    it('marks candidate-stage conflicts against active truth', async () => {
      await seedJsonl('facts/facts.jsonl', [seedTruth('truth-1')])
      setupLlm({
        facts: [
          {
            content: 'Persistence uses Postgres.',
            concepts: [],
            files: ['src/db.ts'],
            tags: [],
            confidence: 0.8,
            kind: 'fact',
          },
        ],
        wikiPatches: [],
        graphEdges: [],
      })
      const { knowledgeExtractService } = await loadService()

      const result = await knowledgeExtractService.extract(
        { observations: [makeObservation({ id: 'o1' })] },
        { mode: 'auto', sleepMs: async () => {} },
      )

      expect(result.facts).toHaveLength(1)
      expect(result.facts[0]?.conflicts).toEqual(['truth-1'])
    })

    it('degrades on timeout when the model hangs', async () => {
      setupLlm({ facts: [], wikiPatches: [], graphEdges: [] })
      mocks.generateObject.mockImplementation(() => new Promise(() => {}))
      const { knowledgeExtractService } = await loadService()

      const result = await knowledgeExtractService.extract(
        { observations: [makeObservation()] },
        { mode: 'auto', timeoutMs: 30, sleepMs: async () => {} },
      )

      expect(result.facts).toEqual([])
      expect(result.degraded?.reason).toBe('generate-object-failed')
      expect(result.degraded?.detail).toContain('timed out')
      expect(result.auditEventId).toBeUndefined()
    })

    it('retries invalid output then degrades, calling the model 3 times', async () => {
      mocks.getDefaultModel.mockResolvedValue({
        provider: { id: 'openai-compatible' },
        modelId: 'gpt-test',
      })
      mocks.getLanguageModel.mockResolvedValue({ id: 'test-model' })
      mocks.generateObject.mockResolvedValue({ object: { facts: 'garbage' } })
      const { knowledgeExtractService } = await loadService()

      const result = await knowledgeExtractService.extract(
        { observations: [makeObservation()] },
        { mode: 'auto', sleepMs: async () => {} },
      )

      expect(result.degraded?.reason).toBe('generate-object-failed')
      expect(mocks.generateObject).toHaveBeenCalledTimes(3)
    })

    it('succeeds after one transient failure', async () => {
      mocks.getDefaultModel.mockResolvedValue({
        provider: { id: 'openai-compatible' },
        modelId: 'gpt-test',
      })
      mocks.getLanguageModel.mockResolvedValue({ id: 'test-model' })
      mocks.generateObject
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({
          object: {
            facts: [
              {
                content: 'Recovered fact.',
                concepts: [],
                files: [],
                tags: [],
                confidence: 0.7,
                kind: 'fact',
              },
            ],
            wikiPatches: [],
            graphEdges: [],
          },
        })
      const { knowledgeExtractService } = await loadService()

      const result = await knowledgeExtractService.extract(
        { observations: [makeObservation()] },
        { mode: 'auto', sleepMs: async () => {} },
      )

      expect(result.facts).toHaveLength(1)
      expect(result.facts[0]?.fact.content).toBe('Recovered fact.')
      expect(mocks.generateObject).toHaveBeenCalledTimes(2)
    })

    it('merges LLM output into the matching deterministic candidate instead of appending', async () => {
      await seedJsonl(
        'facts/candidates.jsonl',
        [seedDeterministicCandidate('det-1', 'commit abc: add user index', 0.9)],
      )
      setupLlm({
        facts: [
          {
            content: 'commit abc: add user index',
            concepts: [],
            files: ['src/db.ts'],
            tags: [],
            confidence: 0.95,
            kind: 'fact',
          },
        ],
        wikiPatches: [],
        graphEdges: [],
      })
      const { knowledgeExtractService } = await loadService()

      const result = await knowledgeExtractService.extract(
        { observations: [makeObservation({ id: 'o1', content: 'commit abc: add user index' })] },
        { mode: 'auto', sleepMs: async () => {} },
      )

      expect(result.facts).toHaveLength(0)
      expect(result.mergedFactCandidateIds).toEqual(['det-1'])
      const stored = await readCandidates()
      expect(stored).toHaveLength(1)
      expect(stored[0]?.derivation).toBe('merged')
      expect(stored[0]?.fact.confidence).toBeCloseTo(0.95)
      expect(stored[0]?.mergedFrom).toHaveLength(2)
      expect(stored[0]?.mergedFrom).toContain('det-1')
    })

    it('merge tie-break follows mode on equal confidence', async () => {
      const detContent = 'Project persistence layer uses Postgres for durability.'
      const llmContent = 'Project persistence layer uses Postgres for durability and backups.'
      const observation = makeObservation({ id: 'o1', content: detContent })
      const llmPayload = {
        facts: [
          {
            content: llmContent,
            concepts: [],
            files: [],
            tags: [],
            confidence: 0.8,
            kind: 'fact' as const,
          },
        ],
        wikiPatches: [],
        graphEdges: [],
      }

      for (const mode of ['auto', 'llm-preferred'] as const) {
        await seedJsonl(
          'facts/candidates.jsonl',
          [seedDeterministicCandidate('det-tie', detContent, 0.8)],
        )
        setupLlm(llmPayload)
        const { knowledgeExtractService } = await loadService()
        const result = await knowledgeExtractService.extract(
          { observations: [observation] },
          { mode, sleepMs: async () => {} },
        )
        expect(result.mergedFactCandidateIds).toEqual(['det-tie'])
        const stored = await readCandidates()
        expect(stored).toHaveLength(1)
        expect(stored[0]?.fact.content).toBe(mode === 'llm-preferred' ? llmContent : detContent)
      }
    })

    it('applies the per-batch character budget oldest-first', async () => {
      const { applyLlmBudget } = await loadService()
      const big = (id: string, chars: number) => makeObservation({ id, content: 'x'.repeat(chars) })

      // Per-observation cap: 7000 chars -> truncated with a marker.
      const capped = applyLlmBudget([big('a', 7000)])
      expect(capped.observations).toHaveLength(1)
      expect(capped.droppedObservationIds).toEqual([])
      expect(capped.observations[0]?.content.length).toBeLessThanOrEqual(6100)
      expect(capped.observations[0]?.content).toContain('[truncated for LLM budget]')

      // Batch cap: 12 x 6000 = 72000 > 60000 -> the two oldest are dropped.
      const many = Array.from({ length: 12 }, (_, index) => big(`o${index}`, 6000))
      const budgeted = applyLlmBudget(many)
      expect(budgeted.droppedObservationIds).toEqual(['o0', 'o1'])
      expect(budgeted.observations).toHaveLength(10)
      expect(budgeted.observations[0]?.id).toBe('o2')
    })
  })
})
