import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createKnowledgeMcpServer } from '../../../src/main/knowledge/knowledge-mcp-tools'
import type { KnowledgeContextResult } from '../../../src/shared/knowledge'

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

async function connect(search = vi.fn(async () => result)) {
  const server = createKnowledgeMcpServer({ search })
  const client = new Client({ name: 'knowledge-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  clients.push(client)
  return { client, search }
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe('JanusX Knowledge MCP tools', () => {
  it('registers exactly two read-only tools with scope and budget schemas', async () => {
    const { client } = await connect()
    const listed = await client.listTools()

    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      'knowledge_context',
      'knowledge_search',
    ])
    for (const tool of listed.tools) {
      expect(tool.annotations).toEqual(expect.objectContaining({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }))
      expect(tool.inputSchema.properties).toEqual(expect.objectContaining({
        workspaceId: expect.any(Object),
        workspacePath: expect.any(Object),
        allowGlobal: expect.any(Object),
        maxItems: expect.any(Object),
        maxChars: expect.any(Object),
      }))
      expect(tool.inputSchema.required).toContain('query')
    }
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
})
