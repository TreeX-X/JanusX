#!/usr/bin/env node
// Note: standalone original-Note access; no desktop or generation dependencies — see .agents/notes/blueprint/note-mcp.md
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createNoteMcpServer } from './note-mcp-server'

const host = createNoteMcpServer()
host.server.connect(new StdioServerTransport()).catch(() => { console.error('Note MCP failed to start'); process.exitCode = 1 })
process.once('SIGTERM', () => { void host.close().finally(() => process.exit(0)) })
process.once('SIGINT', () => { void host.close().finally(() => process.exit(0)) })
