import { dirname, resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { ClaudeInstaller } from '../../../src/main/cc-switch/installer'
import { CC_SWITCH_TOOLS } from '../../../src/main/cc-switch/tool-registry'

function createHarness(options: {
  npmPath?: string
  platform?: NodeJS.Platform
  exitCode?: number
  stderr?: string
} = {}) {
  const run = vi.fn(async () => ({ exitCode: options.exitCode ?? 0, stdout: '', stderr: options.stderr ?? '' }))
  const installer = new ClaudeInstaller({
    platform: options.platform ?? 'win32',
    env: { PATH: options.npmPath ? dirname(options.npmPath) : '', APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
    homeDir: 'C:\\Users\\test',
    isRegularFile: async candidate => resolve(candidate) === resolve(options.npmPath ?? ''),
    run,
  })
  return { installer, run }
}

describe('ClaudeInstaller', () => {
  it('refuses to run when npm cannot be located and hands out the manual command', async () => {
    const { installer, run } = createHarness()

    await expect(installer.install(CC_SWITCH_TOOLS.claude)).resolves.toEqual({
      success: false,
      command: 'npm i -g @anthropic-ai/claude-code@latest',
      error: expect.stringContaining('npm was not found'),
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('runs npm through PowerShell on Windows and reports success', async () => {
    const npmPath = 'C:\\Users\\test\\AppData\\Roaming\\npm\\npm.cmd'
    const { installer, run } = createHarness({ npmPath })

    await expect(installer.install(CC_SWITCH_TOOLS.claude)).resolves.toEqual({
      success: true,
      command: `& "${npmPath}" i -g @anthropic-ai/claude-code@latest`,
    })
    expect(run.mock.calls[0][0]).toBe('powershell.exe')
  })

  it('surfaces only the tail of a failed install', async () => {
    const npmPath = 'C:\\Users\\test\\AppData\\Roaming\\npm\\npm.cmd'
    const { installer } = createHarness({ npmPath, exitCode: 1, stderr: 'line1\nline2\nnpm ERR! boom' })

    const result = await installer.install(CC_SWITCH_TOOLS.claude)
    expect(result.success).toBe(false)
    expect(result.error).toContain('npm ERR! boom')
  })

  it('blocks a second install while one is running', async () => {
    const npmPath = 'C:\\Users\\test\\AppData\\Roaming\\npm\\npm.cmd'
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const run = vi.fn(async () => {
      await gate
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const installer = new ClaudeInstaller({
      platform: 'win32',
      env: { PATH: dirname(npmPath) },
      homeDir: 'C:\\Users\\test',
      isRegularFile: async candidate => resolve(candidate) === resolve(npmPath),
      run,
    })

    const first = installer.install(CC_SWITCH_TOOLS.claude)
    await expect(installer.install(CC_SWITCH_TOOLS.claude)).resolves.toMatchObject({ success: false })
    release()
    await expect(first).resolves.toMatchObject({ success: true })
  })
})
