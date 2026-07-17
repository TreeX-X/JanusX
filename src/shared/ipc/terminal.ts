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
} as const

export type TerminalAgentEngine = 'claude' | 'codex' | 'opencode'

export interface TerminalWarmupRequest {
  engines?: TerminalAgentEngine[]
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
}
