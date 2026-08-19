import { homedir } from 'os'
import { join } from 'path'
import { execa } from 'execa'
import type { LanguageServiceDescriptor, LanguageServiceInstallArtifact } from '../../../shared/ipc/language-service'

const CLANGD_VERSION = '19.1.7'
const PROBE_TIMEOUT_MS = 5_000

type ArtifactSpec = Omit<LanguageServiceInstallArtifact, 'version' | 'arch' | 'platform'>

const WINDOWS_ARTIFACTS: Record<'x64' | 'arm64', ArtifactSpec> = {
  x64: {
    fileName: 'clangd-windows-x64.exe',
    url: 'https://github.com/clangd/clangd/releases/download/' + CLANGD_VERSION + '/clangd-windows-' + CLANGD_VERSION + '.zip',
    sha256: '',
  },
  arm64: {
    fileName: 'clangd-windows-arm64.exe',
    url: 'https://github.com/clangd/clangd/releases/download/' + CLANGD_VERSION + '/clangd-windows-' + CLANGD_VERSION + '.zip',
    sha256: '',
  },
}

const DARWIN_ARTIFACTS: Record<'x64' | 'arm64', ArtifactSpec> = {
  x64: {
    fileName: 'clangd-macos-x64',
    url: 'https://github.com/clangd/clangd/releases/download/' + CLANGD_VERSION + '/clangd-macos-' + CLANGD_VERSION + '.zip',
    sha256: '',
  },
  arm64: {
    fileName: 'clangd-macos-arm64',
    url: 'https://github.com/clangd/clangd/releases/download/' + CLANGD_VERSION + '/clangd-macos-' + CLANGD_VERSION + '.zip',
    sha256: '',
  },
}

const LINUX_ARTIFACTS: Record<'x64' | 'arm64', ArtifactSpec> = {
  x64: {
    fileName: 'clangd-linux-x64',
    url: 'https://github.com/clangd/clangd/releases/download/' + CLANGD_VERSION + '/clangd-linux-' + CLANGD_VERSION + '.zip',
    sha256: '',
  },
  arm64: {
    fileName: 'clangd-linux-arm64',
    url: 'https://github.com/clangd/clangd/releases/download/' + CLANGD_VERSION + '/clangd-linux-' + CLANGD_VERSION + '.zip',
    sha256: '',
  },
}

function parseVersion(output: string): string | undefined {
  return output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1]
}

export async function verifyClangdBinary(binary: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const result = await execa(binary, ['--version'], {
      timeout: PROBE_TIMEOUT_MS,
      reject: false,
      windowsHide: true,
      cancelSignal: signal,
    })
    if (result.exitCode !== 0) return false
    const version = parseVersion(result.stdout + '\n' + result.stderr)
    return version === CLANGD_VERSION
  } catch {
    return false
  }
}

export function resolveClangdArtifact(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): LanguageServiceInstallArtifact {
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error('Managed clangd is unsupported on arch ' + arch)
  }
  const platformStr = platform as string
  if (platform === 'win32') return { version: CLANGD_VERSION, arch, platform: 'win32', ...WINDOWS_ARTIFACTS[arch] }
  if (platform === 'darwin') return { version: CLANGD_VERSION, arch, platform: 'darwin', ...DARWIN_ARTIFACTS[arch] }
  if (platform === 'linux') return { version: CLANGD_VERSION, arch, platform: 'linux', ...LINUX_ARTIFACTS[arch] }
  throw new Error('Managed clangd is unsupported on ' + platformStr + '/' + arch)
}

function knownLocations(): string[] {
  const home = homedir()
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    return localAppData ? [join(localAppData, 'llvm', 'bin', 'clangd.exe')] : []
  }
  return ['/usr/local/bin/clangd', '/usr/bin/clangd', join(home, '.local', 'bin', 'clangd')]
}

export const clangdDescriptor: LanguageServiceDescriptor = {
  id: 'clangd',
  displayName: 'clangd',
  languages: ['c', 'cpp'],
  binaryNames: process.platform === 'win32' ? ['clangd.exe'] : ['clangd'],
  knownLocations: knownLocations(),
  spawnArgs: ['--background-index', '--header-insertion=never', '--log=error'],
  resolveArtifact: resolveClangdArtifact,
  verifyBinary: verifyClangdBinary,
}