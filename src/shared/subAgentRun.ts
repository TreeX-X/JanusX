export type SubAgentRunSource = 'terminal' | 'headless' | 'hook' | 'manual' | 'workflowx'

export type SubAgentRunEngine = 'claude' | 'codex' | 'opencode'

export type SubAgentRunRole =
  | 'main'
  | 'coder'
  | 'evaluator'
  | 'abstracter'
  | 'prompter'
  | 'subagent'
  | 'custom'

export type SubAgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting-approval'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface SubAgentRun {
  id: string
  parentRunId?: string
  rootRunId?: string
  terminalId?: string
  rootTerminalId?: string
  missionId?: string
  workspaceId?: string
  workspacePath?: string
  nodeId?: string
  source: SubAgentRunSource
  engine?: SubAgentRunEngine
  role: SubAgentRunRole
  status: SubAgentRunStatus
  title: string
  lastEvent?: string
  startedAt: string
  updatedAt: string
  meta?: Record<string, unknown>
}

export type SubAgentRunCreateInput = Omit<SubAgentRun, 'startedAt' | 'updatedAt'> & {
  startedAt?: string
  updatedAt?: string
}

export type SubAgentRunUpdateInput = Partial<
  Pick<
    SubAgentRun,
    | 'parentRunId'
    | 'rootRunId'
    | 'terminalId'
    | 'rootTerminalId'
    | 'missionId'
    | 'workspaceId'
    | 'workspacePath'
    | 'nodeId'
    | 'source'
    | 'engine'
    | 'role'
    | 'status'
    | 'title'
    | 'lastEvent'
    | 'meta'
  >
>

export interface SubAgentRunUpdatedEvent {
  run: SubAgentRun
}

export interface SubAgentRunRemovedEvent {
  id: string
}
