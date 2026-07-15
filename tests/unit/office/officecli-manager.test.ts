import { delimiter, dirname, resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  OFFICECLI_EXISTING_TERMINAL_NOTICE,
  OFFICECLI_MANUAL_INSTALL_GUIDANCE,
  OfficecliManager,
  initializeOfficecliProvider,
} from '../../../src/main/office/officecli-manager'

type RunResult = { exitCode: number; stdout: string; stderr: string; timedOut?: boolean }

function createHarness(options: {
  files?: string[]
  path?: string
  localAppData?: string
  run?: (binary: string, args: readonly string[]) => Promise<RunResult>
} = {}) {
  const files = new Set((options.files ?? []).map(file => resolve(file)))
  const run = vi.fn(options.run ?? (async (_binary: string, args: readonly string[]) => ({
    exitCode: 0,
    stdout: args[0] === '--version' ? 'OfficeCLI 1.0.135' : 'help',
    stderr: '',
  })))
  const manager = new OfficecliManager({
    env: { PATH: options.path ?? '', LOCALAPPDATA: options.localAppData },
    platform: 'win32',
    homeDir: 'C:\\Users\\test',
    isRegularFile: async candidate => files.has(resolve(candidate)),
    run,
  })
  return { manager, run, files }
}

describe('OfficecliManager', () => {
  it('returns the non-installed state without probes or side effects', async () => {
    const { manager, run } = createHarness()

    await expect(manager.detect()).resolves.toEqual({
      installed: false,
      compatible: false,
      manualInstall: OFFICECLI_MANUAL_INSTALL_GUIDANCE,
      existingTerminalNotice: OFFICECLI_EXISTING_TERMINAL_NOTICE,
    })
    expect(run).not.toHaveBeenCalled()
    expect(manager.resolveAgentPathDir()).toBeUndefined()
  })

  it('prefers a PATH binary and exposes its directory only after all gates pass', async () => {
    const pathBinary = resolve('C:\\tools\\officecli.exe')
    const knownBinary = resolve('C:\\Users\\test\\OfficeCLI\\officecli.exe')
    const { manager, run } = createHarness({
      files: [pathBinary, knownBinary],
      path: dirname(pathBinary),
      localAppData: 'C:\\Users\\test',
    })

    await expect(manager.detect()).resolves.toEqual({
      installed: true,
      compatible: true,
      version: '1.0.135',
      path: pathBinary,
      source: 'path',
    })
    expect(run.mock.calls.map(([, args]) => args)).toEqual([
      ['--version'],
      ['watch', '--help'],
      ['create', '--help'],
      ['batch', '--help'],
    ])
    expect(manager.resolveAgentPathDir()).toBe(dirname(pathBinary))
  })

  it('falls back to the known user installation location', async () => {
    const knownBinary = resolve('C:\\Users\\test\\OfficeCLI\\officecli.exe')
    const { manager } = createHarness({ files: [knownBinary], localAppData: 'C:\\Users\\test' })

    expect(await manager.detect()).toMatchObject({
      installed: true,
      compatible: true,
      path: knownBinary,
      source: 'known-location',
    })
  })

  it('clears the verified directory when the detected binary is deleted', async () => {
    const binary = resolve('C:\\tools\\officecli.exe')
    const { manager, files } = createHarness({
      files: [binary],
      path: dirname(binary),
    })

    await manager.detect()
    files.delete(binary)

    await expect(manager.refreshAgentPathDir()).resolves.toBeUndefined()
    files.add(binary)
    expect(manager.resolveAgentPathDir()).toBeUndefined()
  })

  it('clears the verified directory when the detected binary is replaced incompatibly', async () => {
    const binary = resolve('C:\\tools\\officecli.exe')
    let version = '1.0.135'
    const { manager } = createHarness({
      files: [binary],
      path: dirname(binary),
      run: async (_binary, args) => ({
        exitCode: 0,
        stdout: args[0] === '--version' ? `OfficeCLI ${version}` : 'help',
        stderr: '',
      }),
    })

    await manager.detect()
    version = '9.9.9'

    await expect(manager.refreshAgentPathDir()).resolves.toBeUndefined()
    version = '1.0.135'
    expect(manager.resolveAgentPathDir()).toBeUndefined()
  })

  it('awaits asynchronous revalidation and fails closed when it times out', async () => {
    const binary = resolve('C:\\tools\\officecli.exe')
    let deferRefresh = false
    let refreshStarted = false
    let resolveRefresh!: (result: RunResult) => void
    const { manager } = createHarness({
      files: [binary],
      path: dirname(binary),
      run: async (_binary, args) => {
        if (deferRefresh && args[0] === '--version') {
          refreshStarted = true
          return new Promise<RunResult>((resolve) => { resolveRefresh = resolve })
        }
        return { exitCode: 0, stdout: args[0] === '--version' ? 'OfficeCLI 1.0.135' : 'help', stderr: '' }
      },
    })

    await manager.detect()
    deferRefresh = true
    let settled = false
    const refresh = manager.refreshAgentPathDir().finally(() => { settled = true })
    await vi.waitFor(() => expect(refreshStarted).toBe(true))

    expect(settled).toBe(false)
    resolveRefresh({ exitCode: 1, stdout: '', stderr: '', timedOut: true })
    await expect(refresh).resolves.toBeUndefined()
    expect(manager.resolveAgentPathDir()).toBeUndefined()
  })

  it('returns a bounded actionable runtime diagnostic without exposing process output', async () => {
    const binary = resolve('C:\\tools\\officecli.exe')
    const secret = 'C:\\Users\\secret\\private-token'
    const { manager } = createHarness({
      files: [binary],
      path: dirname(binary),
      run: async () => ({ exitCode: 134, stdout: '', stderr: `ICU missing at ${secret}` }),
    })

    const info = await manager.detect()
    expect(info).toMatchObject({ installed: true, compatible: false, source: 'path' })
    expect(info.runtimeError).toContain('ICU')
    expect(info.runtimeError).not.toContain(secret)
    expect(info.runtimeError!.length).toBeLessThan(200)
    expect(info.path).toBeUndefined()
    expect(info.manualInstall).toBe(OFFICECLI_MANUAL_INSTALL_GUIDANCE)
    expect(info.existingTerminalNotice).toBe(OFFICECLI_EXISTING_TERMINAL_NOTICE)
  })

  it('rejects unknown versions and binaries missing a required capability', async () => {
    const binary = resolve('C:\\tools\\officecli.exe')
    const unknown = createHarness({
      files: [binary],
      path: dirname(binary),
      run: async () => ({ exitCode: 0, stdout: 'OfficeCLI 9.9.9', stderr: '' }),
    }).manager
    expect(await unknown.detect()).toMatchObject({
      installed: true,
      compatible: false,
      version: '9.9.9',
      source: 'path',
    })
    await expect(unknown.resolveBinary()).resolves.toBeUndefined()
    expect(unknown.resolveAgentPathDir()).toBeUndefined()

    const missingWatch = createHarness({
      files: [binary],
      path: dirname(binary),
      run: async (_binary, args) => ({
        exitCode: args[0] === 'watch' ? 2 : 0,
        stdout: args[0] === '--version' ? '1.0.135' : '',
        stderr: '',
      }),
    }).manager
    expect(await missingWatch.detect()).toMatchObject({ installed: true, compatible: false, version: '1.0.135' })
    expect(missingWatch.resolveAgentPathDir()).toBeUndefined()
  })

  it('keeps manual installation auditable and automatic mutation disabled', () => {
    expect(OFFICECLI_MANUAL_INSTALL_GUIDANCE.targetVersion).toBe('1.0.135')
    expect(OFFICECLI_MANUAL_INSTALL_GUIDANCE.repository).toMatch(/^https:\/\/github\.com\/iOfficeAI\/OfficeCLI$/)
    expect(OFFICECLI_MANUAL_INSTALL_GUIDANCE.integrity).toContain('No repository-verified SHA256 or signature')
    expect(OFFICECLI_MANUAL_INSTALL_GUIDANCE.automaticInstallEnabled).toBe(false)
    expect(OFFICECLI_MANUAL_INSTALL_GUIDANCE.automaticUninstallEnabled).toBe(false)
    expect(OFFICECLI_MANUAL_INSTALL_GUIDANCE.windows.join(' ')).not.toMatch(/irm|iex|curl|bash|latest|main/i)
  })

  it('initializes the provider before production consumers are created', async () => {
    const detect = vi.fn(async () => ({ installed: false, compatible: false }))
    await initializeOfficecliProvider({ detect })
    expect(detect).toHaveBeenCalledOnce()
  })

  it('uses the host PATH delimiter when resolving candidates', async () => {
    const secondBinary = resolve('C:\\second\\officecli.exe')
    const { manager } = createHarness({
      files: [secondBinary],
      path: [resolve('C:\\first'), dirname(secondBinary)].join(delimiter),
    })
    await expect(manager.resolveBinary()).resolves.toEqual({ path: secondBinary, source: 'path' })
  })
})
