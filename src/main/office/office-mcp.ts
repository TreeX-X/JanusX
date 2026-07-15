#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { OfficeBroker, type OfficeBrokerRequest } from './office-broker'

export const OFFICE_MCP_TOOLS = [
  { name: 'office_create', description: 'Create a workspace-confined Office document with OfficeCLI.', inputSchema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, documentType: { enum: ['docx', 'xlsx', 'pptx'] } }, required: ['path'] } },
  { name: 'office_batch', description: 'Apply a structured OfficeCLI batch to an existing workspace document.', inputSchema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, batch: {} }, required: ['path', 'batch'] } },
  { name: 'office_help', description: 'Read bounded OfficeCLI help for create or batch.', inputSchema: { type: 'object', additionalProperties: false, properties: { topic: { enum: ['create', 'batch'] } }, required: ['topic'] } },
] as const

export async function runOfficeMcp(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const workspace = env.JANUSX_OFFICE_WORKSPACE
  const binary = env.JANUSX_OFFICECLI_BINARY
  if (!workspace || !binary) throw new Error('JANUSX_OFFICE_WORKSPACE and JANUSX_OFFICECLI_BINARY are required')
  const broker = await OfficeBroker.create(workspace, binary)
  const server = new Server({ name: 'janusx-office', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...OFFICE_MCP_TOOLS] }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!OFFICE_MCP_TOOLS.some((tool) => tool.name === request.params.name)) throw new Error('Unsupported Office tool')
    const result = await broker.invoke({ tool: request.params.name, ...(request.params.arguments ?? {}) } as OfficeBrokerRequest)
    return { content: [{ type: 'text', text: result.output }] }
  })
  await server.connect(new StdioServerTransport())
}

if (process.argv[1]?.endsWith('office-mcp.js')) void runOfficeMcp().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
