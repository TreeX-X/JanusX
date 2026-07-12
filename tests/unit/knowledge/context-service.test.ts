import { describe, expect, it, vi } from 'vitest'
import { KnowledgeContextService } from '../../../src/main/knowledge/context-service'
import type {
  GraphEdge,
  KnowledgeProvenance,
  KnowledgeTruthSnapshot,
  MemoryFact,
  WikiPage,
} from '../../../src/shared/knowledge'

function provenance(workspaceId: string, workspacePath: string): KnowledgeProvenance {
  return {
    workspaceId,
    workspaceName: workspaceId,
    workspacePath,
    source: 'manual',
    sourceObservationIds: [`obs-${workspaceId}`],
    fileRefs: [`src/${workspaceId}.ts`],
    actor: 'tester',
    createdAt: '2026-07-12T00:00:00.000Z',
  }
}

function fact(id: string, workspaceId: string, content: string): MemoryFact {
  return {
    id,
    content,
    concepts: ['context'],
    files: [],
    tags: [],
    confidence: 0.9,
    version: 1,
    status: 'active',
    provenance: provenance(workspaceId, `C:/${workspaceId}`),
  }
}

function wiki(workspaceId: string): WikiPage {
  return {
    slug: `wiki-${workspaceId}`,
    title: 'Context Wiki',
    markdown: 'BM25 context from a published wiki page.',
    tags: [],
    status: 'published',
    sourceFactIds: [`fact-${workspaceId}`],
    updatedAt: '2026-07-12T00:00:00.000Z',
    version: 1,
    workspaceId,
  }
}

function edge(workspaceId: string): GraphEdge {
  return {
    id: `edge-${workspaceId}`,
    from: 'ContextService',
    to: 'BM25',
    type: 'depends_on',
    confidence: 0.8,
    sourceFactIds: [`fact-${workspaceId}`],
    workspaceId,
    createdAt: '2026-07-12T00:00:00.000Z',
  }
}

function service(snapshot: KnowledgeTruthSnapshot): KnowledgeContextService {
  return new KnowledgeContextService({ list: vi.fn(async () => snapshot) })
}

describe('KnowledgeContextService', () => {
  it('requires workspace scope unless global recall is explicit', async () => {
    const context = service({
      facts: [fact('fact-a', 'workspace-a', 'BM25 context alpha'), fact('fact-b', 'workspace-b', 'BM25 context beta')],
      wikiPages: [],
      graphEdges: [],
    })

    const missingScope = await context.search({ query: 'BM25 context' })
    expect(missingScope.items).toEqual([])
    expect(missingScope.degraded?.reason).toBe('missing-workspace')

    const scoped = await context.search({ query: 'BM25 context', workspaceId: 'workspace-a' })
    expect(scoped.items.map((item) => item.id)).toEqual(['fact-a'])

    const global = await context.search({ query: 'BM25 context', allowGlobal: true })
    expect(global.items.map((item) => item.id).sort()).toEqual(['fact-a', 'fact-b'])
  })

  it('uses workspace path only when no workspace id is supplied', async () => {
    const context = service({
      facts: [fact('fact-a', 'workspace-a', 'path scoped context')],
      wikiPages: [wiki('workspace-a')],
      graphEdges: [edge('workspace-a')],
    })

    const result = await context.search({
      query: 'context',
      workspacePath: 'c:\\workspace-a\\',
    })

    expect(result.items.map((item) => item.id)).toEqual(['fact-a'])
  })

  it('ranks truth kinds with BM25 and returns source provenance', async () => {
    const context = service({
      facts: [fact('fact-a', 'workspace-a', 'BM25 bounded context service')],
      wikiPages: [wiki('workspace-a')],
      graphEdges: [edge('workspace-a')],
    })

    const result = await context.search({
      query: 'BM25 context',
      workspaceId: 'workspace-a',
    })

    expect(result.items.map((item) => item.kind).sort()).toEqual(['fact', 'graph', 'wiki'])
    expect(result.items[0]?.score).toBeGreaterThan(0)
    expect(result.items.find((item) => item.kind === 'fact')?.provenance).toEqual(
      expect.objectContaining({
        observationIds: ['obs-workspace-a'],
        factIds: ['fact-a'],
        fileRefs: ['src/workspace-a.ts'],
        source: 'manual',
        actor: 'tester',
      }),
    )
    expect(result.compactContext).toContain('[fact]')
    expect(result.compactContext).toContain('observation:obs-workspace-a')
  })

  it('enforces item and character budgets with truthful truncation', async () => {
    const context = service({
      facts: [
        fact('fact-a', 'workspace-a', 'bounded context alpha'),
        fact('fact-b', 'workspace-a', 'bounded context beta'),
      ],
      wikiPages: [],
      graphEdges: [],
    })

    const itemLimited = await context.search({
      query: 'bounded context',
      workspaceId: 'workspace-a',
      maxItems: 1,
      maxChars: 2_000,
    })
    expect(itemLimited.items).toHaveLength(1)
    expect(itemLimited.eligibleCount).toBe(2)
    expect(itemLimited.truncated).toBe(true)

    const charLimited = await context.search({
      query: 'bounded context',
      workspaceId: 'workspace-a',
      maxItems: 5,
      maxChars: 20,
    })
    expect(charLimited.items).toEqual([])
    expect(charLimited.compactContext.length).toBeLessThanOrEqual(20)
    expect(charLimited.truncated).toBe(true)
  })

  it('derives compact context only from returned items and handles empty inputs', async () => {
    const empty = service({ facts: [], wikiPages: [], graphEdges: [] })
    await expect(empty.search({ query: 'context', workspaceId: 'workspace-a' })).resolves.toEqual(
      expect.objectContaining({ items: [], compactContext: '', truncated: false, eligibleCount: 0 }),
    )

    const result = await service({
      facts: [fact('fact-a', 'workspace-a', 'derived compact content')],
      wikiPages: [],
      graphEdges: [],
    }).search({ query: 'derived compact', workspaceId: 'workspace-a' })
    expect(result.items).toHaveLength(1)
    expect(result.compactContext).toContain(result.items[0]!.content)

    const blank = await empty.search({ query: '   ', workspaceId: 'workspace-a' })
    expect(blank).toEqual(expect.objectContaining({ items: [], compactContext: '', truncated: false }))
    expect(blank.degraded?.reason).toBe('empty-query')
  })

  it('keeps identical public ids distinct across workspaces during global recall', async () => {
    const context = service({
      facts: [
        fact('shared-id', 'workspace-a', 'shared global context'),
        fact('shared-id', 'workspace-b', 'shared global context'),
      ],
      wikiPages: [],
      graphEdges: [],
    })

    const result = await context.search({ query: 'shared global', allowGlobal: true })

    expect(result.items).toHaveLength(2)
    expect(result.items.map((item) => item.id)).toEqual(['shared-id', 'shared-id'])
    expect(result.items.map((item) => item.workspaceId).sort()).toEqual([
      'workspace-a',
      'workspace-b',
    ])
    expect(result.eligibleCount).toBe(2)
  })

  it('deduplicates logical records deterministically before ranking', async () => {
    const older = fact('duplicate', 'workspace-a', 'duplicate context older')
    const newer = {
      ...fact('duplicate', 'workspace-a', 'duplicate context newer'),
      provenance: {
        ...provenance('workspace-a', 'C:/workspace-a'),
        createdAt: '2026-07-13T00:00:00.000Z',
      },
    }
    const search = (facts: MemoryFact[]) => service({ facts, wikiPages: [], graphEdges: [] })
      .search({ query: 'duplicate context', workspaceId: 'workspace-a' })

    const forward = await search([older, newer])
    const reversed = await search([newer, older])

    expect(forward.items).toHaveLength(1)
    expect(forward.items[0]?.content).toBe('duplicate context newer')
    expect(forward.eligibleCount).toBe(1)
    expect(forward.truncated).toBe(false)
    expect(reversed.items).toEqual(forward.items)
  })

  it('uses logical identity as the stable equal-score tie breaker', async () => {
    const search = (facts: MemoryFact[]) => service({ facts, wikiPages: [], graphEdges: [] })
      .search({ query: 'equal score context', workspaceId: 'workspace-a' })
    const first = fact('a', 'workspace-a', 'equal score context')
    const second = fact('z', 'workspace-a', 'equal score context')

    const forward = await search([second, first])
    const reversed = await search([first, second])

    expect(forward.items.map((item) => item.id)).toEqual(['a', 'z'])
    expect(reversed.items.map((item) => item.id)).toEqual(['a', 'z'])
  })
})
