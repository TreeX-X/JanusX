import { delimiter } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.fn(() => ({
  pid: 12345,
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
}))

vi.mock('node-pty', () => ({ spawn }))

describe('TerminalManager OfficeCLI PATH integration', () => {
  beforeEach(() => spawn.mockClear())

  it('prepends only new PTY environments without mutating the process or existing PTYs', async () => {
    const { TerminalManager } = await import('../../src/main/terminal/manager')
    const manager = new TerminalManager()
    const originalProcessPath = process.env.PATH
    const config = {
      workspaceId: 'workspace',
      cwd: process.cwd(),
      shell: 'powershell.exe',
      env: { PATH: 'C:\\user-bin' },
    }

    manager.create({ ...config, id: 'existing' })
    manager.create({ ...config, id: 'new' }, 'C:\\verified-officecli')
    manager.create({ ...config, id: 'after-invalidated' })

    const firstEnv = spawn.mock.calls[0][2].env as Record<string, string>
    const secondEnv = spawn.mock.calls[1][2].env as Record<string, string>
    const thirdEnv = spawn.mock.calls[2][2].env as Record<string, string>
    expect(firstEnv.PATH).toBe('C:\\user-bin')
    expect(secondEnv.PATH).toBe(`C:\\verified-officecli${delimiter}C:\\user-bin`)
    expect(thirdEnv.PATH).toBe('C:\\user-bin')
    expect(firstEnv.PATH).toBe('C:\\user-bin')
    expect(process.env.PATH).toBe(originalProcessPath)
  })

  it('spawns agent CLI program directly without shell auto-command typing', async () => {
    const { TerminalManager } = await import('../../src/main/terminal/manager')
    const manager = new TerminalManager()

    manager.create({
      id: 'codex-1',
      workspaceId: 'workspace',
      cwd: process.cwd(),
      shell: 'powershell.exe',
      program: 'codex',
      programArgs: [],
      cols: 120,
      rows: 40,
    })

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      [],
      expect.objectContaining({
        cols: 120,
        rows: 40,
      }),
    )
    const instance = manager.getInstance('codex-1')
    expect(instance?.pty.write).not.toHaveBeenCalled()
  })
})
