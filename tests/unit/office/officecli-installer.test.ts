import { createHash } from 'crypto'
import { mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OFFICECLI_MAX_DOWNLOAD_BYTES, resolveOfficecliInstallArtifact } from '../../../src/main/office/officecli-install-policy'
import { downloadOfficecliArtifact, OfficecliInstaller } from '../../../src/main/office/officecli-installer'

const roots: string[] = []
const content = Buffer.from('verified-officecli')
const hash = createHash('sha256').update(content).digest('hex')
const artifact = { version: '1.0.135', arch: 'x64' as const, fileName: 'officecli.exe', url: 'https://example.invalid/tagged.exe', sha256: hash }

async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), 'janusx-office-install-')); roots.push(value); return value }
afterEach(async () => { await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))) })

describe('managed OfficeCLI installer', () => {
  it('pins official Windows artifacts and rejects unsupported targets', () => {
    expect(resolveOfficecliInstallArtifact('win32', 'x64')).toMatchObject({
      version: '1.0.135', sha256: '937db176b585e874aa5bff48d536bce78037665cd862b5deefe56e79977e6588',
    })
    expect(resolveOfficecliInstallArtifact('win32', 'arm64').sha256).toBe('c818013023f83d3c9ec3dcba4dabaf824bdf861da6fa925d0557f508d3b11558')
    expect(() => resolveOfficecliInstallArtifact('linux', 'x64')).toThrow(/unsupported/)
  })

  it('requires confirmation, joins one staged install, verifies, and removes only its manifest-owned copy', async () => {
    const managedRoot = await root()
    const progress: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const download = vi.fn(async (_artifact, destination: string) => { await gate; await writeFile(destination, content) })
    const installer = new OfficecliInstaller(managedRoot, (event) => progress.push(event.stage), {
      platform: 'win32', arch: 'x64', resolveArtifact: () => artifact, download, verifyBinary: async () => true,
    })
    await expect(installer.start(false)).rejects.toThrow(/confirmation/)
    const first = installer.start(true)
    const joined = installer.start(true)
    expect(joined).toBe(first)
    release()
    await expect(first).resolves.toMatchObject({ state: 'ready', version: '1.0.135' })
    expect(download).toHaveBeenCalledOnce()
    expect(progress).toEqual(['downloading', 'verifying', 'installing', 'complete'])
    const binary = await installer.getManagedBinary()
    expect(binary).toBeTruthy()
    await expect(readFile(binary!)).resolves.toEqual(content)
    await installer.remove(true)
    expect(await installer.getManagedBinary()).toBeUndefined()
  })

  it('fails closed on a hash mismatch and preserves the prior manifest during failed repair', async () => {
    const managedRoot = await root()
    const good = new OfficecliInstaller(managedRoot, () => undefined, {
      platform: 'win32', arch: 'x64', resolveArtifact: () => artifact,
      download: async (_artifact, destination) => writeFile(destination, content), verifyBinary: async () => true,
    })
    await good.start(true)
    const prior = await good.getManagedBinary()
    const bad = new OfficecliInstaller(managedRoot, () => undefined, {
      platform: 'win32', arch: 'x64', resolveArtifact: () => artifact,
      download: async (_artifact, destination) => writeFile(destination, 'corrupted download'), verifyBinary: async () => true,
    })
    await expect(bad.start(true)).rejects.toThrow(/SHA256/)
    expect(await bad.getManagedBinary()).toBe(prior)
  })

  it('rejects oversized responses and capability failure before publication', async () => {
    const managedRoot = await root()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, body: {}, headers: new Headers({ 'content-length': String(OFFICECLI_MAX_DOWNLOAD_BYTES + 1) }),
    })))
    await expect(downloadOfficecliArtifact(artifact, join(managedRoot, 'oversized.exe'), new AbortController().signal, () => undefined)).rejects.toThrow(/oversized/)
    vi.unstubAllGlobals()

    const installer = new OfficecliInstaller(managedRoot, () => undefined, {
      platform: 'win32', arch: 'x64', resolveArtifact: () => artifact,
      download: async (_artifact, destination) => writeFile(destination, content), verifyBinary: async () => false,
    })
    await expect(installer.start(true)).rejects.toThrow(/capability/)
    expect(await installer.getManagedBinary()).toBeUndefined()
  })

  it('cancels an active download and refuses a manifest that could delete its root', async () => {
    const managedRoot = await root()
    let started!: () => void
    const didStart = new Promise<void>((resolve) => { started = resolve })
    const installer = new OfficecliInstaller(managedRoot, () => undefined, {
      platform: 'win32', arch: 'x64', resolveArtifact: () => artifact, verifyBinary: async () => true,
      download: async (_artifact, _destination, signal) => new Promise<void>((_resolve, reject) => {
        started()
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      }),
    })
    const installing = installer.start(true)
    await didStart
    installer.cancel()
    await expect(installing).rejects.toThrow(/cancelled/)

    await writeFile(join(managedRoot, 'officecli.exe'), 'do-not-delete')
    await writeFile(join(managedRoot, 'current.json'), JSON.stringify({ owner: 'JanusX', schemaVersion: 1, version: '1.0.135', sha256: hash, binary: 'officecli.exe' }))
    await expect(installer.remove(true)).resolves.toMatchObject({ state: 'failed' })
    expect((await stat(managedRoot)).isDirectory()).toBe(true)
    await expect(readFile(join(managedRoot, 'officecli.exe'), 'utf8')).resolves.toBe('do-not-delete')
  })

  it('rejects a self-consistent malicious manifest before executing its binary', async () => {
    const managedRoot = await root()
    const installation = join(managedRoot, 'installations', 'malicious')
    await mkdir(installation, { recursive: true })
    await writeFile(join(installation, 'officecli.exe'), content)
    await writeFile(join(managedRoot, 'current.json'), JSON.stringify({
      owner: 'JanusX', schemaVersion: 1, version: '1.0.135', sha256: hash,
      binary: 'installations/malicious/officecli.exe',
    }))
    const verifyBinary = vi.fn(async () => true)
    const installer = new OfficecliInstaller(managedRoot, () => undefined, {
      platform: 'win32', arch: 'x64', verifyBinary,
    })
    expect(await installer.getManagedBinary()).toBeUndefined()
    expect(verifyBinary).not.toHaveBeenCalled()
  })

  it('restores publication failures and recovers an interrupted backup on startup', async () => {
    const managedRoot = await root()
    const dependencies = {
      platform: 'win32' as const, arch: 'x64', resolveArtifact: () => artifact,
      download: async (_artifact: unknown, destination: string) => writeFile(destination, content),
      verifyBinary: async () => true,
    }
    const initial = new OfficecliInstaller(managedRoot, () => undefined, dependencies)
    await initial.start(true)
    const prior = await initial.getManagedBinary()

    const failedCommit = new OfficecliInstaller(managedRoot, () => undefined, {
      ...dependencies,
      rename: async (source, destination) => {
        if (source.endsWith('.tmp') && destination.endsWith('current.json')) throw new Error('injected commit failure')
        await rename(source, destination)
      },
    })
    await expect(failedCommit.start(true)).rejects.toThrow(/injected commit/)
    expect(await failedCommit.getManagedBinary()).toBe(prior)

    await rename(join(managedRoot, 'current.json'), join(managedRoot, 'current.json.backup'))
    const recovered = new OfficecliInstaller(managedRoot, () => undefined, dependencies)
    expect(await recovered.getManagedBinary()).toBe(prior)
    await expect(stat(join(managedRoot, 'current.json'))).resolves.toBeTruthy()
  })

  it('keeps the committed installation when non-critical backup cleanup fails', async () => {
    const managedRoot = await root()
    const dependencies = {
      platform: 'win32' as const, arch: 'x64', resolveArtifact: () => artifact,
      download: async (_artifact: unknown, destination: string) => writeFile(destination, content),
      verifyBinary: async () => true,
    }
    await new OfficecliInstaller(managedRoot, () => undefined, dependencies).start(true)
    const repair = new OfficecliInstaller(managedRoot, () => undefined, {
      ...dependencies,
      remove: async (path, options) => {
        if (path.endsWith('current.json.backup')) throw new Error('injected cleanup failure')
        await rm(path, options)
      },
    })
    await expect(repair.start(true)).resolves.toMatchObject({ state: 'ready' })
    expect(await repair.getManagedBinary()).toBeTruthy()
  })

  it('cancels an in-flight capability probe before publication', async () => {
    const managedRoot = await root()
    let probing!: () => void
    const probeStarted = new Promise<void>((resolve) => { probing = resolve })
    const installer = new OfficecliInstaller(managedRoot, () => undefined, {
      platform: 'win32', arch: 'x64', resolveArtifact: () => artifact,
      download: async (_artifact, destination) => writeFile(destination, content),
      verifyBinary: async (_binary, signal) => new Promise<boolean>((_resolve, reject) => {
        probing()
        signal.addEventListener('abort', () => reject(new Error('probe cancelled')), { once: true })
      }),
    })
    const installing = installer.start(true)
    await probeStarted
    installer.cancel()
    await expect(installing).rejects.toThrow(/probe cancelled/)
    expect(await installer.getManagedBinary()).toBeUndefined()
  })
})
