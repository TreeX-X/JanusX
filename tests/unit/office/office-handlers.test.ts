import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OFFICE_INVOKE_CHANNELS } from '../../../src/shared/office'

type Handler = (...args: any[]) => unknown
const handlers = new Map<string, Handler>()
const temporaryDirectories: string[] = []
const officecliDetect = vi.hoisted(() => vi.fn())
const configureManagedBinaryPath = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}))

vi.mock('../../../src/main/office/officecli-manager', () => ({
  officecliManager: { detect: officecliDetect, configureManagedBinaryPath },
}))

import { registerOfficeHandlers } from '../../../src/main/ipc/office-handlers'
import { createProductionOfficeOperations } from '../../../src/main/office/office-handler-operations'

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-office-ipc-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('Office IPC handlers', () => {
  beforeEach(() => {
    handlers.clear()
    officecliDetect.mockReset()
    configureManagedBinaryPath.mockReset()
  })

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('rejects unauthorized senders and invalid payloads before operations run', async () => {
    const sender = { isDestroyed: () => false }
    const detect = vi.fn()
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => undefined,
      operations: { detect },
    })
    const handler = handlers.get(OFFICE_INVOKE_CHANNELS.detect)!

    await expect(handler({ sender: {} }, { workspaceId: 'trusted' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    })
    await expect(handler({ sender }, { workspaceId: 'trusted', rootPath: 'C:\\secret' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    })
    expect(detect).not.toHaveBeenCalled()
  })

  it('returns only public provider fields and never forwards internal errors', async () => {
    const sender = { isDestroyed: () => false }
    const root = await makeTemporaryDirectory()
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => root,
      operations: {
        detect: async () => ({
          installed: true,
          compatible: true,
          version: '1.2.3',
          path: 'C:\\secret\\officecli.exe',
          runtimeError: 'stack at C:\\secret',
          source: 'path',
        }),
      },
    })

    const result = await handlers.get(OFFICE_INVOKE_CHANNELS.detect)!({ sender }, { workspaceId: 'trusted' })
    expect(result).toEqual({
      ok: true,
      value: { installed: true, compatible: true, version: '1.2.3', source: 'path' },
    })
  })

  it('authorizes and validates explicit installer operations before mutation', async () => {
    const sender = { isDestroyed: () => false }
    const root = await makeTemporaryDirectory()
    const installer = {
      status: vi.fn(async () => ({ state: 'not-installed' as const, location: 'managed' })),
      start: vi.fn(async () => ({ state: 'ready' as const, location: 'managed', version: '1.0.135' })),
      cancel: vi.fn(),
      remove: vi.fn(async () => ({ state: 'not-installed' as const, location: 'managed' })),
      getManagedBinary: vi.fn(async () => 'C:\\private\\officecli.exe'),
    }
    officecliDetect.mockResolvedValue({ installed: true, compatible: true })
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => root,
      installer,
    })
    const handler = handlers.get(OFFICE_INVOKE_CHANNELS.installerStart)!
    await expect(handler({ sender: {} }, { workspaceId: 'trusted', confirmed: true })).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
    await expect(handler({ sender }, { workspaceId: 'trusted', confirmed: false })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    await expect(handler({ sender }, { workspaceId: 'trusted', confirmed: true, executable: 'C:\\evil.exe' })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    await expect(handler({ sender }, { workspaceId: 'trusted', confirmed: true })).resolves.toMatchObject({ ok: true, value: { state: 'ready' } })
    expect(installer.start).toHaveBeenCalledWith(true)
    expect(configureManagedBinaryPath).toHaveBeenCalledWith('C:\\private\\officecli.exe')
  })

  it('uses the production singleton and exposes safe unavailable guidance', async () => {
    const sender = { isDestroyed: () => false }
    const root = await makeTemporaryDirectory()
    officecliDetect.mockResolvedValue({
      installed: false,
      compatible: false,
      path: 'C:\\secret\\officecli.exe',
      runtimeError: 'raw stderr C:\\secret',
      manualInstall: {
        repository: 'https://github.com/iOfficeAI/OfficeCLI',
        release: 'https://github.com/iOfficeAI/OfficeCLI/releases/tag/v1.0.135',
        targetVersion: '1.0.135',
        integrity: 'No repository-verified hash is recorded.',
        windows: ['Download and verify the tagged release.'],
        automaticInstallEnabled: false,
        automaticUninstallEnabled: false,
        path: 'C:\\secret',
      },
      existingTerminalNotice: 'Restart existing terminals for the updated PATH to take effect.',
    })
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => root,
    })

    const result = await handlers.get(OFFICE_INVOKE_CHANNELS.detect)!({ sender }, { workspaceId: 'trusted' })
    expect(officecliDetect).toHaveBeenCalledOnce()
    expect(result).toEqual({
      ok: true,
      value: {
        installed: false,
        compatible: false,
        manualInstall: {
          repository: 'https://github.com/iOfficeAI/OfficeCLI',
          release: 'https://github.com/iOfficeAI/OfficeCLI/releases/tag/v1.0.135',
          targetVersion: '1.0.135',
          integrity: 'No repository-verified hash is recorded.',
          windows: ['Download and verify the tagged release.'],
          automaticInstallEnabled: false,
          automaticUninstallEnabled: false,
        },
        existingTerminalNotice: 'Restart existing terminals for the updated PATH to take effect.',
      },
    })
  })

  it('resolves a trusted file before starting and sanitizes operation failures', async () => {
    const root = await makeTemporaryDirectory()
    await mkdir(join(root, 'reports'))
    await writeFile(join(root, 'reports', 'report.docx'), 'document')
    const sender = { isDestroyed: () => false }
    const startPreview = vi.fn(async () => {
      const error = new Error('stack at C:\\secret') as Error & { code: string }
      error.code = 'START_FAILED'
      throw error
    })
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => root,
      operations: { startPreview },
    })

    const result = await handlers.get(OFFICE_INVOKE_CHANNELS.startPreview)!(
      { sender },
      { workspaceId: 'trusted', relPath: 'reports/report.docx' },
    )
    expect(startPreview).toHaveBeenCalledWith(expect.objectContaining({ relPath: 'reports/report.docx' }))
    expect(result).toEqual({
      ok: false,
      error: { code: 'START_FAILED', message: 'Office preview could not start' },
    })
  })

  it('rejects inconsistent file entries without exposing provider fields', async () => {
    const sender = { isDestroyed: () => false }
    const root = await makeTemporaryDirectory()
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => root,
      operations: {
        listFiles: async () => [{
          relPath: 'notes.txt',
          mtimeMs: 1,
          size: 2,
          ext: '.docx',
          absPath: 'C:\\secret\\notes.txt',
        } as any],
      },
    })

    await expect(
      handlers.get(OFFICE_INVOKE_CHANNELS.listFiles)!({ sender }, { workspaceId: 'trusted' }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'Office feature is unavailable' },
    })
  })

  it('routes generic and specific prompt requests through production operation composition', async () => {
    const root = await makeTemporaryDirectory()
    await writeFile(join(root, 'report.docx'), 'document')
    const sender = { isDestroyed: () => false }
    const buildPrompt = vi.fn(async (input: { workspaceId: string; terminalPreset: string; skillId?: string }) => ({
      mode: input.skillId ? 'specific' as const : 'generic' as const,
      text: JSON.stringify(input),
    }))
    const operations = createProductionOfficeOperations({
      artifactIndex: { list: vi.fn(async () => []) },
      watchPool: {
        acquire: vi.fn(),
        release: vi.fn(),
        reload: vi.fn(),
      },
      buildPrompt,
    })
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => root,
      operations,
    })
    const handler = handlers.get(OFFICE_INVOKE_CHANNELS.buildPrompt)!

    await expect(handler({ sender }, {
      workspaceId: 'trusted',
      relPath: 'report.docx',
      terminalPreset: 'codex',
    })).resolves.toMatchObject({ ok: true, value: { mode: 'generic' } })
    await expect(handler({ sender }, {
      workspaceId: 'trusted',
      relPath: 'report.docx',
      terminalPreset: 'claude',
      skillId: 'officecli-docx',
    })).resolves.toMatchObject({ ok: true, value: { mode: 'specific' } })
    await expect(handler({ sender }, {
      workspaceId: 'trusted',
      relPath: 'report.docx',
      terminalPreset: 'codex',
      skillId: 'unknown',
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })

    expect(buildPrompt).toHaveBeenNthCalledWith(1, { workspaceId: 'trusted', terminalPreset: 'codex' })
    expect(buildPrompt).toHaveBeenNthCalledWith(2, { workspaceId: 'trusted', terminalPreset: 'claude', skillId: 'officecli-docx' })
    expect(buildPrompt).toHaveBeenCalledTimes(2)
  })

  it('returns non-executable guidance through the production prompt operation', async () => {
    const root = await makeTemporaryDirectory()
    await writeFile(join(root, 'report.docx'), 'document')
    const sender = { isDestroyed: () => false }
    officecliDetect.mockResolvedValue({ installed: false, compatible: false })
    registerOfficeHandlers({
      getAllowedWindows: () => [{ isDestroyed: () => false, webContents: sender } as any],
      resolveWorkspaceRoot: async () => root,
      operations: createProductionOfficeOperations({
        artifactIndex: { list: vi.fn(async () => []) },
        watchPool: { acquire: vi.fn(), release: vi.fn(), reload: vi.fn() },
      }),
    })

    const result = await handlers.get(OFFICE_INVOKE_CHANNELS.buildPrompt)!({ sender }, {
      workspaceId: 'trusted',
      relPath: 'report.docx',
      terminalPreset: 'opencode',
    }) as any
    expect(result).toMatchObject({ ok: true, value: { mode: 'guidance' } })
    expect(result.value.text).toContain('not installed')
    expect(result.value.text).not.toContain('create --help')
    expect(officecliDetect).toHaveBeenCalledOnce()
  })
})
