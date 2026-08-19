import { delimiter, isAbsolute, resolve } from 'path'
import { stat } from 'fs/promises'
import type { LanguageServiceDescriptor } from '../../shared/ipc/language-service'

interface BinaryResolverDependencies {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  isRegularFile(path: string): Promise<boolean>
}

const defaultDependencies: BinaryResolverDependencies = {
  env: process.env,
  platform: process.platform,
  isRegularFile: async (path: string) => (await stat(path)).isFile(),
}

export interface ResolvedBinary {
  path: string
  source: 'managed' | 'path' | 'known-location'
}

export class BinaryResolver {
  private managedBinaryPath?: string
  private cached?: ResolvedBinary

  constructor(
    readonly descriptor: LanguageServiceDescriptor,
    private readonly deps: BinaryResolverDependencies = defaultDependencies,
  ) {}

  configureManagedBinaryPath(path: string | undefined): void {
    this.managedBinaryPath = path
    this.cached = undefined
  }

  async resolve(): Promise<ResolvedBinary | undefined> {
    if (!this.cached) await this.detect()
    return this.cached
  }

  async detect(): Promise<void> {
    this.cached = undefined
    const resolved = await this.findCandidate()
    if (resolved) this.cached = resolved
  }

  private async findCandidate(): Promise<ResolvedBinary | undefined> {
    if (this.managedBinaryPath && await this.isRegularAbsoluteFile(this.managedBinaryPath)) {
      return { path: resolve(this.managedBinaryPath), source: 'managed' }
    }
    const pathValue = Object.entries(this.deps.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? ''
    const pathCandidates = pathValue
      .split(delimiter)
      .filter(Boolean)
      .flatMap(directory => this.descriptor.binaryNames.map(name => resolve(directory, name)))
    for (const candidate of pathCandidates) {
      if (await this.isRegularAbsoluteFile(candidate)) return { path: candidate, source: 'path' }
    }
    for (const candidate of this.descriptor.knownLocations) {
      if (await this.isRegularAbsoluteFile(candidate)) return { path: resolve(candidate), source: 'known-location' }
    }
    return undefined
  }

  private async isRegularAbsoluteFile(candidate: string): Promise<boolean> {
    if (!isAbsolute(candidate)) return false
    try {
      return await this.deps.isRegularFile(candidate)
    } catch {
      return false
    }
  }
}