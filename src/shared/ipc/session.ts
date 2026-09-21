export const SESSION_CHANNELS = {
  list: 'session:list',
  get: 'session:get',
  continue: 'session:continue',
  event: 'session:event',
} as const

export type AgentSessionStatus = 'active' | 'done' | 'failed' | 'interrupted'
export type AgentSessionTurnKind = 'done' | 'failed' | 'interrupted'

export interface SessionTurnRecord {
  id: string
  kind: AgentSessionTurnKind
  checkpointId?: string
  startedAt: string
  endedAt: string
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

export interface SessionAPI {
  list(filter?: SessionFilter): Promise<AgentSessionSummary[]>
  get(sessionId: string): Promise<AgentSessionDetail | null>
  continue(input: SessionContinueInput): Promise<SessionContinueResult>
  onEvent(callback: (payload: { type: string; sessionId?: string }) => void): () => void
}
