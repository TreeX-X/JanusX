import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => join(tmpdir(), 'janusx-test-user-data')),
    getAppPath: vi.fn(() => join(tmpdir(), 'janusx-app')),
    isPackaged: true,
  },
}))

const { AgentHookConfigManager, JANUSX_HOOK_COMMAND_MARKER } = await import(
  '../../src/main/notifications/agent-hook-config'
)
const electronApp = (await import('electron')).app as unknown as {
  getAppPath: ReturnType<typeof vi.fn>
  isPackaged: boolean
}

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'janusx-hook-test-'))
}

type ManagerOverrides = {
  userDataDir?: string
  executablePath?: string
  platform?: 'win32' | 'linux' | 'darwin'
}

function makeManager(homeDir: string, overrides: ManagerOverrides = {}) {
  return new AgentHookConfigManager({
    homeDir,
    userDataDir: overrides.userDataDir ?? join(homeDir, 'userData'),
    executablePath: overrides.executablePath ?? '/usr/local/bin/janusx',
    platform: overrides.platform ?? 'linux',
  })
}

describe('AgentHookConfigManager', () => {
  it('installs marker-owned Claude hooks without removing user hooks', async () => {
    const homeDir = await createTempDir()
    const settingsPath = join(homeDir, '.claude', 'settings.json')
    await mkdir(join(homeDir, '.claude'), { recursive: true })
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: 'echo user-hook' }],
            },
          ],
        },
      }),
      'utf8',
    )

    const manager = makeManager(homeDir, { executablePath: 'C:/Program Files/JanusX/JanusX.exe', platform: 'win32' })

    await manager.ensureInstalled('claude')
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
    }

    expect(parsed.hooks.Stop).toHaveLength(2)
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe('echo user-hook')
    expect(JSON.stringify(parsed)).toContain(JANUSX_HOOK_COMMAND_MARKER)
    expect(parsed.hooks.Notification.map((entry) => entry.matcher)).toEqual([
      'permission_prompt',
      'idle_prompt',
    ])
    expect(parsed.hooks.Notification[0].hooks[0].command).toContain("-Matcher 'permission_prompt'")
    expect(parsed.hooks.Notification[1].hooks[0].command).toContain("-Matcher 'idle_prompt'")
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('-EventName')
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('janusx-agent-hook.ps1')
      expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('-Command')
      expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).not.toContain('-File')
      expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('Test-Path -LiteralPath')
      expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).not.toContain('$utf8')
  })

  it('bakes the fired matcher into posix Claude Notification commands', async () => {
    const homeDir = await createTempDir()
    const manager = makeManager(homeDir, { platform: 'linux' })

    await manager.ensureInstalled('claude')
    const parsed = JSON.parse(await readFile(manager.getClaudeSettingsPath(), 'utf8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
    }

    expect(parsed.hooks.Notification.map((entry) => entry.matcher)).toEqual([
      'permission_prompt',
      'idle_prompt',
    ])
    expect(parsed.hooks.Notification[0].hooks[0].command).toContain("'--matcher' 'permission_prompt'")
    expect(parsed.hooks.Notification[1].hooks[0].command).toContain("'--matcher' 'idle_prompt'")
    expect(parsed.hooks.Notification[0].hooks[0].command).toContain(JANUSX_HOOK_COMMAND_MARKER)
    expect(await manager.isInstalled('claude')).toBe(true)
  })

  it('removes legacy JanusX hook commands during install', async () => {
    const homeDir = await createTempDir()
    const settingsPath = join(homeDir, '.claude', 'settings.json')
    await mkdir(join(homeDir, '.claude'), { recursive: true })
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: "powershell -File 'C:/old/janusx-hook.ps1' -Marker 'janusx-hook-v1'",
                },
              ],
            },
            {
              hooks: [{ type: 'command', command: 'echo user-hook' }],
            },
          ],
        },
      }),
      'utf8',
    )

    const manager = makeManager(homeDir, { executablePath: 'C:/Program Files/JanusX/JanusX.exe', platform: 'win32' })

    await manager.ensureInstalled('claude')
    const settings = await readFile(settingsPath, 'utf8')

    expect(settings).not.toContain('janusx-hook-v1')
    expect(settings).toContain('echo user-hook')
    expect(settings).toContain(JANUSX_HOOK_COMMAND_MARKER)
  })

  it('repairs JSON configs that were saved with a UTF-8 BOM', async () => {
    const homeDir = await createTempDir()
    const hooksPath = join(homeDir, '.codex', 'hooks.json')
    await mkdir(join(homeDir, '.codex'), { recursive: true })
    await writeFile(
      hooksPath,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [{ type: 'command', command: 'echo user-codex-hook' }],
              },
            ],
          },
        })),
      ]),
    )

    const manager = makeManager(homeDir)

    await manager.ensureInstalled('codex')
    const repaired = await readFile(hooksPath)
    const parsed = JSON.parse(repaired.toString('utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    expect(Array.from(repaired.slice(0, 3))).not.toEqual([0xef, 0xbb, 0xbf])
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe('echo user-codex-hook')
    expect(JSON.stringify(parsed)).toContain(JANUSX_HOOK_COMMAND_MARKER)
  })

  it('uninstalls only marker-owned Codex hooks and keeps user hooks', async () => {
    const homeDir = await createTempDir()
    const manager = makeManager(homeDir, { executablePath: '/Applications/JanusX.app/Contents/MacOS/JanusX', platform: 'darwin' })

    await manager.ensureInstalled('codex')
    const hooksPath = manager.getCodexHooksPath()
    const installed = JSON.parse(await readFile(hooksPath, 'utf8')) as {
      hooks: Record<string, unknown[]>
    }
    installed.hooks.Stop.unshift({
      hooks: [{ type: 'command', command: 'echo user-codex-hook' }],
    })
    await writeFile(hooksPath, JSON.stringify(installed, null, 2), 'utf8')

    await manager.uninstall('codex')
    const parsed = JSON.parse(await readFile(hooksPath, 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    expect(parsed.hooks.Stop).toEqual([
      {
        hooks: [{ type: 'command', command: 'echo user-codex-hook' }],
      },
    ])
    expect(JSON.stringify(parsed)).not.toContain(JANUSX_HOOK_COMMAND_MARKER)
  })

  it('does not modify the external Codex config.toml', async () => {
    const homeDir = await createTempDir()
    const codexDir = join(homeDir, '.codex')
    const configPath = join(codexDir, 'config.toml')
    const externalConfig = 'base_url = \"https://provider.example/v1\"\nwire_api = \"responses\"\n'
    await mkdir(codexDir, { recursive: true })
    await writeFile(configPath, externalConfig, 'utf8')
    const manager = makeManager(homeDir)

    await manager.ensureInstalled('codex')

    expect(await readFile(configPath, 'utf8')).toBe(externalConfig)
  })

  it('uses a managed PowerShell hook sender on Windows', async () => {
    const homeDir = await createTempDir()
    electronApp.isPackaged = false
    electronApp.getAppPath.mockReturnValue(join(homeDir, 'janusx-app'))

    try {
      const manager = makeManager(homeDir, { executablePath: 'C:/repo/node_modules/electron/dist/electron.exe', platform: 'win32' })

      await manager.ensureInstalled('codex')
      const hooksJson = await readFile(manager.getCodexHooksPath(), 'utf8')
      const script = await readFile(manager.getWindowsHookScriptPath(), 'utf8')

      expect(hooksJson).toContain('janusx-agent-hook.ps1')
      expect(hooksJson).toContain('-EventName')
      expect(hooksJson).toContain('-Command')
      expect(hooksJson).not.toContain('-File')
      expect(hooksJson).not.toContain('electron.exe')
      expect(script).toContain('Invoke-RestMethod')
      expect(script).toContain('JANUSX_HOOK_PORT')
      expect(script).toContain('janusx-agent-hook-last.json')
    } finally {
      electronApp.isPackaged = true
    }
  })

  it('detects an incomplete install so a later terminal can repair the hooks', async () => {
    const homeDir = await createTempDir()
    const userDataDir = join(homeDir, 'userData')
    const manager = makeManager(homeDir, { userDataDir, platform: 'win32' })

    await manager.ensureInstalled('claude')
    expect(await manager.isInstalled('claude')).toBe(true)
    await writeFile(manager.getWindowsHookScriptPath(), '', 'utf8')
    const settingsPath = manager.getClaudeSettingsPath()
    const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as { hooks: Record<string, unknown[]> }
    settings.hooks.UserPromptSubmit = []
    await writeFile(settingsPath, JSON.stringify(settings), 'utf8')

    expect(await manager.isInstalled('claude')).toBe(false)
  })

  it('creates an opencode plugin directory and injects OPENCODE_CONFIG_DIR', async () => {    const homeDir = await createTempDir()
    const userDataDir = join(homeDir, 'userData')
    const manager = makeManager(homeDir, { userDataDir })

    await manager.ensureInstalled('opencode')
    const env = manager.buildTerminalEnv(
      {
        terminalId: 'term-opencode',
        workspaceId: 'workspace-1',
        engine: 'opencode',
      },
      {
        JANUSX_HOOK_PORT: '1234',
        JANUSX_HOOK_TOKEN: 'secret',
      },
    )

    expect(env.OPENCODE_CONFIG_DIR).toBe(manager.getOpencodeConfigDir())
    const plugin = await readFile(join(manager.getOpencodeConfigDir(), 'plugins', 'janusx-notify.js'), 'utf8')
    expect(plugin).toContain('session.idle')
    expect(plugin).toContain('session.created')
    expect(plugin).toContain('session.updated')
    expect(plugin).toContain('extractSessionId')
    expect(plugin).toContain('sessionID')
  })

  it('installs a JanusX-owned pi extension without touching user pi settings', async () => {
    const homeDir = await createTempDir()
    const userDataDir = join(homeDir, 'userData')
    const manager = makeManager(homeDir, { userDataDir })

    const result = await manager.ensureInstalled('pi')

    expect(result.installed).toBe(true)
    expect(result.path).toBe(manager.getPiExtensionPath())
    expect(await manager.isInstalled('pi')).toBe(true)
    const extension = await readFile(manager.getPiExtensionPath(), 'utf8')
    expect(extension).toContain('agent_settled')
    expect(extension).toContain('agent_start')
    expect(extension).toContain('ui_prompt_start')
    expect(extension).toContain('PermissionRequest')
    expect(extension).toContain('after_provider_response')
    expect(extension).toContain('JANUSX_HOOK_PORT')
    // Flag-injected file: no settings.json merge, no user hook removal.
    expect(extension).not.toContain('settings.json')
  })

  it('uninstalls the managed pi extension file', async () => {
    const homeDir = await createTempDir()
    const userDataDir = join(homeDir, 'userData')
    const manager = makeManager(homeDir, { userDataDir })

    await manager.ensureInstalled('pi')
    expect(await manager.isInstalled('pi')).toBe(true)
    await manager.uninstall('pi')
    expect(await manager.isInstalled('pi')).toBe(false)
  })

  it('treats janus as env-gated with nothing to install', async () => {
    const homeDir = await createTempDir()
    const manager = makeManager(homeDir)

    const installed = await manager.ensureInstalled('janus')
    expect(installed).toEqual({ engine: 'janus', installed: true, path: manager.getHooksRootDir() })
    expect(await manager.isInstalled('janus')).toBe(true)
    const uninstalled = await manager.uninstall('janus')
    expect(uninstalled.installed).toBe(false)
  })
})
