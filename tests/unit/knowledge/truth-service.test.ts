import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { GraphEdge, MemoryFact } from '../../../src/shared/knowledge'
import { KnowledgeTruthService } from '../../../src/main/knowledge/truth-service'

async function write(relativePath: string, content: string): Promise<void> {
  const filePath = join(process.env.JANUSX_KNOWLEDGE_ROOT!, relativePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}

describe('KnowledgeTruthService', () => {
  let root: string
  const previousRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-truth-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = root
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    if (previousRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousRoot
  })

  it('returns only active facts, published wiki pages, and accepted edges', async () => {
    const fact = (id: string, status: MemoryFact['status']): MemoryFact => ({
      id,
      content: id,
      concepts: [],
      files: [],
      tags: [],
      confidence: 0.8,
      version: 1,
      status,
      provenance: {
        workspaceId: 'ws-1',
        workspaceName: 'Workspace',
        workspacePath: 'C:/work',
        source: 'manual',
        sourceObservationIds: ['obs-1'],
        fileRefs: [],
        actor: 'tester',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    })
    const edge: GraphEdge = {
      id: 'edge-1',
      from: 'Workbench',
      to: 'Truth',
      type: 'depends_on',
      confidence: 0.9,
      sourceFactIds: ['fact-active'],
      workspaceId: 'ws-1',
      createdAt: '2026-07-12T00:00:00.000Z',
    }

    await write(
      'facts/facts.jsonl',
      `${JSON.stringify(fact('fact-active', 'active'))}\n${JSON.stringify(fact('fact-proposed', 'proposed'))}\n`,
    )
    await write('graph/edges.jsonl', `${JSON.stringify(edge)}\n`)
    await write('wiki/pages/published.md', '# Published\n')
    await write('wiki/pages/draft.md', '# Draft\n')
    await write(
      'wiki/pages-index.json',
      JSON.stringify({
        version: 1,
        pages: [
          { slug: 'published', title: 'Published', relativePath: 'wiki/pages/published.md', tags: ['docs'], status: 'published', sourceFactIds: ['fact-active'], updatedAt: '2026-07-12T00:00:00.000Z', version: 1, workspaceId: 'ws-1' },
          { slug: 'draft', title: 'Draft', relativePath: 'wiki/pages/draft.md', tags: [], status: 'draft', sourceFactIds: [], updatedAt: '2026-07-12T00:00:00.000Z', version: 1, workspaceId: 'ws-1' },
        ],
      }),
    )

    const result = await new KnowledgeTruthService().list()

    expect(result.facts.map((item) => item.id)).toEqual(['fact-active'])
    expect(result.wikiPages).toEqual([
      expect.objectContaining({ slug: 'published', markdown: '# Published\n' }),
    ])
    expect(result.graphEdges).toEqual([edge])
  })

  it('returns an honest empty snapshot when truth files are absent', async () => {
    await expect(new KnowledgeTruthService().list()).resolves.toEqual({
      facts: [],
      wikiPages: [],
      graphEdges: [],
    })
  })

  it('skips malformed and structurally invalid persisted records', async () => {
    const validFact: MemoryFact = {
      id: 'fact-valid',
      content: 'Valid fact',
      concepts: [],
      files: [],
      tags: [],
      confidence: 0.8,
      version: 1,
      status: 'active',
      provenance: {
        workspaceId: 'ws-1',
        workspaceName: 'Workspace',
        workspacePath: 'C:/work',
        source: 'manual',
        sourceObservationIds: [],
        fileRefs: [],
        actor: 'tester',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    }
    const validEdge: GraphEdge = {
      id: 'edge-valid',
      from: 'A',
      to: 'B',
      type: 'depends_on',
      confidence: 0.7,
      sourceFactIds: ['fact-valid'],
      workspaceId: 'ws-1',
      createdAt: '2026-07-12T00:00:00.000Z',
    }

    await write(
      'facts/facts.jsonl',
      `${JSON.stringify(validFact)}\nnot-json\n${JSON.stringify({ id: 'invalid', status: 'active' })}\n`,
    )
    await write(
      'graph/edges.jsonl',
      `${JSON.stringify(validEdge)}\n{broken\n${JSON.stringify({ id: 'invalid-edge', type: 'depends_on' })}\n`,
    )
    await write(
      'wiki/pages-index.json',
      JSON.stringify({
        version: 1,
        pages: [
          { status: 'published', relativePath: 'wiki/pages/incomplete.md' },
          { slug: 'missing', title: 'Missing', relativePath: 'wiki/pages/missing.md', tags: [], status: 'published', sourceFactIds: [], updatedAt: '2026-07-12T00:00:00.000Z', version: 1, workspaceId: 'ws-1' },
        ],
      }),
    )

    await expect(new KnowledgeTruthService().list()).resolves.toEqual({
      facts: [validFact],
      wikiPages: [],
      graphEdges: [validEdge],
    })
  })
})
