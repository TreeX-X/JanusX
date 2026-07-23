export const AGENT_RUNTIME_CHANNELS = {
  createSession: 'agent-runtime:create-session',
  executeTool: 'agent-runtime:execute-tool',
  cancelSession: 'agent-runtime:cancel-session',
  resolveApproval: 'agent-runtime:resolve-approval',
  getSession: 'agent-runtime:get-session',
  queryPolicyAudit: 'agent-runtime:query-policy-audit',
  executeFunctionCall: 'agent-runtime:execute-function-call',
  executePlannerStep: 'agent-runtime:execute-planner-step',
  event: 'agent-runtime:event',
} as const

export type RuntimeSessionStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'timed-out'
export type RuntimeToolStatus = 'completed' | 'failed' | 'cancelled' | 'timed-out' | 'approval-required'
export type EvidenceConfidence = 'unknown' | 'low' | 'medium' | 'high'
export type ActionRisk =
  | 'inspect'
  | 'list'
  | 'stat'
  | 'read'
  | 'write'
  | 'create'
  | 'config-apply'
  | 'run'
  | 'restore'
  | 'delete'
  | 'external-command'
  | 'network'
export type ApprovalPolicy = 'none' | 'per-action'
export type ApprovalDecision = 'not-required' | 'pending' | 'approved' | 'denied' | 'cancelled' | 'timed-out'
export type PolicyOutcome = 'allow' | 'deny' | 'approval-required'
export type PolicyReasonCode =
  | 'READ_ALLOWED'
  | 'READ_ONLY_ALLOWED'
  | 'ACTION_REQUIRES_APPROVAL'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_DENIED'
  | 'APPROVAL_CANCELLED'
  | 'APPROVAL_TIMED_OUT'
  | 'SENSITIVE_PATH'
  | 'ABSOLUTE_PATH'
  | 'PATH_TRAVERSAL'
  | 'OUTSIDE_WORKSPACE'
  | 'TARGET_CHANGED'
  | 'WORKSPACE_UNAVAILABLE'
  | 'TARGET_UNAVAILABLE'
  | 'TARGET_NOT_REGULAR'

export interface PolicyDecision {
  outcome: PolicyOutcome
  evidenceConfidence: EvidenceConfidence
  actionRisk: ActionRisk
  approvalPolicy: ApprovalPolicy
  approvalDecision: ApprovalDecision
  reasonCode: PolicyReasonCode
}

export interface PolicyDecisionRecord extends PolicyDecision {
  id: string
  workspaceId: string
  sessionId: string
  correlationId: string
  toolName: string
  createdAt: string
  input?: Record<string, unknown>
  provenance?: 'agent-runtime' | 'manual-user'
}

export interface ApprovalPreview {
  summary: string
  paths: string[]
  detail?: string
  truncated: boolean
}

export interface PolicyAuditQuery {
  workspaceId?: string
  sessionId?: string
  correlationId?: string
}

export interface WorkspaceContext {
  workspaceId: string
  workspaceRoot: string
}

export type ToolInputPropertyType = 'string' | 'number' | 'boolean' | 'array' | 'object'

export interface ToolInputSchema {
  type: 'object'
  properties?: Record<string, { type: ToolInputPropertyType; enum?: unknown[] }>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: ToolInputSchema
  actionRisk: ActionRisk
}

export interface ToolCall {
  toolName: string
  input: Record<string, unknown>
  correlationId?: string
  source?: 'function-calling' | 'planner'
  evidenceConfidence?: EvidenceConfidence
  preview?: ApprovalPreview
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
  reasonCode?: string
  policyDecision?: PolicyDecisionRecord
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
  correlationId: string
  evidenceConfidence: EvidenceConfidence
  actionRisk: ActionRisk
  approvalPolicy: 'per-action'
  reasonCode: 'ACTION_REQUIRES_APPROVAL'
  preview?: ApprovalPreview
  createdAt: string
}

export interface ApprovalResult {
  approvalId: string
  approved: boolean
  workspaceId: string
  sessionId: string
  correlationId: string
  toolName: string
  actionRisk: ActionRisk
}

export type AgentRuntimeEvent =
  | { type: 'session-created'; session: AgentSession }
  | { type: 'tool-requested'; sessionId: string; correlationId: string; toolName: string }
  | { type: 'policy-decided'; decision: PolicyDecisionRecord }
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
  queryPolicyAudit(query?: PolicyAuditQuery): Promise<PolicyDecisionRecord[]>
  getSession(sessionId: string): Promise<AgentSession | null>
  executeFunctionCall(input: ExecuteToolInput): Promise<ToolResult>
  executePlannerStep(input: ExecuteToolInput): Promise<ToolResult>
  onEvent(callback: (event: AgentRuntimeEvent) => void): () => void
}
