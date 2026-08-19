export const LANGUAGE_SERVICE_CHANNELS = {
  definition: 'language-service:definition',
  installerStatus: 'language-service:installer:status',
  installerStart: 'language-service:installer:start',
  installerCancel: 'language-service:installer:cancel',
  installerRemove: 'language-service:installer:remove',
} as const

export const LANGUAGE_SERVICE_EVENT_CHANNELS = {
  installerProgress: 'language-service:installer:progress',
} as const

export type LanguageServiceId = 'clangd'

export type NativeSourceLanguage = 'c' | 'cpp'

export interface DefinitionRequest {
  workspacePath: string
  filePath: string
  language: NativeSourceLanguage
  content: string
  position: {
    line: number
    character: number
  }
}

export interface DefinitionLocation {
  absolutePath: string
  selection: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
}

export type LanguageServiceErrorCode =
  | 'clangd-not-found'
  | 'invalid-request'
  | 'outside-workspace'
  | 'timeout'
  | 'server-error'

export interface DefinitionResult {
  target: DefinitionLocation | null
  error?: {
    code: LanguageServiceErrorCode
    message: string
  }
}

export interface LanguageServiceInstallArtifact {
  version: string
  arch: 'x64' | 'arm64'
  platform: 'win32' | 'darwin' | 'linux'
  fileName: string
  url: string
  sha256: string
}

export interface LanguageServiceDescriptor {
  id: LanguageServiceId
  displayName: string
  languages: readonly NativeSourceLanguage[]
  binaryNames: readonly string[]
  knownLocations: readonly string[]
  spawnArgs: readonly string[]
  resolveArtifact(platform: NodeJS.Platform, arch: string): LanguageServiceInstallArtifact
  verifyBinary(binary: string, signal?: AbortSignal): Promise<boolean>
}

export type LanguageServiceInstallerStage =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'complete'
  | 'failed'

export interface LanguageServiceInstallerProgressEvent {
  serviceId: LanguageServiceId
  stage: LanguageServiceInstallerStage
  percent?: number
  message?: string
}

export interface LanguageServiceManagedInstallStatus {
  serviceId: LanguageServiceId
  state: 'not-installed' | 'ready' | 'busy' | 'failed'
  version?: string
  sha256?: string
  source?: string
  location: string
  error?: string
}

export interface LanguageServiceInstallerStartRequest {
  serviceId: LanguageServiceId
  confirmed: true
  repair?: boolean
}

export interface LanguageServiceInstallerRemoveRequest {
  serviceId: LanguageServiceId
  confirmed: true
}

export interface LanguageServiceInstallerStatusRequest {
  serviceId: LanguageServiceId
}

export interface LanguageServiceInstallerAPI {
  status(request: LanguageServiceInstallerStatusRequest): Promise<LanguageServiceManagedInstallStatus>
  start(request: LanguageServiceInstallerStartRequest): Promise<LanguageServiceManagedInstallStatus>
  cancel(request: LanguageServiceInstallerStatusRequest): Promise<LanguageServiceManagedInstallStatus>
  remove(request: LanguageServiceInstallerRemoveRequest): Promise<LanguageServiceManagedInstallStatus>
  onInstallerProgress(listener: (event: LanguageServiceInstallerProgressEvent) => void): () => void
}

export interface LanguageServiceAPI {
  definition(request: DefinitionRequest): Promise<DefinitionResult>
  installer: LanguageServiceInstallerAPI
}