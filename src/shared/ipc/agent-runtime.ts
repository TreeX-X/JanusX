export const AGENT_RUNTIME_CHANNELS = {
  createSession: 'agent-runtime:create-session',
  executeTool: 'agent-runtime:execute-tool',
  cancelSession: 'agent-runtime:cancel-session',
  resolveApproval: 'agent-runtime:resolve-approval',
  getSession: 'agent-runtime:get-session',
  executeFunctionCall: 'agent-runtime:execute-function-call',
  executePlannerStep: 'agent-runtime:execute-planner-step',
  event: 'agent-runtime:event',
} as const

export type RuntimeSessionStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'timed-out'
export type RuntimeToolStatus = 'completed' | 'failed' | 'cancelled' | 'timed-out' | 'approval-required'

export interface WorkspaceContext {
  workspaceId: string
  workspaceRoot: string
}

export interface ToolInputSchema {
  type: 'object'
  properties?: Record<string, { type: string; enum?: unknown[] }>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: ToolInputSchema
  approval?: 'none' | 'required'
}

export interface ToolCall {
  toolName: string
  input: Record<string, unknown>
  correlationId?: string
  source?: 'function-calling' | 'planner'
}

export interface ToolResult {
  workspaceId: string
  sessionId: string
  correlationId: string
  toolName: string
  status: RuntimeToolStatus
  startedAt: string
  completedAt: string
  durationMs: number
  summary: string
  output?: unknown
  error?: string
  approvalId?: string
}

export interface AgentSession {
  id: string
  workspace: WorkspaceContext
  status: RuntimeSessionStatus
  createdAt: string
  updatedAt: string
  timeoutMs: number
}

export interface ApprovalRequest {
  id: string
  sessionId: string
  workspaceId: string
  toolName: string
  input: Record<string, unknown>
  createdAt: string
}

export interface ApprovalResult {
  approvalId: string
  approved: boolean
}

export type AgentRuntimeEvent =
  | { type: 'session-created'; session: AgentSession }
  | { type: 'tool-requested'; sessionId: string; correlationId: string; toolName: string }
  | { type: 'approval-requested'; request: ApprovalRequest }
  | { type: 'tool-started'; sessionId: string; correlationId: string; toolName: string; startedAt: string }
  | { type: 'tool-completed'; result: ToolResult }
  | { type: 'tool-failed'; result: ToolResult }
  | { type: 'tool-timed-out'; result: ToolResult }
  | { type: 'tool-cancelled'; result: ToolResult }
  | { type: 'session-ended'; session: AgentSession }

export interface CreateAgentSessionInput { workspaceId: string; workspaceRoot: string; timeoutMs?: number }
export interface ExecuteToolInput { sessionId: string; call: ToolCall }

export interface AgentRuntimeAPI {
  createSession(input: CreateAgentSessionInput): Promise<AgentSession>
  executeTool(input: ExecuteToolInput): Promise<ToolResult>
  cancelSession(sessionId: string): Promise<AgentSession>
  resolveApproval(input: ApprovalResult): Promise<boolean>
  getSession(sessionId: string): Promise<AgentSession | null>
  executeFunctionCall(input: ExecuteToolInput): Promise<ToolResult>
  executePlannerStep(input: ExecuteToolInput): Promise<ToolResult>
  onEvent(callback: (event: AgentRuntimeEvent) => void): () => void
}
