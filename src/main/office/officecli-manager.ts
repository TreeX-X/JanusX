import { stat } from 'fs/promises'
import { homedir } from 'os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'path'
import { execa } from 'execa'
import type { OfficecliInfo, OfficecliManualInstallGuidance } from '../../shared/office'

const SUPPORTED_VERSION = '1.0.135'
const PROBE_TIMEOUT_MS = 5_000
const REQUIRED_CAPABILITIES = ['watch', 'create', 'batch'] as const

export const OFFICECLI_MANUAL_INSTALL_GUIDANCE: OfficecliManualInstallGuidance = {
  repository: 'https://github.com/iOfficeAI/OfficeCLI',
  release: `https://github.com/iOfficeAI/OfficeCLI/releases/tag/v${SUPPORTED_VERSION}`,
  targetVersion: SUPPORTED_VERSION,
  integrity: 'Pinned official SHA256: x64 937db176b585e874aa5bff48d536bce78037665cd862b5deefe56e79977e6588; arm64 c818013023f83d3c9ec3dcba4dabaf824bdf861da6fa925d0557f508d3b11558.',
  windows: [
    'Download the Windows binary from the tagged official release after verifying its published integrity metadata.',
    'Run: Copy-Item .\\officecli.exe "$env:LOCALAPPDATA\\OfficeCLI\\officecli.exe"',
    'Add %LOCALAPPDATA%\\OfficeCLI to the user PATH without replacing existing entries.',
    `Open a new terminal and run officecli --version; the supported version is ${SUPPORTED_VERSION}.`,
  ],
  automaticInstallEnabled: false,
  automaticUninstallEnabled: false,
}

export const OFFICECLI_EXISTING_TERMINAL_NOTICE =
  'Restart existing terminals for the updated PATH to take effect.'

interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut?: boolean
}

interface OfficecliManagerDependencies {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  homeDir: string
  isRegularFile(path: string): Promise<boolean>
  run(binary: string, args: readonly string[], signal?: AbortSignal): Promise<CommandResult>
}

interface ResolvedBinary {
  path: string
  source: 'path' | 'known-location' | 'managed'
}

function defaultBinaryNames(platform: NodeJS.Platform): readonly string[] {
  return platform === 'win32' ? ['officecli.exe'] : ['officecli']
}

function knownLocations(deps: OfficecliManagerDependencies): string[] {
  if (deps.platform === 'win32') {
    const localAppData = deps.env.LOCALAPPDATA
    return localAppData ? [join(localAppData, 'OfficeCLI', 'officecli.exe')] : []
  }
  return [join(deps.homeDir, '.local', 'bin', 'officecli'), '/usr/local/bin/officecli']
}

function parseVersion(output: string): string | undefined {
  return output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1]
}

function boundedRuntimeDiagnostic(result: CommandResult): string {
  const detail = `${result.stderr}\n${result.stdout}`.toLowerCase()
  if (result.timedOut) return 'OfficeCLI timed out during its startup check. Reinstall it and verify the local runtime.'
  if (detail.includes('icu') || detail.includes('globalization')) {
    return 'OfficeCLI could not load ICU/globalization support. Install the required system runtime and retry.'
  }
  if (detail.includes('.net') || detail.includes('hostfxr') || detail.includes('framework')) {
    return 'OfficeCLI could not load its required .NET runtime. Install the supported .NET runtime and retry.'
  }
  return `OfficeCLI could not start (exit code ${result.exitCode}). Reinstall version ${SUPPORTED_VERSION} and retry.`
}

function unavailableInfo(info: OfficecliInfo): OfficecliInfo {
  return {
    ...info,
    manualInstall: OFFICECLI_MANUAL_INSTALL_GUIDANCE,
    existingTerminalNotice: OFFICECLI_EXISTING_TERMINAL_NOTICE,
  }
}

async function defaultRun(binary: string, args: readonly string[], signal?: AbortSignal): Promise<CommandResult> {
  try {
    const result = await execa(binary, args, {
      timeout: PROBE_TIMEOUT_MS,
      reject: false,
      windowsHide: true,
      cancelSignal: signal,
    })
    return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = error as { exitCode?: number; stdout?: string; stderr?: string; timedOut?: boolean }
    return {
      exitCode: failure.exitCode ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      timedOut: failure.timedOut,
    }
  }
}

const defaultDependencies: OfficecliManagerDependencies = {
  env: process.env,
  platform: process.platform,
  homeDir: homedir(),
  isRegularFile: async path => (await stat(path)).isFile(),
  run: defaultRun,
}

export class OfficecliManager {
  private verifiedBinary?: ResolvedBinary
  private managedBinaryPath?: string

  constructor(private readonly deps: OfficecliManagerDependencies = defaultDependencies) {}

  configureManagedBinaryPath(path: string | undefined): void {
    this.managedBinaryPath = path
    this.verifiedBinary = undefined
  }

  async resolveBinary(): Promise<ResolvedBinary | undefined> {
    if (!this.verifiedBinary) await this.detect()
    return this.verifiedBinary
  }

  private async findCandidate(): Promise<ResolvedBinary | undefined> {
    if (this.managedBinaryPath && await this.isRegularAbsoluteFile(this.managedBinaryPath)) {
      return { path: resolve(this.managedBinaryPath), source: 'managed' }
    }
    const names = defaultBinaryNames(this.deps.platform)
    const pathValue = Object.entries(this.deps.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? ''
    const pathCandidates = pathValue
      .split(delimiter)
      .filter(Boolean)
      .flatMap(directory => names.map(name => resolve(directory, name)))

    for (const candidate of pathCandidates) {
      if (await this.isRegularAbsoluteFile(candidate)) return { path: candidate, source: 'path' }
    }
    for (const candidate of knownLocations(this.deps)) {
      if (await this.isRegularAbsoluteFile(candidate)) return { path: resolve(candidate), source: 'known-location' }
    }
    return undefined
  }

  async verifyCapabilities(binary: string, signal?: AbortSignal): Promise<boolean> {
    if (!(await this.isRegularAbsoluteFile(binary))) return false
    for (const capability of REQUIRED_CAPABILITIES) {
      signal?.throwIfAborted()
      const result = await this.deps.run(binary, [capability, '--help'], signal)
      if (result.exitCode !== 0) return false
    }
    return true
  }

  async verifyManagedBinary(binary: string, signal?: AbortSignal): Promise<boolean> {
    if (!(await this.isRegularAbsoluteFile(binary))) return false
    signal?.throwIfAborted()
    const result = await this.deps.run(binary, ['--version'], signal)
    return result.exitCode === 0 && parseVersion(`${result.stdout}\n${result.stderr}`) === SUPPORTED_VERSION &&
      this.verifyCapabilities(binary, signal)
  }

  async detect(): Promise<OfficecliInfo> {
    this.verifiedBinary = undefined
    const resolvedBinary = await this.findCandidate()
    if (!resolvedBinary) return unavailableInfo({ installed: false, compatible: false })

    const versionResult = await this.deps.run(resolvedBinary.path, ['--version'])
    if (versionResult.exitCode !== 0) {
      return unavailableInfo({
        installed: true,
        compatible: false,
        source: resolvedBinary.source,
        runtimeError: boundedRuntimeDiagnostic(versionResult),
      })
    }

    const version = parseVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
    if (version !== SUPPORTED_VERSION || !(await this.verifyCapabilities(resolvedBinary.path))) {
      return unavailableInfo({ installed: true, compatible: false, version, source: resolvedBinary.source })
    }

    this.verifiedBinary = resolvedBinary
    return {
      installed: true,
      compatible: true,
      version,
      path: resolvedBinary.path,
      source: resolvedBinary.source,
    }
  }

  resolveAgentPathDir(): string | undefined {
    return this.verifiedBinary ? dirname(this.verifiedBinary.path) : undefined
  }

  async refreshAgentPathDir(): Promise<string | undefined> {
    try {
      await this.detect()
      return this.resolveAgentPathDir()
    } catch {
      this.verifiedBinary = undefined
      return undefined
    }
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

export const officecliManager = new OfficecliManager()

export async function initializeOfficecliProvider(
  manager: Pick<OfficecliManager, 'detect'> = officecliManager,
): Promise<void> {
  await manager.detect()
}
