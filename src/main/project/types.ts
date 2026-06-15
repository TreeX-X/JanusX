/**
 * src/main/project/types.ts
 * 项目配置系统的核心类型定义
 */

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

/**
 * .janusX/janusX.launch.json 根配置
 */
export interface LaunchConfig {
  version: string // "0.1.0"
  projectType: ProjectType
  projectName: string
  configurations: LaunchConfiguration[]
  metadata?: {
    lastModified: string
    autoDetected: boolean
  }
}

/**
 * 单个启动配置
 */
export interface LaunchConfiguration {
  name: string // "dev", "prod", etc.
  type: ProjectType
  request: 'launch' | 'attach'
  program?: string // 程序路径
  args?: string[] // 程序参数
  env?: Record<string, string> // 环境变量
  cwd?: string // 工作目录
  preBuildTask?: string // 预构建任务
  preLaunchTask?: string // 预启动任务
  postLaunchTask?: string // 启动后任务
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
  confidence: number // 0-1
  detectedFeatures: string[] // 检测到的特征文件
  recommendedConfig: LaunchConfiguration
  packageManager?: string // 对于 Node.js
  pythonVersion?: string // 对于 Python
  compiler?: string // 对于 C++
}

// ════════════════════════════════════════════════════════════
// 项目 Schema（用于 UI 生成）
// ════════════════════════════════════════════════════════════

export interface ProjectTypeSchema {
  type: ProjectType
  displayName: string
  description: string
  icon: string
  featureFiles: string[] // 检测特征文件
  defaultCommand: string
  fields: SchemaField[] // 配置字段
}

export interface SchemaField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'array' | 'object'
  required?: boolean
  defaultValue?: any
  placeholder?: string
  description?: string
  options?: Array<{ label: string; value: any }> // 用于 select/multiselect
  help?: string
  validation?: FieldValidator
}

export interface FieldValidator {
  pattern?: string // 正则表达式
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
  output: string[] // 输出日志
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
  name: string // "gcc", "clang", "msvc"
  version?: string
  path?: string
  isAvailable: boolean
}

export interface CMakeInfo {
  isAvailable: boolean
  version?: string
  supportedGenerators: string[]
}
