export type {
  AppLoadState,
  CLIConfig,
  FileNode,
  LayoutConfig,
  LayoutPosition,
  TerminalPreset,
  Workspace,
} from '../../../shared/ipc/workspace'

import type { TerminalPreset } from '../../../shared/ipc/workspace'
import type { TerminalStatus } from '../../../shared/ipc/terminal'

export type { TerminalStatus }

export interface Terminal {
  id: string
  workspaceId: string
  name: string
  preset: TerminalPreset
  cwd: string
  shell: string
  autoCommand?: string
  pid: number | null
  status: TerminalStatus
  updatedAt?: number
  telemetryStartedAt?: number
  exitCode?: number
  errorMessage?: string
  detectedModel?: string
  inputTokens?: number
  outputTokens?: number
  contextTokens?: number
  contextWindowTokens?: number
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
