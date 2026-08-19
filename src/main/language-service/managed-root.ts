import { isAbsolute, join, resolve } from 'path'

const JANUSX_WINDOWS_USER_DATA_NAME = 'JanusX'
const LANGUAGE_SERVICE_MANAGED_ROOT_SEGMENTS = ['janusx', 'language-services'] as const

export function resolveLanguageServiceManagedRoot(options: {
  userDataDir?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}): string {
  const platform = options.platform ?? process.platform
  const userDataDir = options.userDataDir ?? (() => {
    if (platform !== 'win32') throw new Error(`Managed language service is unsupported on ${platform}`)
    const appData = options.env?.APPDATA
    if (!appData || !isAbsolute(appData)) throw new Error('APPDATA is required to locate the JanusX managed language service')
    return join(appData, JANUSX_WINDOWS_USER_DATA_NAME)
  })()
  if (!isAbsolute(userDataDir)) throw new Error('JanusX user-data path must be absolute')
  return resolve(userDataDir, ...LANGUAGE_SERVICE_MANAGED_ROOT_SEGMENTS)
}

export function resolveServiceManagedRoot(baseRoot: string, serviceId: string): string {
  if (!isAbsolute(baseRoot)) throw new Error('Managed base root must be absolute')
  return resolve(baseRoot, serviceId)
}