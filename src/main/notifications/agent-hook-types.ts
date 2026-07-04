import type { AgentEngine } from '../agent/types'

export type AgentHookSource = AgentEngine

export type AgentHookLifecycle =
  | 'received'
  | 'started'
  | 'completed'
  | 'failed'
  | 'approval'
  | 'attention'
  | 'unmatched'
  | 'native-shown'
  | 'renderer-fallback'
  | 'ignored'

export interface RegisteredHookTerminal {
  terminalId: string
  engine: AgentEngine
  workspaceId?: string
  cwd?: string
}

export interface AgentHookPayload {
  source: AgentHookSource
  event: string
  terminalId?: string
  workspaceId?: string
  sessionId?: string
  cwd?: string
  message?: string
  timestamp?: string
  raw?: unknown
}

export interface AgentHookCoordinatorEvent {
  type: AgentHookLifecycle
  terminalId?: string
  turnId?: string
  engine: AgentEngine
  source: AgentHookSource
  hookEvent: string
  reason?: string
  delivered?: boolean
}

export interface AgentHookCompletion {
  turnId: string
  terminalId: string
  engine: AgentEngine
  source: AgentHookSource
  hookEvent: string
  startedAt?: string
  endedAt: string
  failed: boolean
  message?: string
}
