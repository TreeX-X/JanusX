export interface Workspace {
  id: string
  name: string
  path: string
  clis: CLIConfig[]
  layout: LayoutConfig
  lastTerminalType?: TerminalPreset
  createdAt: string
  updatedAt: string
}

export interface CLIConfig {
  id: string
  type: string
  command: string
  args: string[]
  env: Record<string, string>
}

export interface LayoutConfig {
  mode: 'grid' | 'tabs'
  positions: LayoutPosition[]
}

export interface LayoutPosition {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export type TerminalPreset = 'shell' | 'claude' | 'codex' | 'opencode'

export interface Terminal {
  id: string
  workspaceId: string
  name: string
  preset: TerminalPreset
  cwd: string
  shell: string
  autoCommand?: string
  pid: number | null
  status: 'idle' | 'running' | 'exited'
  updatedAt?: number
  telemetryStartedAt?: number
  exitCode?: number
  detectedModel?: string
  inputTokens?: number
  outputTokens?: number
  contextTokens?: number
  contextWindowTokens?: number
}

export type AppLoadState = 'no-workspace' | 'workspace-loaded' | 'no-terminal' | 'terminal-active'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  hasChildren?: boolean
  loaded?: boolean
}

// ── Git types ──

export interface GitBranch {
  name: string
  upstream: string | null
  ahead: number
  behind: number
}

export interface GitFileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | '??' | 'UU'
  staged: boolean
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
}

export interface GitStatus {
  branch: GitBranch
  changes: GitFileChange[]
  clean: boolean
}

// ── File Editor types ──

export type FileViewType = 'code' | 'markdown' | 'html' | 'image' | 'binary'

export interface OpenFile {
  id: string
  name: string
  path: string
  absolutePath: string
  viewType: FileViewType
  content: string
  base64?: string
  mimeType?: string
  size?: number
  mtime?: number
  isDirty: boolean
  isLoading: boolean
  error?: string
}
