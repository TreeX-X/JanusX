/**
 * @file External MCP client registration for the JanusX knowledge server.
 * @description Writes the `janusx-knowledge` stdio entry into third-party MCP
 *              client configs (Cursor / VS Code / Claude Code) so external
 *              terminals can call wiki_list, wiki_get, fact_get,
 *              knowledge_search and knowledge_context without hand-editing
 *              JSON. Existing files are merged in place; only the
 *              `janusx-knowledge` key under `mcpServers` is touched.
 *              Corrupt JSON is backed up next to the original before rewrite.
 */

import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { homedir } from 'os'

export const EXTERNAL_MCP_SERVER_KEY = 'janusx-knowledge'

export type ExternalMcpClientId = 'cursor' | 'vscode' | 'claude-code'

export const EXTERNAL_MCP_CLIENTS: ReadonlyArray<{ id: ExternalMcpClientId; label: string }> = [
  { id: 'cursor', label: 'Cursor' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'claude-code', label: 'Claude Code' },
]

export interface ExternalMcpDirs {
  homeDir: string
  appDataDir: string
  serverEntry: string
}

export interface ExternalMcpClientStatus {
  id: ExternalMcpClientId
  label: string
  configPath: string
  registered: boolean
}

export interface ExternalMcpStatus {
  entry: string
  entryExists: boolean
  isPackaged: boolean
  clients: ExternalMcpClientStatus[]
}

export interface ExternalMcpRegisterResult {
  ok: boolean
  client: ExternalMcpClientId
  configPath: string
  backedUpPath?: string
  error?: string
}

function defaultHomeDir(): string {
  return homedir()
}

function defaultAppDataDir(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support')
  }
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

function defaultServerEntry(): { entry: string; isPackaged: boolean } {
  const isPackaged = app.isPackaged
  const entry = isPackaged
    // Packaged builds keep main output unpacked-adjacent; existence is still
    // verified by the caller so a missing entry reports honestly.
    ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'knowledge-mcp.js')
    : join(app.getAppPath(), 'out', 'main', 'knowledge-mcp.js')
  return { entry, isPackaged }
}

export function defaultExternalMcpDirs(): ExternalMcpDirs {
  return {
    homeDir: defaultHomeDir(),
    appDataDir: defaultAppDataDir(),
    serverEntry: defaultServerEntry().entry,
  }
}

export function clientConfigPath(client: ExternalMcpClientId, dirs: ExternalMcpDirs): string {
  switch (client) {
    case 'cursor':
      return join(dirs.homeDir, '.cursor', 'mcp.json')
    case 'vscode':
      return join(dirs.appDataDir, 'Code', 'User', 'mcp.json')
    case 'claude-code':
      return join(dirs.homeDir, '.claude.json')
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

interface JsonRead {
  data: Record<string, unknown> | null
  corrupt: boolean
}

async function readJsonObject(path: string): Promise<JsonRead> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { data: null, corrupt: false }
    throw error
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { data: null, corrupt: true }
    }
    return { data: parsed as Record<string, unknown>, corrupt: false }
  } catch {
    return { data: null, corrupt: true }
  }
}

function serversOf(data: Record<string, unknown>): Record<string, unknown> {
  const servers = data.mcpServers
  if (typeof servers === 'object' && servers !== null && !Array.isArray(servers)) {
    return servers as Record<string, unknown>
  }
  return {}
}

export async function getExternalMcpStatus(dirs: ExternalMcpDirs = defaultExternalMcpDirs()): Promise<ExternalMcpStatus> {
  const entryExists = await fileExists(dirs.serverEntry)
  let isPackaged = false
  try {
    isPackaged = app.isPackaged
  } catch {
    isPackaged = false
  }
  const clients: ExternalMcpClientStatus[] = []
  for (const { id, label } of EXTERNAL_MCP_CLIENTS) {
    const configPath = clientConfigPath(id, dirs)
    const read = await readJsonObject(configPath).catch(() => ({ data: null, corrupt: true }) as JsonRead)
    const registered = read.data !== null
      && typeof read.data.mcpServers === 'object'
      && read.data.mcpServers !== null
      && (read.data.mcpServers as Record<string, unknown>)[EXTERNAL_MCP_SERVER_KEY] !== undefined
    clients.push({ id, label, configPath, registered })
  }
  return { entry: dirs.serverEntry, entryExists, isPackaged, clients }
}

export async function registerExternalMcpClient(
  client: ExternalMcpClientId,
  dirs: ExternalMcpDirs = defaultExternalMcpDirs(),
): Promise<ExternalMcpRegisterResult> {
  const configPath = clientConfigPath(client, dirs)
  if (!(await fileExists(dirs.serverEntry))) {
    return {
      ok: false,
      client,
      configPath,
      error: `Knowledge MCP entry not built yet: ${dirs.serverEntry}. Run "npm run build" first.`,
    }
  }
  const read = await readJsonObject(configPath)
  let backedUpPath: string | undefined
  let data: Record<string, unknown>
  if (read.corrupt) {
    backedUpPath = `${configPath}.bak-${Date.now()}`
    await rename(configPath, backedUpPath)
    data = {}
  } else {
    data = read.data ?? {}
  }
  const servers = serversOf(data)
  servers[EXTERNAL_MCP_SERVER_KEY] = {
    command: 'node',
    args: [dirs.serverEntry],
  }
  data.mcpServers = servers
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return { ok: true, client, configPath, backedUpPath }
}
