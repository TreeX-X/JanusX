import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clientConfigPath,
  EXTERNAL_MCP_SERVER_KEY,
  getExternalMcpStatus,
  registerExternalMcpClient,
  type ExternalMcpDirs,
} from '../../../src/main/knowledge/external-mcp'

describe('external MCP client registration', () => {
  let root: string
  let dirs: ExternalMcpDirs

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-extmcp-'))
    dirs = {
      homeDir: join(root, 'home'),
      appDataDir: join(root, 'appdata'),
      serverEntry: join(root, 'out', 'knowledge-mcp.js'),
    }
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function seedEntry(): Promise<void> {
    await mkdir(join(root, 'out'), { recursive: true })
    await writeFile(dirs.serverEntry, '// stub entry', 'utf8')
  }

  async function readConfig(client: 'cursor' | 'vscode' | 'claude-code') {
    const raw = await readFile(clientConfigPath(client, dirs), 'utf8')
    return JSON.parse(raw) as Record<string, any>
  }

  it('reports missing entry and unregistered clients on a fresh machine', async () => {
    const status = await getExternalMcpStatus(dirs)

    expect(status.entry).toBe(dirs.serverEntry)
    expect(status.entryExists).toBe(false)
    expect(status.clients).toHaveLength(3)
    expect(status.clients.every((client) => !client.registered)).toBe(true)
    expect(status.clients.map((client) => client.id)).toEqual(['cursor', 'vscode', 'claude-code'])
  })

  it('refuses to register before the server entry is built', async () => {
    const result = await registerExternalMcpClient('cursor', dirs)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('npm run build')
  })

  it('writes cursor config and preserves existing servers', async () => {
    await seedEntry()
    await mkdir(join(dirs.homeDir, '.cursor'), { recursive: true })
    await writeFile(
      clientConfigPath('cursor', dirs),
      JSON.stringify({ mcpServers: { other: { command: 'other' } } }),
      'utf8',
    )

    const result = await registerExternalMcpClient('cursor', dirs)

    expect(result.ok).toBe(true)
    expect(result.configPath).toBe(clientConfigPath('cursor', dirs))
    const config = await readConfig('cursor')
    expect(config.mcpServers.other).toEqual({ command: 'other' })
    expect(config.mcpServers[EXTERNAL_MCP_SERVER_KEY]).toEqual({
      command: 'node',
      args: [dirs.serverEntry],
    })

    const status = await getExternalMcpStatus(dirs)
    expect(status.entryExists).toBe(true)
    expect(status.clients.find((client) => client.id === 'cursor')?.registered).toBe(true)
    expect(status.clients.find((client) => client.id === 'vscode')?.registered).toBe(false)
  })

  it('merges vscode and claude-code configs without touching unrelated keys', async () => {
    await seedEntry()

    await registerExternalMcpClient('vscode', dirs)
    const vscode = await readConfig('vscode')
    expect(vscode.mcpServers[EXTERNAL_MCP_SERVER_KEY].args).toEqual([dirs.serverEntry])

    await mkdir(dirs.homeDir, { recursive: true })
    await writeFile(
      clientConfigPath('claude-code', dirs),
      JSON.stringify({ theme: 'dark', mcpServers: {} }),
      'utf8',
    )
    const result = await registerExternalMcpClient('claude-code', dirs)
    expect(result.ok).toBe(true)
    const claude = await readConfig('claude-code')
    expect(claude.theme).toBe('dark')
    expect(claude.mcpServers[EXTERNAL_MCP_SERVER_KEY].command).toBe('node')
  })

  it('backs up corrupt configs before rewriting', async () => {
    await seedEntry()
    const path = clientConfigPath('cursor', dirs)
    await mkdir(join(dirs.homeDir, '.cursor'), { recursive: true })
    await writeFile(path, 'not-json{{{', 'utf8')

    const result = await registerExternalMcpClient('cursor', dirs)

    expect(result.ok).toBe(true)
    expect(result.backedUpPath).toBeTruthy()
    const backup = await readFile(result.backedUpPath!, 'utf8')
    expect(backup).toBe('not-json{{{')
    const config = await readConfig('cursor')
    expect(config.mcpServers[EXTERNAL_MCP_SERVER_KEY]).toBeTruthy()
  })
})
