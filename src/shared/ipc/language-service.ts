export const LANGUAGE_SERVICE_CHANNELS = {
  definition: 'language-service:definition',
} as const

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

export interface LanguageServiceAPI {
  definition(request: DefinitionRequest): Promise<DefinitionResult>
}
