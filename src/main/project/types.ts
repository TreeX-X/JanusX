import type { LaunchConfiguration } from '../../shared/ipc/project'

export {
  ProjectType,
  type DetectResult,
  type FieldValidator,
  type JsonValue,
  type LaunchConfig,
  type LaunchConfiguration,
  type ProjectTypeSchema,
  type SchemaField,
  type ValidationError,
  type ValidationResult,
} from '../../shared/ipc/project'

export interface ProcessHandle {
  pid: number
  config: LaunchConfiguration
  startTime: Date
  port?: number
  output: string[]
}

export interface ProcessEvent {
  type: 'start' | 'stdout' | 'stderr' | 'exit' | 'error'
  data: unknown
  timestamp: Date
}

export interface ProjectUIState {
  projectPath: string
  detectedType: import('../../shared/ipc/project').ProjectType
  detectionConfidence: number
  config: import('../../shared/ipc/project').LaunchConfig | null
  isLoading: boolean
  error: string | null
  unsavedChanges: boolean
}

export interface ConfigFormState {
  values: Record<string, unknown>
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
}

export interface CompilerInfo {
  id: string
  name: string
  version?: string
  path?: string
  isAvailable: boolean
}

export interface CMakeInfo {
  isAvailable: boolean
  version?: string
  supportedGenerators: string[]
}
