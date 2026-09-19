import { dirname, resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  OfficecliManager,
  initializeOfficecliProvider,
} from '../../../src/main/office/officecli-manager'

type RunResult = { exitCode: number; stdout: string; stderr: string; timedOut?: boolean }

function createHarness(options: {
  files?: string[]
  bundledBinaryPath?: string
  envBinary?: string
  run?: (binary: string, args: readonly string[]) => Promise<RunResult>
} = {}) {
  const files = new Set((options.files ?? []).map(file => resolve(file)))
  const run = vi.fn(options.run ?? (async (_binary: string, args: readonly string[]) => ({
    exitCode: 0,
    stdout: args[0] === '--version' ? 'OfficeCLI 1.0.135' : 'help',
    stderr: '',
  })))
  const manager = new OfficecliManager({
    env: options.envBinary ? { JANUSX_OFFICECLI_BINARY: options.envBinary } : {},
    platform: 'win32',
    bundledBinaryPath: options.bundledBinaryPath,
    isRegularFile: async candidate => files.has(resolve(candidate)),
    run,
  })
  return { manager, run, files }
}

describe('OfficecliManager', () => {
  it('returns the missing bundled state without probes when no binary is configured', async () => {
    const { manager, run } = createHarness()

    await expect(manager.detect()).resolves.toEqual({
      installed: false,
      compatible: false,
    })
    expect(run).not.toHaveBeenCalled()
    expect(manager.resolveAgentPathDir()).toBeUndefined()
  })

  it('verifies the bundled binary and exposes its directory only after all gates pass', async () => {
    const bundled = resolve('C:\\bundle\\officecli.exe')
    const { manager, run } = createHarness({
      files: [bundled],
      bundledBinaryPath: bundled,
    })

    await expect(manager.detect()).resolves.toEqual({
      installed: true,
      compatible: true,
      version: '1.0.135',
      path: bundled,
      source: 'bundled',
    })
    expect(run.mock.calls.map(([, args]) => args)).toEqual([
      ['--version'],
      ['watch', '--help'],
      ['create', '--help'],
      ['batch', '--help'],
    ])
    expect(manager.resolveAgentPathDir()).toBe(dirname(bundled))
  })

  it('prefers the JANUSX_OFFICECLI_BINARY override for dev without PATH scanning', async () => {
    const override = resolve('C:\\dev\\officecli.exe')
    const bundled = resolve('C:\\bundle\\officecli.exe')
    const { manager } = createHarness({
      files: [override, bundled],
      bundledBinaryPath: bundled,
      envBinary: override,
    })

    await expect(manager.detect()).resolves.toMatchObject({
      installed: true,
      compatible: true,
      path: override,
      source: 'bundled',
    })
  })

  it('reuses verified binary without re-probing on resolveBinary', async () => {
    const bundled = resolve('C:\\bundle\\officecli.exe')
    const { manager, run } = createHarness({
      files: [bundled],
      bundledBinaryPath: bundled,
    })

    await manager.detect()
    run.mockClear()

    await expect(manager.resolveBinary()).resolves.toEqual({
      path: bundled,
      source: 'bundled',
    })
    expect(manager.resolveAgentPathDir()).toBe(dirname(bundled))
    expect(run).not.toHaveBeenCalled()
  })

  it('clears the verified directory when the bundled binary is deleted', async () => {
    const binary = resolve('C:\\bundle\\officecli.exe')
    const { manager, files } = createHarness({
      files: [binary],
      bundledBinaryPath: binary,
    })

    await manager.detect()
    files.delete(binary)

    await expect(manager.refreshAgentPathDir()).resolves.toBeUndefined()
    files.add(binary)
    expect(manager.resolveAgentPathDir()).toBeUndefined()
  })

  it('returns a bounded reinstall diagnostic without exposing process output', async () => {
    const binary = resolve('C:\\bundle\\officecli.exe')
    const secret = 'C:\\Users\\secret\\private-token'
    const { manager } = createHarness({
      files: [binary],
      bundledBinaryPath: binary,
      run: async () => ({ exitCode: 134, stdout: '', stderr: `ICU missing at ${secret}` }),
    })

    const info = await manager.detect()
    expect(info).toMatchObject({ installed: true, compatible: false, source: 'bundled' })
    expect(info.runtimeError).toContain('ICU')
    expect(info.runtimeError).not.toContain(secret)
    expect(info.path).toBeUndefined()
  })

  it('rejects unknown versions and binaries missing a required capability', async () => {
    const binary = resolve('C:\\bundle\\officecli.exe')
    const unknown = createHarness({
      files: [binary],
      bundledBinaryPath: binary,
      run: async () => ({ exitCode: 0, stdout: 'OfficeCLI 9.9.9', stderr: '' }),
    }).manager
    expect(await unknown.detect()).toMatchObject({
      installed: true,
      compatible: false,
      version: '9.9.9',
      source: 'bundled',
    })
    await expect(unknown.resolveBinary()).resolves.toBeUndefined()
    expect(unknown.resolveAgentPathDir()).toBeUndefined()

    const missingWatch = createHarness({
      files: [binary],
      bundledBinaryPath: binary,
      run: async (_binary, args) => ({
        exitCode: args[0] === 'watch' ? 2 : 0,
        stdout: args[0] === '--version' ? '1.0.135' : '',
        stderr: '',
      }),
    }).manager
    expect(await missingWatch.detect()).toMatchObject({ installed: true, compatible: false, version: '1.0.135' })
    expect(missingWatch.resolveAgentPathDir()).toBeUndefined()
  })

  it('initializes the provider before production consumers are created', async () => {
    const detect = vi.fn(async () => ({ installed: false, compatible: false }))
    await initializeOfficecliProvider({ detect })
    expect(detect).toHaveBeenCalledOnce()
  })
})
