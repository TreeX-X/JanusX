import { isAbsolute, join, resolve } from 'path'

const JANUSX_WINDOWS_USER_DATA_NAME = 'JanusX'
const OFFICE_MANAGED_ROOT_SEGMENTS = ['janusx', 'officecli'] as const

export function resolveOfficecliManagedRoot(options: {
  userDataDir?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}): string {
  const platform = options.platform ?? process.platform
  const userDataDir = options.userDataDir ?? (() => {
    if (platform !== 'win32') throw new Error(`Managed OfficeCLI is unsupported on ${platform}`)
    const appData = options.env?.APPDATA
    if (!appData || !isAbsolute(appData)) throw new Error('APPDATA is required to locate the JanusX managed OfficeCLI')
    return join(appData, JANUSX_WINDOWS_USER_DATA_NAME)
  })()
  if (!isAbsolute(userDataDir)) throw new Error('JanusX user-data path must be absolute')
  return resolve(userDataDir, ...OFFICE_MANAGED_ROOT_SEGMENTS)
}
