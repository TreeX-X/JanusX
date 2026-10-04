import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clientConfigPath,
  defaultExternalMcpDirs,
  EXTERNAL_MCP_SERVER_KEY,
  getExternalMcpStatus,
  registerExternalMcpClient,
  type ExternalMcpDirs,
} from '../../../src/main/knowledge/external-mcp'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/fixture' } }))

describe('external MCP build selection', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses the current isolated dev build for client registration', () => {
    vi.stubEnv('JANUSX_DEV_BUILD_ROOT', '/fixture/.cache')
    expect(defaultExternalMcpDirs().serverEntry).toBe(join('/fixture/.cache', 'main', 'knowledge-mcp.js'))
  })

  it('keeps production preview on the standard output', () => {
    vi.stubEnv('JANUSX_DEV_BUILD_ROOT', undefined)
    expect(defaultExternalMcpDirs().serverEntry).toBe(join('/fixture', 'out', 'main', 'knowledge-mcp.js'))
  })
})

describe('external MCP client registration', () => {
  let root: string
  let dirs: ExternalMcpDirs

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-extmcp-'))
    dirs = {
      homeDir: join(root, 'home'),
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

  async function readConfig(client: 'claude-code') {
    const raw = await readFile(clientConfigPath(client, dirs), 'utf8')
    return JSON.parse(raw) as Record<string, any>
  }

  it('reports missing entry and unregistered clients on a fresh machine', async () => {
    const status = await getExternalMcpStatus(dirs)

    expect(status.entry).toBe(dirs.serverEntry)
    expect(status.entryExists).toBe(false)
    expect(status.clients).toHaveLength(6)
    expect(status.clients.every((client) => !client.registered)).toBe(true)
    expect(status.clients.map((client) => client.id)).toEqual(['claude-code', 'codex', 'opencode', 'janus', 'pi', 'dsh'])
  })

  it('refuses to register before the server entry is built', async () => {
    const result = await registerExternalMcpClient('claude-code', dirs)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('npm run build')
  })

  it('detects stale registrations and repairs them without changing unrelated servers', async () => {
    await seedEntry()
    await registerExternalMcpClient('claude-code', dirs)
    const moved = { ...dirs, serverEntry: join(root, 'out', 'moved.js') }
    await writeFile(moved.serverEntry, '// new entry')
    expect((await getExternalMcpStatus(moved)).clients.find(client => client.id === 'claude-code')?.current).toBe(false)
    expect((await registerExternalMcpClient('claude-code', moved)).ok).toBe(true)
    expect((await getExternalMcpStatus(moved)).clients.find(client => client.id === 'claude-code')?.current).toBe(true)
    expect((await registerExternalMcpClient('pi', dirs)).ok).toBe(false)
  })

  it('supports Codex and existing OpenCode JSONC without reporting unverified clients as registered', async () => {
    await seedEntry()
    await mkdir(join(dirs.homeDir, '.config', 'opencode'), { recursive: true })
    const jsonc = `${clientConfigPath('opencode', dirs)}c`
    await writeFile(jsonc, '{\n // keep\n "theme":"system"\n}')
    expect((await registerExternalMcpClient('opencode', dirs)).configPath).toBe(jsonc)
    expect(await readFile(jsonc, 'utf8')).toContain('// keep')
    expect((await registerExternalMcpClient('codex', dirs)).ok).toBe(true)
    const clients = (await getExternalMcpStatus(dirs)).clients
    expect(clients.find(client => client.id === 'codex')?.current).toBe(true)
    expect(clients.find(client => client.id === 'opencode')?.current).toBe(true)
    expect(clients.find(client => client.id === 'pi')).toMatchObject({ support: 'unverified', registered: false })
  })

  it('writes Claude Code config and preserves existing servers', async () => {
    await seedEntry()
    await mkdir(dirs.homeDir, { recursive: true })
    await writeFile(
      clientConfigPath('claude-code', dirs),
      JSON.stringify({ mcpServers: { other: { command: 'other' } } }),
      'utf8',
    )

    const result = await registerExternalMcpClient('claude-code', dirs)

    expect(result.ok).toBe(true)
    expect(result.configPath).toBe(clientConfigPath('claude-code', dirs))
    const config = await readConfig('claude-code')
    expect(config.mcpServers.other).toEqual({ command: 'other' })
    expect(config.mcpServers[EXTERNAL_MCP_SERVER_KEY]).toEqual({
      command: 'node',
      args: [dirs.serverEntry],
    })

    const status = await getExternalMcpStatus(dirs)
    expect(status.entryExists).toBe(true)
    expect(status.clients.find((client) => client.id === 'claude-code')?.registered).toBe(true)
    expect(status.clients.find((client) => client.id === 'codex')?.registered).toBe(false)
  })

  it('merges claude-code configs without touching unrelated keys', async () => {
    await seedEntry()

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

  it('preserves corrupt configs and reports failure', async () => {
    await seedEntry()
    const path = clientConfigPath('claude-code', dirs)
    await mkdir(dirs.homeDir, { recursive: true })
    await writeFile(path, 'not-json{{{', 'utf8')

    const result = await registerExternalMcpClient('claude-code', dirs)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Invalid client configuration')
    expect(await readFile(path, 'utf8')).toBe('not-json{{{')
  })
})
