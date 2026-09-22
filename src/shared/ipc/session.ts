// Note: transcript detail reads plus provider resume commands back the
// windowed session reading — see
// .agents/notes/implemented/feature/2026-09-22-session-resume-detail.md
export const SESSION_CHANNELS = {
  list: 'session:list',
  get: 'session:get',
  continue: 'session:continue',
  event: 'session:event',
  scanExternal: 'session:scan-external',
  getTranscript: 'session:get-transcript',
  saveLayout: 'session:save-layout',
  getLayout: 'session:get-layout',
  clearLayout: 'session:clear-layout',
} as const

export type AgentSessionStatus = 'active' | 'done' | 'failed' | 'interrupted'
export type AgentSessionTurnKind = 'done' | 'failed' | 'interrupted'

export interface SessionTurnRecord {
  id: string
  kind: AgentSessionTurnKind
  checkpointId?: string
  startedAt: string
  endedAt: string
  /** Question snapshot taken at turn end; survives checkpoint prune. */
  prompt?: string
  /** Answer excerpt parsed from the provider transcript tail; capped. */
  excerpt?: string
}

export interface AgentSessionSummary {
  id: string
  workspaceId: string
  engine: string
  cwd: string
  branch?: string
  firstPrompt: string
  turnCount: number
  checkpointCount: number
  status: AgentSessionStatus
  providerSessionId?: string
  transcriptPath?: string
  continuedFrom?: string
  createdAt: string
  updatedAt: string
  archived: boolean
  /** Imported from a provider transcript store; no live JanusX terminal. */
  external?: boolean
}

export interface AgentSessionDetail extends AgentSessionSummary {
  terminalIds: string[]
  turns: SessionTurnRecord[]
  pendingHandoff?: string
}

export interface SessionFilter {
  workspaceId?: string
  cwd?: string
  engine?: string
  includeArchived?: boolean
}

export interface SessionContinueInput {
  sessionId: string
  engine?: string
}

export interface SessionContinueResult {
  sessionId: string
  terminalId: string
}

export interface SessionHandoff {
  title: string
  progress: string
  transcriptPath?: string
  checkpointRef?: string
  cwd: string
  engine: string
}

/** One question-plus-answer pair parsed from a provider transcript file. */
export interface TranscriptTurn {
  prompt?: string
  excerpt?: string
}

/** Bounded full-prose read of a session transcript; excerpt-first fallback when null. */
export interface TranscriptDetail {
  transcriptPath: string
  turns: TranscriptTurn[]
  totalTurns: number
  truncated: boolean
}

/**
 * Provider resume argv tail for external rows (orca parity). Null when the
 * engine has no known resume shape or the provider session id is missing.
 */
export function buildProviderResumeArgs(engine: string, providerSessionId?: string): string[] | null {
  if (!providerSessionId) return null
  if (engine === 'claude') return ['--resume', providerSessionId]
  if (engine === 'codex') return ['resume', providerSessionId]
  if (engine === 'opencode') return ['--session', providerSessionId]
  return null
}

/** Display form of the resume invocation; matches the executed argv tail. */
export function buildProviderResumeCommand(engine: string, providerSessionId?: string): string | null {
  const args = buildProviderResumeArgs(engine, providerSessionId)
  if (!args) return null
  return `${engine} ${args.join(' ')}`
}

export interface SessionAPI {
  list(filter?: SessionFilter): Promise<AgentSessionSummary[]>
  get(sessionId: string): Promise<AgentSessionDetail | null>
  continue(input: SessionContinueInput): Promise<SessionContinueResult>
  onEvent(callback: (payload: { type: string; sessionId?: string }) => void): () => void
  scanExternal(): Promise<ExternalScanSummary>
  getTranscript(sessionId: string): Promise<TranscriptDetail | null>
  saveLayout(layout: ShellRestoreManifest): Promise<{ success: boolean }>
  getLayout(): Promise<ShellRestoreManifest | null>
  clearLayout(): Promise<{ success: boolean }>
}

export interface ExternalScanSummary {
  scanned: number
  imported: number
  updated: number
  skipped: number
}

export interface ShellRestoreTerminal {
  cwd: string
  preset: string
  name: string
}

export interface ShellRestoreWorkspace {
  workspaceId: string
  terminals: ShellRestoreTerminal[]
}

export interface ShellRestoreManifest {
  version: 1
  savedAt: string
  workspaces: ShellRestoreWorkspace[]
}
