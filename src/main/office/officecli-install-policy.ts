export const OFFICECLI_MANAGED_VERSION = '1.0.135'
export const OFFICECLI_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
export const OFFICECLI_DOWNLOAD_TIMEOUT_MS = 60_000

export interface OfficecliInstallArtifact {
  version: string
  arch: 'x64' | 'arm64'
  fileName: string
  url: string
  sha256: string
}

const WINDOWS_ARTIFACTS: Record<'x64' | 'arm64', Omit<OfficecliInstallArtifact, 'version' | 'arch'>> = {
  x64: {
    fileName: 'officecli-win-x64.exe',
    url: 'https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.135/officecli-win-x64.exe',
    sha256: '937db176b585e874aa5bff48d536bce78037665cd862b5deefe56e79977e6588',
  },
  arm64: {
    fileName: 'officecli-win-arm64.exe',
    url: 'https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.135/officecli-win-arm64.exe',
    sha256: 'c818013023f83d3c9ec3dcba4dabaf824bdf861da6fa925d0557f508d3b11558',
  },
}

export function resolveOfficecliInstallArtifact(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): OfficecliInstallArtifact {
  if (platform !== 'win32' || (arch !== 'x64' && arch !== 'arm64')) {
    throw new Error(`Managed OfficeCLI is unsupported on ${platform}/${arch}`)
  }
  return { version: OFFICECLI_MANAGED_VERSION, arch, ...WINDOWS_ARTIFACTS[arch] }
}
