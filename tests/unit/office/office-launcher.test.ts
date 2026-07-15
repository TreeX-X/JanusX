import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseOfficeLauncherArgs, runOfficeLauncher } from '../../../src/main/office/office-launcher'
import { configureCodexOfficeMcpText, configureOfficeRuleText } from '../../../src/main/office/office-project-rules'
import { resolveOfficecliManagedRoot } from '../../../src/main/office/office-managed-root'
import { OfficecliInstaller } from '../../../src/main/office/officecli-installer'

const roots: string[] = []
async function temp(): Promise<string> { const value = await mkdtemp(join(tmpdir(), 'janusx-office-launcher-')); roots.push(value); return value }
afterEach(async () => { await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))) })

describe('Office external launcher', () => {
  it('parses run arguments only after the separator', () => {
    expect(parseOfficeLauncherArgs(['status'])).toEqual({ command: 'status' })
    expect(parseOfficeLauncherArgs(['run', '--engine', 'codex', '--workspace', 'C:\\work', '--', '--model', 'a b'])).toEqual({
      command: 'run', engine: 'codex', workspace: 'C:\\work', args: ['--model', 'a b'],
    })
    expect(() => parseOfficeLauncherArgs(['run', '--engine', 'unknown', '--workspace', '.'])).toThrow()
  })

  it('previews, applies, idempotently re-applies, and reverses project configuration', async () => {
    const root = await temp()
    const workspace = join(root, 'workspace')
    const managed = join(root, 'managed')
    await mkdir(join(workspace, '.codex'), { recursive: true })
    await mkdir(managed)
    const rules = '\uFEFFuser rules\r\nkeep'
    const config = '\uFEFF[features]\r\nhooks = true'
    await writeFile(join(workspace, 'AGENTS.md'), rules)
    await writeFile(join(workspace, '.codex', 'config.toml'), config)
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const deps = { root: managed, mcpEntry: 'office-mcp.js' }
    await expect(runOfficeLauncher(['configure', '--workspace', workspace], deps)).resolves.toBe(2)
    await expect(readFile(join(workspace, 'AGENTS.md'), 'utf8')).resolves.toBe(rules)
    await expect(runOfficeLauncher(['configure', '--workspace', workspace, '--apply'], deps)).resolves.toBe(0)
    const configured = await readFile(join(workspace, 'AGENTS.md'), 'utf8')
    await expect(runOfficeLauncher(['configure', '--workspace', workspace, '--apply'], deps)).resolves.toBe(0)
    await expect(readFile(join(workspace, 'AGENTS.md'), 'utf8')).resolves.toBe(configured)
    await expect(runOfficeLauncher(['unconfigure', '--workspace', workspace, '--apply'], deps)).resolves.toBe(0)
    await expect(readFile(join(workspace, 'AGENTS.md'), 'utf8')).resolves.toBe(rules)
    await expect(readFile(join(workspace, '.codex', 'config.toml'), 'utf8')).resolves.toBe(config)
    output.mockRestore()
  })

  it('launches with preserved argv, managed env, canonical cwd, and child exit code', async () => {
    const root = await temp()
    const workspace = join(root, 'workspace')
    const install = join(root, 'managed', 'installations', 'one')
    await mkdir(workspace)
    await mkdir(join(workspace, '.codex'))
    await writeFile(join(workspace, 'AGENTS.md'), configureOfficeRuleText(''))
    await writeFile(join(workspace, '.codex', 'config.toml'), configureCodexOfficeMcpText(''))
    await mkdir(install, { recursive: true })
    await writeFile(join(install, 'officecli.exe'), 'binary')
    const binaryHash = createHash('sha256').update('binary').digest('hex')
    await writeFile(join(root, 'managed', 'current.json'), JSON.stringify({ owner: 'JanusX', schemaVersion: 1, version: '1.0.135', sha256: binaryHash, binary: 'installations/one/officecli.exe' }))
    const child = new EventEmitter() as any
    child.killed = false
    child.kill = vi.fn()
    const spawn = vi.fn(() => { queueMicrotask(() => child.emit('exit', 7, null)); return child })
    const launcherDeps = {
      root: join(root, 'managed'), mcpEntry: 'office-mcp.js', env: { PATH: 'base' }, spawn,
      installer: { getManagedBinary: async () => join(install, 'officecli.exe'), status: async () => ({ state: 'ready' as const, location: 'managed' }) },
    }
    await expect(runOfficeLauncher(['run', '--engine', 'claude', '--workspace', workspace], launcherDeps)).rejects.toThrow(/no verified Office/)
    await expect(runOfficeLauncher(['run', '--engine', 'opencode', '--workspace', workspace], launcherDeps)).rejects.toThrow(/no verified Office/)
    expect(spawn).not.toHaveBeenCalled()
    const launched = runOfficeLauncher(['run', '--engine', 'codex', '--workspace', workspace, '--', '--flag', 'a b'], {
      ...launcherDeps,
    })
    await expect(launched).resolves.toBe(7)
    expect(spawn).toHaveBeenCalledWith('codex', ['--flag', 'a b'], expect.objectContaining({ cwd: workspace, shell: false, stdio: 'inherit' }))
    expect(spawn.mock.calls[0][2].env).toMatchObject({ JANUSX_OFFICECLI_BINARY: join(install, 'officecli.exe') })
    expect(process.env.JANUSX_OFFICECLI_BINARY).toBeUndefined()
  })

  it('discovers an application-root install through default launcher status and run wiring', async () => {
    const appData = await temp()
    const userData = join(appData, 'JanusX')
    const appRoot = resolveOfficecliManagedRoot({ userDataDir: userData })
    expect(resolveOfficecliManagedRoot({ env: { APPDATA: appData }, platform: 'win32' })).toBe(appRoot)
    const binaryContent = Buffer.from('production-wiring-officecli')
    const sha256 = createHash('sha256').update(binaryContent).digest('hex')
    const artifact = { version: '1.0.135', arch: 'x64' as const, fileName: 'officecli.exe', url: 'https://example.invalid/pinned', sha256 }
    const installerDependencies = {
      platform: 'win32' as const,
      arch: 'x64',
      resolveArtifact: () => artifact,
      download: async (_artifact: unknown, destination: string) => writeFile(destination, binaryContent),
      verifyBinary: async () => true,
    }
    await new OfficecliInstaller(appRoot, undefined, installerDependencies).start(true)

    const workspace = join(appData, 'workspace')
    await mkdir(join(workspace, '.codex'), { recursive: true })
    await writeFile(join(workspace, 'AGENTS.md'), configureOfficeRuleText(''))
    await writeFile(join(workspace, '.codex', 'config.toml'), configureCodexOfficeMcpText(''))
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const env = { APPDATA: appData, PATH: 'base' }
    await expect(runOfficeLauncher(['status'], { env, installerDependencies, platform: 'win32' })).resolves.toBe(0)
    expect(output).toHaveBeenCalledWith(expect.stringContaining('"state":"ready"'))

    const child = new EventEmitter() as any
    child.killed = false
    child.kill = vi.fn()
    const spawn = vi.fn(() => { queueMicrotask(() => child.emit('exit', 0, null)); return child })
    await expect(runOfficeLauncher(['run', '--engine', 'codex', '--workspace', workspace], {
      env, installerDependencies, platform: 'win32', mcpEntry: 'office-mcp.js', spawn,
    })).resolves.toBe(0)
    expect(spawn.mock.calls[0][2].env.JANUSX_OFFICECLI_BINARY).toContain(appRoot)
    output.mockRestore()
  })
})
