import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import type {
  KnowledgeContextRequest,
  KnowledgeContextResult,
  KnowledgeTruthSnapshot,
  MemoryFact,
  WikiPage,
} from '../../shared/knowledge'
import { knowledgeContextService } from './context-service'
import { knowledgeTruthService } from './truth-service'

const inputSchema = {
  query: z.string().describe('BM25 query over accepted JanusX truth records.'),
  workspaceId: z.string().optional().describe('Workspace identity used for default-safe scope.'),
  workspacePath: z.string().optional().describe('Workspace path fallback when no workspaceId is available.'),
  allowGlobal: z.boolean().optional().describe('Explicitly allow recall across workspaces.'),
  maxItems: z.number().int().min(0).optional().describe('Maximum returned structured items.'),
  maxChars: z.number().int().min(0).optional().describe('Maximum compact-context characters.'),
  agentId: z.string().optional().describe('Phase 3: filter evidence by producing agent.'),
  sessionId: z.string().optional().describe('Phase 3: filter evidence by owning session.'),
  since: z.string().optional().describe('Phase 3: only records created at or after this ISO time.'),
  until: z.string().optional().describe('Phase 3: only records created at or before this ISO time.'),
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

type ContextService = Pick<typeof knowledgeContextService, 'search'>
type TruthService = Pick<typeof knowledgeTruthService, 'list'>

const WORKSPACE_ID_SCHEMA = z.string().optional().describe('Filter to one workspace; omit to include all workspaces.')

function failure(error: unknown) {
  const text = error instanceof Error
    ? error.message
    : typeof error === 'string' && error.length > 0
      ? error
      : 'Knowledge context request failed'
  return {
    content: [{
      type: 'text' as const,
      text,
    }],
    isError: true,
  }
}

function searchPayload(result: KnowledgeContextResult) {
  return {
    items: result.items,
    truncated: result.truncated,
    eligibleCount: result.eligibleCount,
    maxItems: result.maxItems,
    maxChars: result.maxChars,
    ...(result.degraded ? { degraded: result.degraded } : {}),
  }
}

function inWorkspace(workspaceId: string | undefined, value: string): boolean {
  return workspaceId === undefined || value === workspaceId
}

function wikiListPayload(snapshot: KnowledgeTruthSnapshot, workspaceId?: string) {
  const pages = snapshot.wikiPages
    .filter((page) => inWorkspace(workspaceId, page.workspaceId))
    .map((page) => ({
      slug: page.slug,
      title: page.title,
      tags: page.tags,
      version: page.version,
      updatedAt: page.updatedAt,
      factCount: page.sourceFactIds.length,
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  return { pages, total: pages.length }
}

function wikiGetPayload(snapshot: KnowledgeTruthSnapshot, slug: string, workspaceId?: string, maxChars?: number) {
  const wanted = slug.trim().toLowerCase()
  const page: WikiPage | undefined = snapshot.wikiPages
    .filter((entry) => inWorkspace(workspaceId, entry.workspaceId))
    .find((entry) => entry.slug === slug || entry.slug.toLowerCase() === wanted)
  if (!page) return null
  const facts = new Map(snapshot.facts.map((fact) => [fact.id, fact]))
  const linkedFacts = page.sourceFactIds
    .map((id) => facts.get(id))
    .filter((fact): fact is MemoryFact => Boolean(fact))
    .filter((fact) => inWorkspace(workspaceId, fact.provenance.workspaceId))
    .map((fact) => ({ id: fact.id, content: fact.content, confidence: fact.confidence }))
  const limit = maxChars === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(maxChars))
  const truncated = page.markdown.length > limit
  return {
    slug: page.slug,
    title: page.title,
    markdown: truncated ? page.markdown.slice(0, limit) : page.markdown,
    truncated,
    tags: page.tags,
    version: page.version,
    updatedAt: page.updatedAt,
    sourceFactIds: page.sourceFactIds,
    linkedFacts,
  }
}

function factGetPayload(snapshot: KnowledgeTruthSnapshot, id: string, workspaceId?: string) {
  const fact = snapshot.facts.find((entry) => entry.id === id && inWorkspace(workspaceId, entry.provenance.workspaceId))
  if (!fact) return null
  // Reverse bridge of wiki_get.linkedFacts: pages summarizing this fact.
  const referencingPages = snapshot.wikiPages
    .filter((page) => page.sourceFactIds.includes(id) && inWorkspace(workspaceId, page.workspaceId))
    .map((page) => ({ slug: page.slug, title: page.title }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  return { ...fact, referencingPages }
}

function respond(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  }
}

export function registerKnowledgeMcpTools(
  server: McpServer,
  contextService: ContextService = knowledgeContextService,
  truthService: TruthService = knowledgeTruthService,
): void {
  server.registerTool('knowledge_search', {
    description: 'Search accepted JanusX truth and return ranked structured items with provenance.',
    inputSchema,
    annotations: readOnlyAnnotations,
  }, async (request: KnowledgeContextRequest) => {
    try {
      const payload = searchPayload(await contextService.search(request))
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    } catch (error) {
      return failure(error)
    }
  })

  server.registerTool('knowledge_context', {
    description: 'Build bounded compact context from accepted JanusX truth with structured provenance.',
    inputSchema,
    annotations: readOnlyAnnotations,
  }, async (request: KnowledgeContextRequest) => {
    try {
      const result = await contextService.search(request)
      return {
        content: [{ type: 'text', text: result.compactContext }],
        structuredContent: { ...result },
      }
    } catch (error) {
      return failure(error)
    }
  })

  server.registerTool('wiki_list', {
    description: 'List published JanusX wiki pages (slug index) for fast knowledge lookup. Read a page with wiki_get.',
    inputSchema: { workspaceId: WORKSPACE_ID_SCHEMA },
    annotations: readOnlyAnnotations,
  }, async (request: { workspaceId?: string }) => {
    try {
      const snapshot = await truthService.list()
      return respond(wikiListPayload(snapshot, request.workspaceId?.trim() || undefined))
    } catch (error) {
      return failure(error)
    }
  })

  server.registerTool('wiki_get', {
    description: 'Read one published JanusX wiki page with its linked settled facts. Use wiki_list to discover slugs.',
    inputSchema: {
      slug: z.string().describe('Wiki page slug from wiki_list.'),
      workspaceId: WORKSPACE_ID_SCHEMA,
      maxChars: z.number().int().min(0).optional().describe('Maximum markdown characters; longer pages report truncated=true.'),
    },
    annotations: readOnlyAnnotations,
  }, async (request: { slug: string; workspaceId?: string; maxChars?: number }) => {
    try {
      const snapshot = await truthService.list()
      const payload = wikiGetPayload(snapshot, request.slug, request.workspaceId?.trim() || undefined, request.maxChars)
      if (!payload) return failure(`Wiki page not found: ${request.slug}`)
      return respond(payload)
    } catch (error) {
      return failure(error)
    }
  })

  server.registerTool('fact_get', {
    description: 'Read one settled JanusX fact with full provenance and the wiki pages referencing it.',
    inputSchema: {
      id: z.string().describe('Memory fact id.'),
      workspaceId: WORKSPACE_ID_SCHEMA,
    },
    annotations: readOnlyAnnotations,
  }, async (request: { id: string; workspaceId?: string }) => {
    try {
      const snapshot = await truthService.list()
      const payload = factGetPayload(snapshot, request.id, request.workspaceId?.trim() || undefined)
      if (!payload) return failure(`Settled fact not found: ${request.id}`)
      return respond(payload)
    } catch (error) {
      return failure(error)
    }
  })
}

export function createKnowledgeMcpServer(
  contextService: ContextService = knowledgeContextService,
  truthService: TruthService = knowledgeTruthService,
): McpServer {
  const server = new McpServer({ name: 'janusx-knowledge', version: '1.0.0' })
  registerKnowledgeMcpTools(server, contextService, truthService)
  return server
}
