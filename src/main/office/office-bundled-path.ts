// Note: OfficeCLI is a bundled asset, not a managed download — see .agents/notes/2026-09-18-officecli-bundled--02b7c101.md
import { isAbsolute, join } from 'path'

export const OFFICECLI_BUNDLED_VERSION = '1.0.135'

const OFFICECLI_BUNDLED_SHA256: Record<'x64' | 'arm64', string> = {
  x64: '937db176b585e874aa5bff48d536bce78037665cd862b5deefe56e79977e6588',
  arm64: 'c818013023f83d3c9ec3dcba4dabaf824bdf861da6fa925d0557f508d3b11558',
}

export function expectedBundledOfficecliSha256(arch: string = process.arch): string {
  if (arch !== 'x64' && arch !== 'arm64') throw new Error(`Bundled OfficeCLI is unsupported on ${process.platform}/${arch}`)
  return OFFICECLI_BUNDLED_SHA256[arch]
}

export function resolveBundledOfficecliBinary(options: {
  resourcesPath?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
} = {}): string | undefined {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return undefined
  const override = options.env?.JANUSX_OFFICECLI_BINARY ?? process.env.JANUSX_OFFICECLI_BINARY
  if (override && isAbsolute(override)) return override
  const resourcesPath = options.resourcesPath
  if (!resourcesPath || !isAbsolute(resourcesPath)) return undefined
  return join(resourcesPath, 'officecli', 'officecli.exe')
}
