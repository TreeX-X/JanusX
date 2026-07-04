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

    const manager = new AgentHookConfigManager({
      homeDir,
      userDataDir: join(homeDir, 'userData'),
      executablePath: 'C:/Program Files/JanusX/JanusX.exe',
      platform: 'win32',
    })

    await manager.ensureInstalled('claude')
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
    }

    expect(parsed.hooks.Stop).toHaveLength(2)
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe('echo user-hook')
    expect(JSON.stringify(parsed)).toContain(JANUSX_HOOK_COMMAND_MARKER)
    expect(parsed.hooks.Notification[0].matcher).toBe('permission_prompt|idle_prompt')
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('-EventName')
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('janusx-agent-hook.ps1')
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('-Command')
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).not.toContain('-File')
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

    const manager = new AgentHookConfigManager({
      homeDir,
      userDataDir: join(homeDir, 'userData'),
      executablePath: 'C:/Program Files/JanusX/JanusX.exe',
      platform: 'win32',
    })

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

    const manager = new AgentHookConfigManager({
      homeDir,
      userDataDir: join(homeDir, 'userData'),
      executablePath: '/usr/local/bin/janusx',
      platform: 'linux',
    })

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
    const manager = new AgentHookConfigManager({
      homeDir,
      userDataDir: join(homeDir, 'userData'),
      executablePath: '/Applications/JanusX.app/Contents/MacOS/JanusX',
      platform: 'darwin',
    })

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

  it('enables the Codex hooks feature in config.toml', async () => {
    const homeDir = await createTempDir()
    const manager = new AgentHookConfigManager({
      homeDir,
      userDataDir: join(homeDir, 'userData'),
      executablePath: '/usr/local/bin/janusx',
      platform: 'linux',
    })

    await manager.ensureInstalled('codex')

    expect(await readFile(manager.getCodexConfigPath(), 'utf8')).toContain('[features]\nhooks = true')
  })

  it('uses a managed PowerShell hook sender on Windows', async () => {
    const homeDir = await createTempDir()
    electronApp.isPackaged = false
    electronApp.getAppPath.mockReturnValue(join(homeDir, 'janusx-app'))

    try {
      const manager = new AgentHookConfigManager({
        homeDir,
        userDataDir: join(homeDir, 'userData'),
        executablePath: 'C:/repo/node_modules/electron/dist/electron.exe',
        platform: 'win32',
      })

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

  it('creates an opencode plugin directory and injects OPENCODE_CONFIG_DIR', async () => {
    const homeDir = await createTempDir()
    const userDataDir = join(homeDir, 'userData')
    const manager = new AgentHookConfigManager({
      homeDir,
      userDataDir,
      executablePath: '/usr/local/bin/janusx',
      platform: 'linux',
    })

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
    expect(await readFile(join(manager.getOpencodeConfigDir(), 'plugins', 'janusx-notify.js'), 'utf8')).toContain(
      'session.idle',
    )
  })
})
