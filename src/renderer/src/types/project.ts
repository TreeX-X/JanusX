/*-- 镜像 src/main/project/types.ts，需保持同步 --*/

// ════════════════════════════════════════════════════════════
// 项目类型枚举
// ════════════════════════════════════════════════════════════

export enum ProjectType {
  // Node.js 生态
  NextJs = 'nextjs',
  Vite = 'vite',
  ElectronVite = 'electron-vite',
  CreateReactApp = 'cra',
  Remix = 'remix',

  // 编译语言
  Rust = 'rust',
  Go = 'go',
  CppCMake = 'cpp-cmake',
  CppMake = 'cpp-make',

  // 脚本语言
  Django = 'django',
  Flask = 'flask',
  FastAPI = 'fastapi',
  Laravel = 'laravel',

  // 其他
  Unknown = 'unknown',
  Custom = 'custom',
}

// ════════════════════════════════════════════════════════════
// 配置相关类型
// ════════════════════════════════════════════════════════════

export interface LaunchConfig {
  version: string
  projectType: ProjectType
  projectName: string
  configurations: LaunchConfiguration[]
  metadata?: {
    lastModified: string
    autoDetected: boolean
  }
}

export interface LaunchConfiguration {
  name: string
  type: ProjectType
  request: 'launch' | 'attach'
  program?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  preBuildTask?: string
  preLaunchTask?: string
  postLaunchTask?: string
  internalConsoleOptions?: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart'

  // Node.js 特化
  nodeVersion?: string
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun'
  port?: number

  // C++ 特化
  cmakePath?: string
  buildDir?: string
  buildType?: 'Debug' | 'Release' | 'RelWithDebInfo' | 'MinSizeRel'
  compiler?: 'auto' | 'gcc' | 'clang' | 'msvc'
  target?: string
  sourceFileMap?: Record<string, string>

  // Python 特化
  pythonPath?: string
  module?: string

  // Go 特化
  mainPackage?: string
}

// ════════════════════════════════════════════════════════════
// 项目检测结果
// ════════════════════════════════════════════════════════════

export interface DetectResult {
  type: ProjectType
  confidence: number
  detectedFeatures: string[]
  recommendedConfig: LaunchConfiguration
  packageManager?: string
  pythonVersion?: string
  compiler?: string
}

// ════════════════════════════════════════════════════════════
// 项目 Schema（用于 UI 生成）
// ════════════════════════════════════════════════════════════

export interface ProjectTypeSchema {
  type: ProjectType
  displayName: string
  description: string
  icon: string
  featureFiles: string[]
  defaultCommand: string
  fields: SchemaField[]
}

export interface SchemaField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'array' | 'object'
  required?: boolean
  defaultValue?: any
  placeholder?: string
  description?: string
  options?: Array<{ label: string; value: any }>
  help?: string
  validation?: FieldValidator
}

export interface FieldValidator {
  pattern?: string
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  custom?: (value: any) => ValidationError | null
}

export interface ValidationError {
  field: string
  message: string
  suggestion?: string
}

// ════════════════════════════════════════════════════════════
// 进程和运行相关
// ════════════════════════════════════════════════════════════

export interface ProcessHandle {
  pid: number
  config: LaunchConfiguration
  startTime: Date
  port?: number
  output: string[]
}

export interface ProcessEvent {
  type: 'start' | 'stdout' | 'stderr' | 'exit' | 'error'
  data: any
  timestamp: Date
}

// ════════════════════════════════════════════════════════════
// 配置验证结果
// ════════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: Array<{
    field: string
    message: string
  }>
}

// ════════════════════════════════════════════════════════════
// UI 相关
// ════════════════════════════════════════════════════════════

export interface ProjectUIState {
  projectPath: string
  detectedType: ProjectType
  detectionConfidence: number
  config: LaunchConfig | null
  isLoading: boolean
  error: string | null
  unsavedChanges: boolean
}

export interface ConfigFormState {
  values: Record<string, any>
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
}

// ════════════════════════════════════════════════════════════
// 编译器相关（C++）
// ════════════════════════════════════════════════════════════

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
