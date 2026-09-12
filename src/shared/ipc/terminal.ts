import type { RuntimeTelemetrySnapshot } from './system'

export const TERMINAL_INVOKE_CHANNELS = {
  warmup: 'terminal:warmup',
  create: 'terminal:create',
  replay: 'terminal:replay',
  kill: 'terminal:kill',
} as const

export const TERMINAL_SEND_CHANNELS = {
  input: 'terminal:input',
  resize: 'terminal:resize',
  submitLine: 'terminal:submit-line',
} as const

export const TERMINAL_EVENT_CHANNELS = {
  data: 'terminal:data',
  exit: 'terminal:exit',
  focus: 'terminal:focus',
  created: 'terminal:created',
  status: 'terminal:status',
  telemetry: 'terminal:telemetry',
} as const

export type TerminalAgentEngine = 'claude' | 'codex' | 'opencode' | 'janus'

// Note: six internal states route hooks and sort order; approval and input share one attention visual — see .agents/notes/implemented/feature/2026-09-12-terminal-status-display.md
// Sidebar display status of a terminal entry.
// - wait: idle / no active output stream (AI CLI back at prompt, or shell always)
// - running: AI CLI turn open (UserPromptSubmit / session busy until Stop / session idle)
// - needs-input: CLI waits for an option/question answer (Claude idle_prompt notification)
// - needs-approval: CLI waits for a permission grant (PermissionRequest / permission.asked / permission_prompt)
// - degraded: turn failed but pty alive (429/5xx, session.error, StopFailure); retry without recreating
// - error: pty exited non-zero; entry retained in the list
export type TerminalStatus = 'wait' | 'running' | 'needs-input' | 'needs-approval' | 'degraded' | 'error'

export interface TerminalWarmupRequest {
  engines?: Array<TerminalAgentEngine | 'janus' | 'pi'>
}

export interface TerminalCreateRequest {
  id: string
  workspaceId?: string
  cwd: string
  shell: string
  preset?: string
  command?: string
  args?: string[]
  autoCommand?: string
  cols?: number
  rows?: number
}

export interface TerminalCreateResult {
  pid: number
}

export interface TerminalInputPayload {
  id: string
  data: string
}

export interface TerminalResizePayload {
  id: string
  cols: number
  rows: number
}

export interface TerminalSubmitLinePayload {
  id: string
  text: string
}

export interface TerminalDataEvent {
  id: string
  data: string
  seq?: number
}

export interface TerminalExitEvent {
  id: string
  exitCode: number
}

export interface TerminalFocusEvent {
  id: string
}
export interface TerminalCreatedEvent {
  id: string
  workspaceId: string
  cwd: string
  preset: TerminalAgentEngine | 'janus' | 'pi'
  shell: string
  pid: number
}

export interface TerminalStatusEvent {
  id: string
  status: TerminalStatus
}

export interface TerminalTelemetryEvent {
  id: string
  telemetry: RuntimeTelemetrySnapshot
}

export interface TerminalReplayResult {
  data: string
  seq: number
}

export interface TerminalAPI {
  warmup(request?: TerminalWarmupRequest): Promise<{ ok: true }>
  create(request: TerminalCreateRequest): Promise<TerminalCreateResult>
  replay(id: string): Promise<TerminalReplayResult>
  kill(id: string): Promise<{ success: true }>
  input(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  submitLine(id: string, text: string): void
  onData(callback: (event: TerminalDataEvent) => void): () => void
  onExit(callback: (event: TerminalExitEvent) => void): () => void
  onFocus(callback: (event: TerminalFocusEvent) => void): () => void
  onCreated(callback: (event: TerminalCreatedEvent) => void): () => void
  onStatus(callback: (event: TerminalStatusEvent) => void): () => void
  onTelemetry(callback: (event: TerminalTelemetryEvent) => void): () => void
}
