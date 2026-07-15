import { createHash, randomUUID } from 'crypto'
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import {
  OFFICECLI_DOWNLOAD_TIMEOUT_MS,
  OFFICECLI_MAX_DOWNLOAD_BYTES,
  resolveOfficecliInstallArtifact,
  type OfficecliInstallArtifact,
} from './officecli-install-policy'
import type { OfficeInstallerProgressEvent, OfficeManagedInstallStatus } from '../../shared/office'

interface ManagedManifest {
  owner: 'JanusX'
  schemaVersion: 1
  version: string
  sha256: string
  binary: string
}

export interface OfficecliInstallerDependencies {
  platform: NodeJS.Platform
  arch: string
  download(artifact: OfficecliInstallArtifact, destination: string, signal: AbortSignal, progress: (percent: number) => void): Promise<void>
  verifyBinary(binary: string, signal: AbortSignal): Promise<boolean>
  resolveArtifact(platform: NodeJS.Platform, arch: string): OfficecliInstallArtifact
  rename(source: string, destination: string): Promise<void>
  remove(path: string, options: { recursive?: boolean; force?: boolean }): Promise<void>
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return Boolean(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function isOwnedBinaryPath(root: string, candidate: string): boolean {
  const parts = relative(root, candidate).split(sep)
  return parts.length === 3 && parts[0] === 'installations' && Boolean(parts[1]) &&
    basename(candidate).toLowerCase() === 'officecli.exe' && isInside(root, candidate)
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let position = 0
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (!bytesRead) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

export async function downloadOfficecliArtifact(
  artifact: OfficecliInstallArtifact,
  destination: string,
  signal: AbortSignal,
  progress: (percent: number) => void,
): Promise<void> {
  const response = await fetch(artifact.url, { redirect: 'follow', signal })
  if (!response.ok || !response.body) throw new Error(`OfficeCLI download failed (${response.status})`)
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > OFFICECLI_MAX_DOWNLOAD_BYTES) throw new Error('OfficeCLI download is oversized')
  const handle = await open(destination, 'wx')
  const reader = response.body.getReader()
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > OFFICECLI_MAX_DOWNLOAD_BYTES) throw new Error('OfficeCLI download is oversized')
      await handle.write(value)
      if (declared > 0) progress(Math.min(99, Math.floor(total / declared * 100)))
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    await handle.close()
  }
}

const defaultDependencies: OfficecliInstallerDependencies = {
  platform: process.platform,
  arch: process.arch,
  download: downloadOfficecliArtifact,
  verifyBinary: async () => false,
  resolveArtifact: resolveOfficecliInstallArtifact,
  rename,
  remove: rm,
}

export class OfficecliInstaller {
  private active?: Promise<OfficeManagedInstallStatus>
  private abortController?: AbortController
  private lastFailure?: string
  private readonly deps: OfficecliInstallerDependencies

  constructor(
    readonly root: string,
    private readonly onProgress: (event: OfficeInstallerProgressEvent) => void = () => undefined,
    dependencies: Partial<OfficecliInstallerDependencies> = {},
  ) {
    if (!isAbsolute(root)) throw new Error('Managed OfficeCLI root must be absolute')
    this.deps = { ...defaultDependencies, ...dependencies }
  }

  private get manifestPath(): string { return join(this.root, 'current.json') }

  async getManagedBinary(): Promise<string | undefined> {
    const manifest = await this.readManifest()
    if (!manifest) return undefined
    const binary = resolve(this.root, manifest.binary)
    if (!isOwnedBinaryPath(this.root, binary)) return undefined
    try {
      const canonical = await realpath(binary)
      return isInside(resolve(this.root), canonical) && (await stat(canonical)).isFile() &&
        await sha256(canonical) === manifest.sha256 ? canonical : undefined
    } catch {
      return undefined
    }
  }

  async status(): Promise<OfficeManagedInstallStatus> {
    const artifact = this.safeArtifact()
    const managedBinary = await this.getManagedBinary()
    return {
      state: this.active ? 'busy' : managedBinary ? 'ready' : this.lastFailure ? 'failed' : 'not-installed',
      version: artifact?.version,
      sha256: artifact?.sha256,
      source: artifact?.url,
      location: 'JanusX managed user-data',
      existingTerminalNotice: managedBinary ? 'Restart existing terminals to use the managed OfficeCLI.' : undefined,
      error: this.lastFailure,
    }
  }

  start(confirmed: boolean): Promise<OfficeManagedInstallStatus> {
    if (!confirmed) return Promise.reject(new Error('Explicit OfficeCLI installation confirmation is required'))
    if (this.active) return this.active
    this.active = this.install().finally(() => { this.active = undefined; this.abortController = undefined })
    return this.active
  }

  cancel(): void { this.abortController?.abort() }

  async remove(confirmed: boolean): Promise<OfficeManagedInstallStatus> {
    if (!confirmed) throw new Error('Explicit OfficeCLI removal confirmation is required')
    if (this.active) throw new Error('OfficeCLI installation is busy')
    const manifest = await this.readManifest()
    if (!manifest) return this.status()
    const binary = resolve(this.root, manifest.binary)
    if (!isOwnedBinaryPath(this.root, binary)) throw new Error('Managed OfficeCLI manifest is invalid')
    const canonical = await realpath(binary)
    if (!isInside(resolve(this.root), canonical)) throw new Error('Managed OfficeCLI manifest escapes its root')
    await this.deps.remove(dirname(binary), { recursive: true, force: true })
    await this.deps.remove(this.manifestPath, { force: true })
    this.lastFailure = undefined
    return { ...(await this.status()), existingTerminalNotice: 'Restart existing terminals after removing the managed OfficeCLI.' }
  }

  private safeArtifact(): OfficecliInstallArtifact | undefined {
    try { return this.deps.resolveArtifact(this.deps.platform, this.deps.arch) } catch { return undefined }
  }

  private async install(): Promise<OfficeManagedInstallStatus> {
    const artifact = this.deps.resolveArtifact(this.deps.platform, this.deps.arch)
    const previousBinary = await this.getManagedBinary()
    const staging = join(this.root, '.staging', randomUUID())
    const stagedBinary = join(staging, 'officecli.exe')
    let installationDir: string | undefined
    let temporaryManifest: string | undefined
    let committed = false
    this.abortController = new AbortController()
    const timeout = setTimeout(() => this.abortController?.abort(), OFFICECLI_DOWNLOAD_TIMEOUT_MS)
    try {
      await mkdir(staging, { recursive: true })
      this.abortController.signal.throwIfAborted()
      this.onProgress({ stage: 'downloading', percent: 0 })
      await this.deps.download(artifact, stagedBinary, this.abortController.signal, (percent) => {
        this.onProgress({ stage: 'downloading', percent: Math.max(0, Math.min(99, percent)) })
      })
      this.abortController.signal.throwIfAborted()
      this.onProgress({ stage: 'verifying' })
      if (await sha256(stagedBinary) !== artifact.sha256) throw new Error('OfficeCLI SHA256 mismatch')
      this.abortController.signal.throwIfAborted()
      if (!(await this.deps.verifyBinary(stagedBinary, this.abortController.signal))) throw new Error('OfficeCLI capability probe failed')
      this.abortController.signal.throwIfAborted()
      this.onProgress({ stage: 'installing' })
      const installationId = `${artifact.version}-${randomUUID()}`
      installationDir = join(this.root, 'installations', installationId)
      await mkdir(dirname(installationDir), { recursive: true })
      this.abortController.signal.throwIfAborted()
      await this.deps.rename(staging, installationDir)
      const manifest: ManagedManifest = {
        owner: 'JanusX', schemaVersion: 1, version: artifact.version, sha256: artifact.sha256,
        binary: relative(this.root, join(installationDir, 'officecli.exe')),
      }
      temporaryManifest = `${this.manifestPath}.${randomUUID()}.tmp`
      await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      this.abortController.signal.throwIfAborted()
      const backupManifest = this.backupManifestPath
      let hadManifest = false
      await this.deps.remove(backupManifest, { force: true }).catch(() => undefined)
      try { await this.deps.rename(this.manifestPath, backupManifest); hadManifest = true } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      try {
        this.abortController.signal.throwIfAborted()
        await this.deps.rename(temporaryManifest, this.manifestPath)
        temporaryManifest = undefined
        committed = true
      } catch (error) {
        if (hadManifest) await this.deps.rename(backupManifest, this.manifestPath).catch(() => undefined)
        throw error
      }
      installationDir = undefined
      if (hadManifest) await this.deps.remove(backupManifest, { force: true }).catch(() => undefined)
      if (previousBinary && dirname(previousBinary) !== dirname(resolve(this.root, manifest.binary))) {
        await this.deps.remove(dirname(previousBinary), { recursive: true, force: true }).catch(() => undefined)
      }
      this.lastFailure = undefined
      this.onProgress({ stage: 'complete', percent: 100 })
      return { ...(await this.status()), state: 'ready' }
    } catch (error) {
      this.lastFailure = error instanceof Error ? error.message : String(error)
      this.onProgress({ stage: 'failed', message: this.lastFailure })
      if (!committed && installationDir) await this.deps.remove(installationDir, { recursive: true, force: true }).catch(() => undefined)
      throw error
    } finally {
      clearTimeout(timeout)
      await this.deps.remove(staging, { recursive: true, force: true }).catch(() => undefined)
      if (temporaryManifest) await this.deps.remove(temporaryManifest, { force: true }).catch(() => undefined)
    }
  }

  private get backupManifestPath(): string { return `${this.manifestPath}.backup` }

  private async readManifest(): Promise<ManagedManifest | undefined> {
    const current = await this.readManifestFile(this.manifestPath)
    if (current) {
      await this.deps.remove(this.backupManifestPath, { force: true }).catch(() => undefined)
      return current
    }
    const backup = await this.readManifestFile(this.backupManifestPath)
    if (!backup) return undefined
    await this.deps.remove(this.manifestPath, { force: true }).catch(() => undefined)
    await this.deps.rename(this.backupManifestPath, this.manifestPath).catch(() => undefined)
    return backup
  }

  private async readManifestFile(manifestPath: string): Promise<ManagedManifest | undefined> {
    try {
      const value = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<ManagedManifest>
      if (value.owner !== 'JanusX' || value.schemaVersion !== 1 || typeof value.binary !== 'string' ||
        typeof value.version !== 'string' || typeof value.sha256 !== 'string') return undefined
      const artifact = this.deps.resolveArtifact(this.deps.platform, this.deps.arch)
      if (value.version !== artifact.version || value.sha256 !== artifact.sha256) return undefined
      const binary = resolve(this.root, value.binary)
      if (!isOwnedBinaryPath(this.root, binary)) return undefined
      return value as ManagedManifest
    } catch { return undefined }
  }
}
