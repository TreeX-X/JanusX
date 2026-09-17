import { resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { ClaudeDetector } from '../../../src/main/cc-switch/claude-detector'

type RunResult = { exitCode: number; stdout: string; stderr: string; timedOut?: boolean }

function createHarness(options: {
  files?: string[]
  path?: string
  appData?: string
  localAppData?: string
  platform?: NodeJS.Platform
  run?: (file: string, args: readonly string[]) => Promise<RunResult>
} = {}) {
  const files = new Set((options.files ?? []).map(file => resolve(file)))
  const run = vi.fn(options.run ?? (async (_file: string, args: readonly string[]) => ({
    exitCode: 0,
    stdout: args.join(' ').includes('--version') ? '1.2.3 (Claude Code)' : '',
    stderr: '',
  })))
  const detector = new ClaudeDetector({
    env: { PATH: options.path ?? '', APPDATA: options.appData, LOCALAPPDATA: options.localAppData },
    platform: options.platform ?? 'win32',
    homeDir: options.platform === 'win32' || !options.platform ? 'C:\\Users\\test' : '/home/test',
    isRegularFile: async candidate => files.has(resolve(candidate)),
    run,
  })
  return { detector, run }
}

describe('ClaudeDetector', () => {
  it('reports not-installed with a manual hint and probes nothing', async () => {
    const { detector, run } = createHarness()

    await expect(detector.detect()).resolves.toEqual({
      toolId: 'claude',
      installed: false,
      runnable: false,
      hint: 'npm i -g @anthropic-ai/claude-code@latest',
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('prefers the PATH binary and parses the version', async () => {
    const pathBinary = resolve('C:\\tools\\claude.cmd')
    const knownBinary = resolve('C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd')
    const { detector } = createHarness({
      files: [pathBinary, knownBinary],
      path: 'C:\\tools',
      appData: 'C:\\Users\\test\\AppData\\Roaming',
    })

    await expect(detector.detect()).resolves.toEqual({
      toolId: 'claude',
      installed: true,
      runnable: true,
      version: '1.2.3',
      path: pathBinary,
      source: 'path',
      existingTerminalNotice: expect.any(String),
    })
  })

  it('falls back to known locations only when PATH misses', async () => {
    const knownBinary = resolve('C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd')
    const { detector } = createHarness({
      files: [knownBinary],
      path: 'C:\\tools',
      appData: 'C:\\Users\\test\\AppData\\Roaming',
    })

    const result = await detector.detect()
    expect(result).toMatchObject({ installed: true, runnable: true, version: '1.2.3', source: 'known-location' })
  })

  it('marks a failing binary as installed-but-broken instead of masking it as missing', async () => {
    const pathBinary = resolve('C:\\tools\\claude.cmd')
    const { detector, run } = createHarness({
      files: [pathBinary],
      path: 'C:\\tools',
      run: async () => ({ exitCode: 1, stdout: '', stderr: 'node: bad option' }),
    })

    await expect(detector.detect()).resolves.toEqual({
      toolId: 'claude',
      installed: true,
      runnable: false,
      path: pathBinary,
      source: 'path',
      hint: 'node: bad option',
    })
    expect(run).toHaveBeenCalled()
  })

  it('invokes .cmd probes through cmd call without flashing or bare names', async () => {
    const pathBinary = resolve('C:\\tools\\claude.cmd')
    const { detector, run } = createHarness({ files: [pathBinary], path: 'C:\\tools' })

    await detector.detect()
    expect(run).toHaveBeenCalledWith('cmd.exe', ['/D', '/S', '/C', `call "${pathBinary}" --version`])
  })

  it('resolves posix binaries directly from PATH and known dirs', async () => {
    const pathBinary = resolve('/home/test/.local/bin/claude')
    const { detector } = createHarness({
      files: [pathBinary],
      path: '/home/test/.local/bin',
      platform: 'linux',
      run: async () => ({ exitCode: 0, stdout: 'claude 2.0.1', stderr: '' }),
    })

    const result = await detector.detect()
    expect(result).toMatchObject({ installed: true, runnable: true, version: '2.0.1', source: 'path' })
  })
})
