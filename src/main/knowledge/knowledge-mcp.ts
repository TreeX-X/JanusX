import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createKnowledgeMcpServer } from './knowledge-mcp-tools'

async function main(): Promise<void> {
  await createKnowledgeMcpServer().connect(new StdioServerTransport())
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Knowledge MCP server failed')
  process.exitCode = 1
})
