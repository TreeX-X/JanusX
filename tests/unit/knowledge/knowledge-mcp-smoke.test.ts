import { expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

it.skipIf(process.env.JANUSX_MCP_SMOKE !== '1')('serves real stored facts, isolates personal data and observes switch changes in a separate process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'janusx-mcp-smoke-'))
  const configPath = join(root, 'config.json')
  const config = (enabled: boolean) => writeFile(configPath, JSON.stringify({ experimentalFeatures: { knowledge: enabled }, knowledgeSettings: { enabled: true } }))
  const client = new Client({ name: 'janusx-acceptance', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.env.JANUSX_MCP_COMMAND || process.execPath,
    args: [resolve(process.env.JANUSX_MCP_ENTRY || 'artifacts/build-check/main/knowledge-mcp.js')], cwd: root, stderr: 'pipe',
    env: { ...getDefaultEnvironment(), ...(process.env.JANUSX_MCP_COMMAND ? { ELECTRON_RUN_AS_NODE: '1' } : {}), JANUSX_CONFIG_PATH: configPath, JANUSX_KNOWLEDGE_ROOT: join(root, 'knowledge') },
  })
  transport.stderr?.on('data', () => {})
  try {
    await config(true)
    await mkdir(join(root, 'knowledge', 'facts'), { recursive: true })
    const fact = (id: string, scope: 'project' | 'user') => ({ id, content: `Acceptance ${id}`, scope, concepts: [], files: [], tags: [], confidence: 1, version: 1, status: 'active', kind: 'fact',
      provenance: { workspaceId: scope === 'user' ? 'user' : 'fixture', workspaceName: 'Fixture', workspacePath: root, source: 'manual', sourceObservationIds: [], fileRefs: [], actor: 'test', createdAt: new Date().toISOString() } })
    await writeFile(join(root, 'knowledge', 'facts', 'facts.jsonl'), [fact('public-fact', 'project'), fact('private-fact', 'user')].map(value => JSON.stringify(value)).join('\n'))
    await client.connect(transport, { timeout: 10000 })
    expect((await client.listTools()).tools).toHaveLength(5)
    const found = await client.callTool({ name: 'fact_get', arguments: { id: 'public-fact', workspaceId: 'fixture' } })
    expect(found.isError).toBeFalsy()
    expect(found.structuredContent).toMatchObject({ content: 'Acceptance public-fact' })
    expect((await client.callTool({ name: 'fact_get', arguments: { id: 'private-fact', allowGlobal: true } })).isError).toBe(true)
    expect((await client.callTool({ name: 'wiki_list', arguments: {} })).isError).toBe(true)
    await config(false)
    expect((await client.callTool({ name: 'fact_get', arguments: { id: 'public-fact', workspaceId: 'fixture' } })).isError).toBe(true)
    await config(true)
    expect((await client.callTool({ name: 'fact_get', arguments: { id: 'public-fact', workspaceId: 'fixture' } })).isError).toBeFalsy()
  } finally { await client.close(); await transport.close(); await rm(root, { recursive: true, force: true }) }
}, 30000)
