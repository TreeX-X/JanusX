import type { StructuredCloneValue } from '../knowledge'

export type BlueprintNodeType = 'epic' | 'feature' | 'task' | 'issue'

export type BlueprintNodeStatus =
  | 'not-started'
  | 'planning'
  | 'in-progress'
  | 'testing'
  | 'bug-fixing'
  | 'blocked'
  | 'paused'
  | 'done'
  | 'archived'

export type BlueprintStatusSource = 'manual' | 'janus'

export interface WorkspaceSnapshot {
  name: string
  path: string
}

export type AnalysisTrigger =
  | 'commit-threshold'
  | 'manual'
  | 'terminal-close'
  | 'reconcile'

export interface BlueprintTodo {
  id: string
  text: string
  done: boolean
  createdAt: string
}

export type BlueprintFeatureStatus = 'planned' | 'in-progress' | 'done' | 'blocked'

export interface BlueprintFeatureItem {
  id: string
  title: string
  description: string
  progress: number
  status: BlueprintFeatureStatus
  requirementNotes: string[]
  createdAt: string
  updatedAt: string
}

export type BlueprintIssueSeverity = 'low' | 'medium' | 'high' | 'critical'
export type BlueprintIssueStatus = 'open' | 'resolved' | 'wontfix'

export interface BlueprintIssue {
  id: string
  title: string
  description: string
  severity: BlueprintIssueSeverity
  status: BlueprintIssueStatus
  createdAt: string
  resolvedAt?: string
}

export type BlueprintActivityType =
  | 'terminal-start'
  | 'file-change'
  | 'commit'
  | 'output'
  | 'analysis'
  | 'note'
  | 'status-change'

export interface BlueprintActivity {
  id: string
  type: BlueprintActivityType
  content: string
  metadata?: Record<string, StructuredCloneValue>
  createdAt: string
}

export interface DiscoveredRequirement {
  title: string
  description: string
  suggestedParent: string
  confidence: number
}

export type BlueprintRequirementCandidateStatus = 'pending' | 'accepted' | 'rejected'

export interface BlueprintRequirementCandidate {
  id: string
  blueprintId: string
  sourceNodeId: string
  sourceAnalysisId: string
  title: string
  description: string
  suggestedParentId?: string
  suggestedParentTitle?: string
  confidence: number
  status: BlueprintRequirementCandidateStatus
  acceptedNodeId?: string
  decisionNote?: string
  evidence: string[]
  createdAt: string
  decidedAt?: string
}

export interface AnalysisResult {
  schemaVersion: number
  progress: number
  status: BlueprintNodeStatus
  summary: string
  confidence: number
  evidence: string[]
  unresolved: string[]
  discoveredRequirements: DiscoveredRequirement[]
  featureUpdates: Array<{
    featureId: string
    progress?: number
    status?: BlueprintFeatureStatus
    description?: string
    requirementNotes?: string[]
  }>
  newFeatureRequirements: DiscoveredRequirement[]
}

export interface AnalysisInputSummary {
  blueprint: string
  actual: string
}

export interface BlueprintAnalysis {
  id: string
  nodeId: string
  trigger: AnalysisTrigger
  inputSummary: AnalysisInputSummary
  result: AnalysisResult
  applied: boolean
  error?: string
  createdAt: string
}

export interface BlueprintNode {
  id: string
  title: string
  type: BlueprintNodeType
  status: BlueprintNodeStatus
  progress: number
  statusSource: BlueprintStatusSource
  positioning: string
  description: string
  features: BlueprintFeatureItem[]
  completedItems: string[]
  techSolution: string
  notes: string
  todos: BlueprintTodo[]
  issues: BlueprintIssue[]
  activities: BlueprintActivity[]
  analyses: BlueprintAnalysis[]
  workspaceId: string | null
  workspaceSnapshot: WorkspaceSnapshot | null
  boundTerminalId: string | null
  terminalHistory: string[]
  lastAnalyzedCommitSha: string | null
  children: string[]
  parentId: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Blueprint {
  /** Persisted schema version; absent means the legacy v0 shape. */
  schemaVersion?: number
  id: string
  name: string
  description: string
  rootNodeId: string
  nodeIds: string[]
  nodes: Record<string, BlueprintNode>
  requirementCandidates: BlueprintRequirementCandidate[]
  mountedTo: string | null
  canvasLayout: Record<string, { x: number; y: number }>
  createdAt: string
  updatedAt: string
}

export const ANALYSIS_SCHEMA_VERSION = 1
