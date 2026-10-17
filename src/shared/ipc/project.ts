export const PROJECT_CHANNELS = {
  detect: 'project:detect',
  detectWithDetails: 'project:detect-with-details',
  readConfig: 'project:config:read',
  writeConfig: 'project:config:write',
  createDefaultConfig: 'project:config:create-default',
  validateConfig: 'project:config:validate',
  test: 'project:test',
  run: 'project:run',
  stop: 'project:stop',
  list: 'project:list',
  get: 'project:get',
  schemas: 'project:schemas',
} as const

export enum ProjectType {
  NextJs = 'nextjs',
  Vite = 'vite',
  ElectronVite = 'electron-vite',
  CreateReactApp = 'cra',
  Remix = 'remix',
  Rust = 'rust',
  Go = 'go',
  CppCMake = 'cpp-cmake',
  CppMake = 'cpp-make',
  Django = 'django',
  Flask = 'flask',
  FastAPI = 'fastapi',
  Laravel = 'laravel',
  Unknown = 'unknown',
  Custom = 'custom',
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface LaunchConfig {
  version: string
  projectType: ProjectType
  projectName: string
  configurations: LaunchConfiguration[]
  metadata?: { lastModified: string; autoDetected: boolean }
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
  nodeVersion?: string
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun'
  script?: string
  port?: number
  cmakePath?: string
  buildDir?: string
  buildType?: 'Debug' | 'Release' | 'RelWithDebInfo' | 'MinSizeRel'
  compiler?: 'auto' | 'gcc' | 'clang' | 'msvc'
  target?: string
  sourceFileMap?: Record<string, string>
  pythonPath?: string
  module?: string
  mainPackage?: string
}

export interface DetectResult {
  type: ProjectType
  confidence: number
  detectedFeatures: string[]
  recommendedConfig: LaunchConfiguration
  packageManager?: string
  pythonVersion?: string
  compiler?: string
  availableScripts?: string[]
}

export interface ProjectTaskResult {
  command: string
  script?: string
  exitCode: number | null
  output: string[]
  durationMs: number
  timedOut: boolean
}

export interface FieldValidator {
  pattern?: string
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
}

export interface SchemaField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'array' | 'object'
  required?: boolean
  defaultValue?: JsonValue
  placeholder?: string
  description?: string
  options?: Array<{ label: string; value: string }>
  help?: string
  validation?: FieldValidator
}

export interface ProjectTypeSchema {
  type: ProjectType
  displayName: string
  description: string
  icon: string
  featureFiles: string[]
  defaultCommand: string
  fields: SchemaField[]
}

export interface ValidationError {
  field: string
  message: string
  suggestion?: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: Array<{ field: string; message: string }>
}

/** 启动时盖章的运行身份：worktree 归属不再靠 id 路径前缀推断。 */
export interface ProjectRunIdentity {
  /** 归属工作区（运行球分组键）。 */
  workspaceId?: string
  /** 启动时的目标作用域（worktree 路径或工作区根）。 */
  scopePath?: string
  /** 目标 worktree 分支，供运行球子芽/面板展示。 */
  branch?: string
}

export interface ProjectRunOptions {
  /** 归属盖章，随 summary 透出供运行球按 worktree 分组。 */
  identity?: ProjectRunIdentity
  /** 目标目录缺少启动配置时的继承来源（主仓模板）；命令仍在 projectPath 执行。 */
  inheritFrom?: string
}

export interface RunningProjectSummary {
  id: string
  pid: number
  type: ProjectType
  name: string
  port?: number
  startTime: string
  uptime: number
  /** 配置名（盖章；缺省时前端从 id 兜底解析）。 */
  configName?: string
  workspaceId?: string
  scopePath?: string
  branch?: string
}

export interface RunningProjectDetail {
  pid: number
  config: LaunchConfiguration
  startTime: string
  port?: number
  output: string[]
}

export interface ProjectRunResult {
  pid: number
  config: LaunchConfiguration
  startTime: string
}

export type ProjectResult<T> = { success: true; data: T } | { success: false; error: string }
export type ProjectCommandResult = { success: true } | { success: false; error: string }

export interface ProjectAPI {
  detect(projectPath: string): Promise<ProjectResult<{ type: ProjectType }>>
  detectWithDetails(projectPath: string): Promise<ProjectResult<DetectResult>>
  readConfig(projectPath: string): Promise<ProjectResult<LaunchConfig | null>>
  writeConfig(projectPath: string, config: LaunchConfig): Promise<ProjectCommandResult>
  createDefaultConfig(projectPath: string, projectType: ProjectType, projectName: string): Promise<ProjectResult<LaunchConfig>>
  validateConfig(config: LaunchConfig): Promise<ProjectResult<ValidationResult>>
  test(projectPath: string, script?: string): Promise<ProjectResult<ProjectTaskResult>>
  run(projectPath: string, configName?: string, options?: ProjectRunOptions): Promise<ProjectResult<ProjectRunResult>>
  stop(projectId: string): Promise<ProjectCommandResult>
  list(): Promise<ProjectResult<RunningProjectSummary[]>>
  get(projectId: string): Promise<ProjectResult<RunningProjectDetail>>
  schemas(): Promise<ProjectResult<ProjectTypeSchema[]>>
}
