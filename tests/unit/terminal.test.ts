import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock node-pty
vi.mock('node-pty', () => {
  const mockPty = {
    pid: 12345,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  }
  return {
    spawn: vi.fn(() => mockPty),
  }
})

describe('Terminal Presets', () => {
  it('should return correct auto command for claude preset', async () => {
    const { getAutoCommand } = await import('../../src/main/terminal/presets')
    // Enter is injected separately after resize; command itself has no trailing newline.
    expect(getAutoCommand('claude')).toBe('claude')
  })

  it('should return undefined for shell preset', async () => {
    const { getAutoCommand } = await import('../../src/main/terminal/presets')
    expect(getAutoCommand('shell')).toBeUndefined()
  })

  it('should return correct preset name', async () => {
    const { getPresetName } = await import('../../src/main/terminal/presets')
    expect(getPresetName('claude')).toBe('Claude Code')
    expect(getPresetName('codex')).toBe('Codex')
    expect(getPresetName('shell')).toBe('普通终端')
  })

  it('should have all presets defined', async () => {
    const { PRESETS } = await import('../../src/main/terminal/presets')
    expect(PRESETS).toHaveProperty('shell')
    expect(PRESETS).toHaveProperty('claude')
    expect(PRESETS).toHaveProperty('codex')
  })
})

describe('Terminal Types', () => {
  it('should export type definitions', async () => {
    const types = await import('../../src/main/terminal/types')
    // Just verify the module loads without error
    expect(types).toBeDefined()
  })
})

describe('Health Checker', () => {
  it('should create health checker instance', async () => {
    const { HealthChecker } = await import('../../src/main/terminal/health')
    const checker = new HealthChecker()
    expect(checker).toBeDefined()
  })

  it('should return false for non-existent terminal', async () => {
    const { HealthChecker } = await import('../../src/main/terminal/health')
    const checker = new HealthChecker()
    const status = checker.check('non-existent-id')
    expect(status.alive).toBe(false)
    expect(status.uptime).toBe(0)
  })
})

describe('Default Shell', () => {
  it('should return a string for default shell', async () => {
    const { getDefaultShell } = await import('../../src/main/terminal/presets')
    const shell = getDefaultShell()
    expect(typeof shell).toBe('string')
    expect(shell.length).toBeGreaterThan(0)
  })

  it('should return shell name', async () => {
    const { getShellName } = await import('../../src/main/terminal/presets')
    expect(getShellName('/bin/bash')).toBe('Bash')
    expect(getShellName('/usr/bin/zsh')).toBe('Zsh')
    expect(getShellName('powershell.exe')).toBe('PowerShell')
  })
})
