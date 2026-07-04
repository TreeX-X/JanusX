import type { SubAgentRunRole, SubAgentRunSource } from '../../shared/subAgentRun'

export type AgentEngine = 'claude' | 'codex' | 'opencode'

export type AgentEvent =
  | { type: 'text-delta'; delta: string; fullText: string }
  | { type: 'text-chunk'; text: string }
  | { type: 'tool-start'; id: string; name: string; arg: string; filePath?: string }
  | { type: 'tool-end'; id: string }
  | { type: 'phase'; phase: 'thinking' | 'tool' | 'command'; label?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; exitCode?: number }

export interface StreamParser {
  parseLine(json: Record<string, unknown>): AgentEvent[]
  reset(): void
}

export interface StreamSession {
  id: string
  engine: AgentEngine
  process: import('child_process').ChildProcess
  parser: StreamParser
  abortController: AbortController
  timeout: ReturnType<typeof setTimeout> | null
  startedAt: string
  status: 'running' | 'done' | 'error' | 'cancelled'
}

export interface AgentSpawnOptions {
  engine: AgentEngine
  prompt: string
  cwd: string
  model?: string
  timeoutMs?: number
  title?: string
  role?: SubAgentRunRole
  source?: SubAgentRunSource
  parentRunId?: string
  terminalId?: string
  rootRunId?: string
  rootTerminalId?: string
  missionId?: string
  nodeId?: string
  workspaceId?: string
  workspacePath?: string
}
