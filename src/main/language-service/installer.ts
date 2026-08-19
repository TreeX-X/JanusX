import { createHash, randomUUID } from 'crypto'
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import type {
  LanguageServiceDescriptor,
  LanguageServiceInstallerProgressEvent,
  LanguageServiceManagedInstallStatus,
} from '../../shared/ipc/language-service'

const DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024

interface ManagedManifest {
  owner: 'JanusX'
  schemaVersion: 1
  serviceId: string
  version: string
  sha256: string
  binary: string
}

export interface ManagedBinaryInstallerDependencies {
  platform: NodeJS.Platform
  arch: string
  download(url: string, destination: string, signal: AbortSignal, progress: (percent: number) => void): Promise<void>
  rename(source: string, destination: string): Promise<void>
  remove(path: string, options: { recursive?: boolean; force?: boolean }): Promise<void>
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return Boolean(rel) && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

function isOwnedBinaryPath(root: string, candidate: string, binaryNames: readonly string[]): boolean {
  const parts = relative(root, candidate).split(sep)
  return parts.length === 3 && parts[0] === 'installations' && Boolean(parts[1]) &&
    binaryNames.includes(basename(candidate).toLowerCase()) && isInside(root, candidate)
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

async function downloadArtifact(
  url: string,
  destination: string,
  signal: AbortSignal,
  progress: (percent: number) => void,
): Promise<void> {
  const response = await fetch(url, { redirect: 'follow', signal })
  if (!response.ok || !response.body) throw new Error('Download failed (' + response.status + ')')
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) throw new Error('Download is oversized')
  const handle = await open(destination, 'wx')
  const reader = response.body.getReader()
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_DOWNLOAD_BYTES) throw new Error('Download is oversized')
      await handle.write(value)
      if (declared > 0) progress(Math.min(99, Math.floor(total / declared * 100)))
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    await handle.close()
  }
}

const defaultDependencies: ManagedBinaryInstallerDependencies = {
  platform: process.platform,
  arch: process.arch,
  download: downloadArtifact,
  rename,
  remove: rm,
}

export class ManagedBinaryInstaller {
  private active?: Promise<LanguageServiceManagedInstallStatus>
  private abortController?: AbortController
  private lastFailure?: string
  private readonly deps: ManagedBinaryInstallerDependencies

  constructor(
    readonly root: string,
    readonly descriptor: LanguageServiceDescriptor,
    private readonly onProgress: (event: LanguageServiceInstallerProgressEvent) => void = () => undefined,
    dependencies: Partial<ManagedBinaryInstallerDependencies> = {},
  ) {
    if (!isAbsolute(root)) throw new Error('Managed installer root must be absolute')
    this.deps = { ...defaultDependencies, ...dependencies }
  }

  private get manifestPath(): string { return join(this.root, 'current.json') }

  async getManagedBinary(): Promise<string | undefined> {
    const manifest = await this.readManifest()
    if (!manifest) return undefined
    const binary = resolve(this.root, manifest.binary)
    if (!isOwnedBinaryPath(this.root, binary, this.descriptor.binaryNames.map(n => n.toLowerCase()))) return undefined
    try {
      const canonical = await realpath(binary)
      return isInside(resolve(this.root), canonical) && (await stat(canonical)).isFile() &&
        await sha256(canonical) === manifest.sha256 ? canonical : undefined
    } catch {
      return undefined
    }
  }

  async status(): Promise<LanguageServiceManagedInstallStatus> {
    const artifact = this.safeArtifact()
    const managedBinary = await this.getManagedBinary()
    return {
      serviceId: this.descriptor.id,
      state: this.active ? 'busy' : managedBinary ? 'ready' : this.lastFailure ? 'failed' : 'not-installed',
      version: artifact?.version,
      sha256: artifact?.sha256,
      location: this.root,
      error: this.lastFailure,
    }
  }

  async start(repair = false): Promise<LanguageServiceManagedInstallStatus> {
    if (this.active) return this.status()
    const artifact = this.descriptor.resolveArtifact(this.deps.platform, this.deps.arch)
    const managedBinary = await this.getManagedBinary()
    if (managedBinary && !repair) return this.status()
    this.abortController = new AbortController()
    this.lastFailure = undefined
    this.active = this.runInstall(artifact)
    try {
      return await this.active
    } finally {
      this.active = undefined
      this.abortController = undefined
    }
  }

  cancel(): void {
    this.abortController?.abort()
  }

  async remove(): Promise<LanguageServiceManagedInstallStatus> {
    this.abortController?.abort()
    await this.deps.remove(this.root, { recursive: true, force: true }).catch(() => undefined)
    this.lastFailure = undefined
    return this.status()
  }

  private safeArtifact() {
    try { return this.descriptor.resolveArtifact(this.deps.platform, this.deps.arch) } catch { return undefined }
  }

  private async runInstall(artifact: ReturnType<LanguageServiceDescriptor['resolveArtifact']>): Promise<LanguageServiceManagedInstallStatus> {
    const staging = join(this.root, 'staging')
    const binaryName = this.descriptor.binaryNames[0]
    const stagedBinary = join(staging, binaryName)
    let installationDir: string | undefined
    let temporaryManifest: string | undefined
    let committed = false
    const timeout = setTimeout(() => this.abortController?.abort(), DOWNLOAD_TIMEOUT_MS)
    try {
      await mkdir(staging, { recursive: true })
      this.abortController!.signal.throwIfAborted()
      this.onProgress({ serviceId: this.descriptor.id, stage: 'downloading', percent: 0 })
      await this.deps.download(artifact.url, stagedBinary, this.abortController!.signal, (percent) => {
        this.onProgress({ serviceId: this.descriptor.id, stage: 'downloading', percent: Math.max(0, Math.min(99, percent)) })
      })
      this.abortController!.signal.throwIfAborted()
      this.onProgress({ serviceId: this.descriptor.id, stage: 'verifying' })
      if (artifact.sha256 && await sha256(stagedBinary) !== artifact.sha256) {
        throw new Error('SHA256 mismatch')
      }
      this.abortController!.signal.throwIfAborted()
      if (!(await this.descriptor.verifyBinary(stagedBinary, this.abortController!.signal))) {
        throw new Error('Binary capability probe failed')
      }
      this.abortController!.signal.throwIfAborted()
      this.onProgress({ serviceId: this.descriptor.id, stage: 'installing' })
      const installationId = artifact.version + '-' + randomUUID()
      installationDir = join(this.root, 'installations', installationId)
      await mkdir(dirname(installationDir), { recursive: true })
      this.abortController!.signal.throwIfAborted()
      await this.deps.rename(staging, installationDir)
      const manifest: ManagedManifest = {
        owner: 'JanusX', schemaVersion: 1, serviceId: this.descriptor.id,
        version: artifact.version, sha256: artifact.sha256,
        binary: relative(this.root, join(installationDir, binaryName)),
      }
      temporaryManifest = this.manifestPath + '.' + randomUUID() + '.tmp'
      await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
      this.abortController!.signal.throwIfAborted()
      const backupManifest = this.backupManifestPath
      let hadManifest = false
      await this.deps.remove(backupManifest, { force: true }).catch(() => undefined)
      try { await this.deps.rename(this.manifestPath, backupManifest); hadManifest = true } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      try {
        this.abortController!.signal.throwIfAborted()
        await this.deps.rename(temporaryManifest, this.manifestPath)
        temporaryManifest = undefined
        committed = true
      } catch (error) {
        if (hadManifest) await this.deps.rename(backupManifest, this.manifestPath).catch(() => undefined)
        throw error
      }
      installationDir = undefined
      if (hadManifest) await this.deps.remove(backupManifest, { force: true }).catch(() => undefined)
      const previousBinary = await this.getManagedBinary()
      if (previousBinary && dirname(previousBinary) !== dirname(resolve(this.root, manifest.binary))) {
        await this.deps.remove(dirname(previousBinary), { recursive: true, force: true }).catch(() => undefined)
      }
      this.lastFailure = undefined
      this.onProgress({ serviceId: this.descriptor.id, stage: 'complete', percent: 100 })
      return await this.status()
    } catch (error) {
      this.lastFailure = error instanceof Error ? error.message : String(error)
      this.onProgress({ serviceId: this.descriptor.id, stage: 'failed', message: this.lastFailure })
      if (!committed && installationDir) await this.deps.remove(installationDir, { recursive: true, force: true }).catch(() => undefined)
      throw error
    } finally {
      clearTimeout(timeout)
      await this.deps.remove(staging, { recursive: true, force: true }).catch(() => undefined)
      if (temporaryManifest) await this.deps.remove(temporaryManifest, { force: true }).catch(() => undefined)
    }
  }

  private get backupManifestPath(): string { return this.manifestPath + '.backup' }

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
        typeof value.version !== 'string' || typeof value.sha256 !== 'string' || typeof value.serviceId !== 'string') return undefined
      const artifact = this.descriptor.resolveArtifact(this.deps.platform, this.deps.arch)
      if (value.version !== artifact.version || (artifact.sha256 && value.sha256 !== artifact.sha256)) return undefined
      const binary = resolve(this.root, value.binary)
      if (!isOwnedBinaryPath(this.root, binary, this.descriptor.binaryNames.map(n => n.toLowerCase()))) return undefined
      return value as ManagedManifest
    } catch { return undefined }
  }
}