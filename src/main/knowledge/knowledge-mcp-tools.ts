import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import type {
  KnowledgeContextRequest,
  KnowledgeContextResult,
} from '../../shared/knowledge'
import { knowledgeContextService } from './context-service'

const inputSchema = {
  query: z.string().describe('BM25 query over accepted JanusX truth records.'),
  workspaceId: z.string().optional().describe('Workspace identity used for default-safe scope.'),
  workspacePath: z.string().optional().describe('Workspace path fallback when no workspaceId is available.'),
  allowGlobal: z.boolean().optional().describe('Explicitly allow recall across workspaces.'),
  maxItems: z.number().int().min(0).optional().describe('Maximum returned structured items.'),
  maxChars: z.number().int().min(0).optional().describe('Maximum compact-context characters.'),
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

type ContextService = Pick<typeof knowledgeContextService, 'search'>

function failure(error: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: error instanceof Error ? error.message : 'Knowledge context request failed',
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

export function registerKnowledgeMcpTools(
  server: McpServer,
  contextService: ContextService = knowledgeContextService,
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
}

export function createKnowledgeMcpServer(
  contextService: ContextService = knowledgeContextService,
): McpServer {
  const server = new McpServer({ name: 'janusx-knowledge', version: '1.0.0' })
  registerKnowledgeMcpTools(server, contextService)
  return server
}
