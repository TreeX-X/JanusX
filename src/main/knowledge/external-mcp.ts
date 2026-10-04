import { app } from 'electron'
import { access, copyFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeRootPath } from './constants'
import { clientEntry, desiredEntry, MCP_KEY, updateClientConfig, type McpConfigFormat, type McpLaunch } from './mcp-client-config'
import type { ExternalMcpClientId, ExternalMcpStatus, ExternalMcpRegisterResult, ExternalMcpProbeResult } from '../../shared/ipc/knowledge'
export type { ExternalMcpClientId, ExternalMcpStatus, ExternalMcpRegisterResult } from '../../shared/ipc/knowledge'

// Note: client-specific configuration and live service diagnostics — see .agents/notes/2026-10-04-mcp-terminal-coverage--b74b3c92.md
export const EXTERNAL_MCP_SERVER_KEY = MCP_KEY
export const EXTERNAL_MCP_CLIENTS: ReadonlyArray<{ id: ExternalMcpClientId; label: string; format?: McpConfigFormat }> = [
  { id: 'claude-code', label: 'Claude Code', format: 'mcpServers' },
  { id: 'codex', label: 'Codex', format: 'codex' },
  { id: 'opencode', label: 'OpenCode', format: 'opencode' },
  { id: 'janus', label: 'Janus CLI' }, { id: 'pi', label: 'Pi' }, { id: 'dsh', label: 'DeepSeek / dsh' },
]
export interface ExternalMcpDirs {
  homeDir: string; serverEntry: string
  command?: string; env?: Record<string, string>; codexHome?: string; configHome?: string
}
export function defaultExternalMcpDirs(): ExternalMcpDirs {
  const homeDir = homedir()
  return {
    homeDir,
    serverEntry: app.isPackaged ? join(app.getAppPath(), 'out', 'main', 'knowledge-mcp.js')
      : join(process.env.JANUSX_DEV_BUILD_ROOT ?? join(app.getAppPath(), 'out'), 'main', 'knowledge-mcp.js'),
    command: app.isPackaged ? process.execPath : 'node',
    env: { ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}), JANUSX_KNOWLEDGE_ROOT: knowledgeRootPath(),
      JANUSX_CONFIG_PATH: typeof app.getPath === 'function' ? join(app.getPath('userData'), 'janusx', 'config.json') : join(dirname(knowledgeRootPath()), 'config.json') },
    codexHome: process.env.CODEX_HOME, configHome: process.env.XDG_CONFIG_HOME,
  }
}
export function clientConfigPath(client: ExternalMcpClientId, dirs: ExternalMcpDirs): string {
  switch (client) {
    case 'claude-code': return join(dirs.homeDir, '.claude.json')
    case 'codex': return join(dirs.codexHome || join(dirs.homeDir, '.codex'), 'config.toml')
    case 'opencode': return join(dirs.configHome || join(dirs.homeDir, '.config'), 'opencode', 'opencode.json')
    default: return ''
  }
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true } catch { return false } }
async function optionalRead(path: string): Promise<string> {
  try { return await readFile(path, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error }
}
async function resolveConfigPath(client: ExternalMcpClientId, dirs: ExternalMcpDirs): Promise<string> {
  const path = clientConfigPath(client, dirs)
  return client === 'opencode' && await exists(`${path}c`) ? `${path}c` : path
}
export function externalMcpLaunch(dirs: ExternalMcpDirs): McpLaunch {
  return { command: dirs.command || 'node', args: [dirs.serverEntry], ...(dirs.env ? { env: dirs.env } : {}) }
}
export async function getExternalMcpStatus(dirs = defaultExternalMcpDirs()): Promise<ExternalMcpStatus> {
  const launch = externalMcpLaunch(dirs)
  const clients = await Promise.all(EXTERNAL_MCP_CLIENTS.map(async client => {
    const configPath = await resolveConfigPath(client.id, dirs)
    if (!client.format) return { id: client.id, label: client.label, configPath, registered: false, support: 'unverified' as const }
    try {
      const entry = clientEntry(await optionalRead(configPath), client.format)
      return { id: client.id, label: client.label, configPath, format: client.format, support: 'automatic' as const,
        registered: entry !== undefined, current: entry !== undefined && isDeepStrictEqual(JSON.parse(JSON.stringify(entry)), desiredEntry(client.format, launch)) }
    } catch (error) { return { id: client.id, label: client.label, configPath, support: 'automatic' as const, registered: false, current: false, error: error instanceof Error ? error.message : String(error) } }
  }))
  return { entry: dirs.serverEntry, entryExists: await exists(dirs.serverEntry), isPackaged: app.isPackaged, launch, clients }
}
const writes = new SerialQueue()
export async function registerExternalMcpClient(client: ExternalMcpClientId, dirs = defaultExternalMcpDirs()): Promise<ExternalMcpRegisterResult> {
  return writes.run(async () => {
    const adapter = EXTERNAL_MCP_CLIENTS.find(entry => entry.id === client)
    if (!adapter?.format) return { ok: false, client, configPath: '', error: 'This client has no verified configuration adapter' }
    const configPath = await resolveConfigPath(client, dirs)
    let backedUpPath: string | undefined
    try {
      if (!await exists(dirs.serverEntry)) throw new Error('Knowledge MCP entry is missing. Rebuild development output with npm run build, or repair the installed application.')
      const before = await optionalRead(configPath)
      const after = updateClientConfig(before, adapter.format, externalMcpLaunch(dirs))
      if (before === after) return { ok: true, client, configPath }
      if (before) { backedUpPath = `${configPath}.bak-${Date.now()}`; await copyFile(configPath, backedUpPath) }
      if (await optionalRead(configPath) !== before) throw new Error('Client configuration changed; retry registration')
      await writeFileAtomic(configPath, after)
      return { ok: true, client, configPath, backedUpPath }
    } catch (error) { return { ok: false, client, configPath, backedUpPath, error: error instanceof Error ? error.message : String(error) } }
  })
}

/** Tests our generated launch specification, never arbitrary existing client commands. */
export async function probeExternalMcp(dirs = defaultExternalMcpDirs()): Promise<ExternalMcpProbeResult> {
  const result: ExternalMcpProbeResult = { ok: false, stage: 'start', tools: [] }
  const client = new Client({ name: 'janusx-mcp-diagnostic', version: '1.0.0' })
  const launch = externalMcpLaunch(dirs)
  const transport = new StdioClientTransport({ ...launch, env: { ...getDefaultEnvironment(), ...launch.env }, cwd: dirs.homeDir, stderr: 'pipe' })
  transport.stderr?.on('data', () => {})
  try {
    if (!await exists(dirs.serverEntry)) throw new Error('Knowledge MCP entry is missing')
    result.stage = 'handshake'
    await client.connect(transport, { timeout: 10000 })
    result.stage = 'tools'
    result.tools = (await client.listTools({}, { timeout: 10000 })).tools.map(tool => tool.name)
    if (!['knowledge_search', 'knowledge_context', 'wiki_list', 'wiki_get', 'fact_get'].every(name => result.tools.includes(name))) throw new Error('Required knowledge tools are missing')
    result.stage = 'query'
    const response = await client.callTool({ name: 'knowledge_context', arguments: { query: 'janusx-mcp-connectivity-check', workspaceId: '__janusx_mcp_probe__', maxItems: 0, maxChars: 0 } }, undefined, { timeout: 10000 })
    if (response.isError) throw new Error('Knowledge query was rejected; check the knowledge switches and data availability')
    const payload = response.structuredContent
    if (payload && typeof payload === 'object' && 'degraded' in payload && payload.degraded) throw new Error('Knowledge query is degraded; repair the knowledge store before retrying')
    result.ok = true
  } catch (error) { result.error = error instanceof Error ? error.message : String(error) }
  finally { await client.close().catch(() => {}); await transport.close().catch(() => {}) }
  return result
}
