import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createKnowledgeMcpServer } from '../../../src/main/knowledge/knowledge-mcp-tools'
import type {
  KnowledgeContextResult,
  KnowledgeTruthSnapshot,
  MemoryFact,
  WikiPage,
} from '../../../src/shared/knowledge'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

const result: KnowledgeContextResult = {
  items: [{
    id: 'fact-1',
    kind: 'fact',
    title: 'Context',
    content: 'Accepted context',
    score: 1.2,
    workspaceId: 'workspace-a',
    workspacePath: 'C:/workspace-a',
    provenance: {
      observationIds: ['obs-1'],
      factIds: ['fact-1'],
      fileRefs: ['src/a.ts'],
      source: 'manual',
      actor: 'tester',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
  }],
  compactContext: '[fact] Context\nAccepted context',
  truncated: false,
  eligibleCount: 1,
  maxItems: 8,
  maxChars: 4000,
}

const clients: Client[] = []

function fact(id: string, workspaceId = 'workspace-a'): MemoryFact {
  return {
    id,
    content: `Settled content of ${id}.`,
    concepts: [],
    files: [],
    tags: [],
    confidence: 0.9,
    version: 1,
    status: 'active',
    kind: 'fact',
    provenance: {
      workspaceId,
      workspaceName: workspaceId,
      workspacePath: `C:/${workspaceId}`,
      source: 'manual',
      sourceObservationIds: ['obs-1'],
      fileRefs: [],
      actor: 'tester',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
  }
}

function wikiPage(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    slug: 'persistence-design',
    title: 'Persistence Design',
    markdown: '# Persistence Design\n\nPostgres chosen for durability.',
    tags: ['design'],
    status: 'published',
    sourceFactIds: ['fact-1'],
    updatedAt: '2026-07-12T00:00:00.000Z',
    version: 2,
    workspaceId: 'workspace-a',
    ...overrides,
  }
}

function truthSnapshot(): KnowledgeTruthSnapshot {
  return {
    facts: [fact('fact-1'), fact('fact-2', 'workspace-b')],
    wikiPages: [wikiPage(), wikiPage({ slug: 'other-page', title: 'Other', sourceFactIds: [], workspaceId: 'workspace-b' })],
    graphEdges: [],
  }
}

async function connect(
  search = vi.fn(async () => result),
  list = vi.fn(async () => truthSnapshot()),
) {
  const server = createKnowledgeMcpServer({ search }, { list })
  const client = new Client({ name: 'knowledge-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  clients.push(client)
  return { client, search, list }
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe('JanusX Knowledge MCP tools', () => {
  it('registers five read-only tools: search, context, wiki list/get, fact get', async () => {
    const { client } = await connect()
    const listed = await client.listTools()

    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      'fact_get',
      'knowledge_context',
      'knowledge_search',
      'wiki_get',
      'wiki_list',
    ])
    for (const tool of listed.tools) {
      expect(tool.annotations).toEqual(expect.objectContaining({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }))
    }
    const byName = new Map(listed.tools.map((tool) => [tool.name, tool]))
    expect(byName.get('knowledge_search')!.inputSchema.properties).toEqual(expect.objectContaining({
      workspaceId: expect.any(Object),
      workspacePath: expect.any(Object),
      allowGlobal: expect.any(Object),
      maxItems: expect.any(Object),
      maxChars: expect.any(Object),
    }))
    expect(byName.get('knowledge_search')!.inputSchema.required).toContain('query')
    expect(byName.get('knowledge_context')!.inputSchema.required).toContain('query')
    expect(byName.get('wiki_get')!.inputSchema.required).toContain('slug')
    expect(byName.get('fact_get')!.inputSchema.required).toContain('id')
    expect(byName.get('wiki_list')!.inputSchema.properties).toEqual(expect.objectContaining({
      workspaceId: expect.any(Object),
    }))
  })

  it('routes both tools through the same context service with distinct response emphasis', async () => {
    const { client, search } = await connect()
    const request = { query: 'context', workspaceId: 'workspace-a', maxItems: 3, maxChars: 500 }

    const searchResponse = await client.callTool({ name: 'knowledge_search', arguments: request })
    const contextResponse = await client.callTool({ name: 'knowledge_context', arguments: request })

    expect(search).toHaveBeenNthCalledWith(1, request)
    expect(search).toHaveBeenNthCalledWith(2, request)
    expect(searchResponse.structuredContent).toEqual(expect.objectContaining({
      items: result.items,
      eligibleCount: 1,
      truncated: false,
    }))
    expect(searchResponse.structuredContent).not.toHaveProperty('compactContext')
    expect(contextResponse.content).toEqual([
      { type: 'text', text: result.compactContext },
    ])
    expect(contextResponse.structuredContent).toEqual(result)
  })

  it('returns an honest tool error when the context service fails', async () => {
    const { client } = await connect(vi.fn(async () => { throw new Error('truth store unavailable') }))

    const response = await client.callTool({
      name: 'knowledge_context',
      arguments: { query: 'context', workspaceId: 'workspace-a' },
    })

    expect(response.isError).toBe(true)
    expect(response.content).toEqual([{ type: 'text', text: 'truth store unavailable' }])
    expect(response.structuredContent).toBeUndefined()
  })

  it('lists the wiki slug index with workspace scoping', async () => {
    const { client, list } = await connect()

    const all = await client.callTool({ name: 'wiki_list', arguments: {} })
    expect(list).toHaveBeenCalledTimes(1)
    expect(all.isError).toBeFalsy()
    expect(all.structuredContent).toEqual({
      pages: [
        {
          slug: 'other-page',
          title: 'Other',
          tags: ['design'],
          version: 2,
          updatedAt: '2026-07-12T00:00:00.000Z',
          factCount: 0,
        },
        {
          slug: 'persistence-design',
          title: 'Persistence Design',
          tags: ['design'],
          version: 2,
          updatedAt: '2026-07-12T00:00:00.000Z',
          factCount: 1,
        },
      ],
      total: 2,
    })

    const scoped = await client.callTool({ name: 'wiki_list', arguments: { workspaceId: 'workspace-a' } })
    expect(scoped.structuredContent).toEqual({
      pages: [
        {
          slug: 'persistence-design',
          title: 'Persistence Design',
          tags: ['design'],
          version: 2,
          updatedAt: '2026-07-12T00:00:00.000Z',
          factCount: 1,
        },
      ],
      total: 1,
    })
  })

  it('reads a wiki page with linked settled facts and honors maxChars', async () => {
    const { client } = await connect()

    const full = await client.callTool({ name: 'wiki_get', arguments: { slug: 'persistence-design' } })
    expect(full.isError).toBeFalsy()
    expect(full.structuredContent).toEqual(expect.objectContaining({
      slug: 'persistence-design',
      title: 'Persistence Design',
      truncated: false,
      sourceFactIds: ['fact-1'],
      linkedFacts: [{ id: 'fact-1', content: 'Settled content of fact-1.', confidence: 0.9 }],
    }))

    const cut = await client.callTool({ name: 'wiki_get', arguments: { slug: 'persistence-design', maxChars: 10 } })
    expect(cut.structuredContent).toEqual(expect.objectContaining({
      markdown: '# Persiste',
      truncated: true,
    }))

    const missing = await client.callTool({ name: 'wiki_get', arguments: { slug: 'ghost-page' } })
    expect(missing.isError).toBe(true)
    expect(missing.content).toEqual([{ type: 'text', text: 'Wiki page not found: ghost-page' }])
  })

  it('reads a settled fact by id with workspace scoping', async () => {
    const { client } = await connect()

    const found = await client.callTool({ name: 'fact_get', arguments: { id: 'fact-1' } })
    expect(found.isError).toBeFalsy()
    expect(found.structuredContent).toEqual(expect.objectContaining({
      id: 'fact-1',
      status: 'active',
      referencingPages: [{ slug: 'persistence-design', title: 'Persistence Design' }],
    }))

    const unreferenced = await client.callTool({ name: 'fact_get', arguments: { id: 'fact-2' } })
    expect(unreferenced.structuredContent).toEqual(expect.objectContaining({
      id: 'fact-2',
      referencingPages: [],
    }))

    const wrongScope = await client.callTool({ name: 'fact_get', arguments: { id: 'fact-1', workspaceId: 'workspace-b' } })
    expect(wrongScope.isError).toBe(true)

    const missing = await client.callTool({ name: 'fact_get', arguments: { id: 'ghost-fact' } })
    expect(missing.isError).toBe(true)
    expect(missing.content).toEqual([{ type: 'text', text: 'Settled fact not found: ghost-fact' }])
  })
})
