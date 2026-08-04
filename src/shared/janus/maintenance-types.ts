import type { BlueprintNode, BlueprintNodeType } from './types'

export type BlueprintMaintenanceScope =
  | { type: 'node'; nodeId: string }
  | { type: 'subtree'; nodeId: string }
  | { type: 'blueprint' }

export type BlueprintMaintenanceTaskStatus =
  | 'draft'
  | 'analyzing'
  | 'proposal-ready'
  | 'applying'
  | 'active'
  | 'stale'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface BlueprintMaintenanceMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface BlueprintOperationBase {
  operationId: string
  reason: string
  evidenceRefs: string[]
  dependsOn: string[]
  risk: 'low' | 'medium'
}

export interface BlueprintCreateNodeOperation extends BlueprintOperationBase {
  type: 'create-node'
  tempNodeId: string
  parentId: string
  after: {
    title: string
    type: BlueprintNodeType
    description: string
    positioning: string
    techSolution: string
    notes: string
    tags: string[]
  }
}

export interface BlueprintUpdateNodeOperation extends BlueprintOperationBase {
  type: 'update-node'
  nodeId: string
  before: Partial<BlueprintNode>
  after: Partial<Pick<BlueprintNode,
    'title' | 'type' | 'status' | 'progress' | 'positioning' | 'description' |
    'techSolution' | 'notes' | 'tags'>>
}

export interface BlueprintMoveNodeOperation extends BlueprintOperationBase {
  type: 'move-node'
  nodeId: string
  beforeParentId: string | null
  afterParentId: string
}

export type BlueprintOperation =
  | BlueprintCreateNodeOperation
  | BlueprintUpdateNodeOperation
  | BlueprintMoveNodeOperation

export interface BlueprintChangeSet {
  id: string
  taskId: string
  blueprintId: string
  baseRevision: number
  version: number
  status: 'ready' | 'applied' | 'stale'
  reason: string
  operations: BlueprintOperation[]
  createdAt: string
}

export interface BlueprintMaintenanceTask {
  id: string
  blueprintId: string
  blueprintName: string
  baseRevision: number
  workspaceId: string
  workspaceName: string
  workspacePath: string
  nodeScope: BlueprintMaintenanceScope
  goal: string
  status: BlueprintMaintenanceTaskStatus
  progress: number
  phase: string
  messages: BlueprintMaintenanceMessage[]
  changeSet: BlueprintChangeSet | null
  error?: string
  createdAt: string
  updatedAt: string
}

export interface BlueprintMaintenanceStartInput {
  blueprintId: string
  workspaceId: string
  workspaceName: string
  workspacePath: string
  nodeScope: BlueprintMaintenanceScope
  goal: string
  providerId?: string
  modelId?: string
}

export interface BlueprintMaintenanceMessageInput {
  taskId: string
  content: string
  providerId?: string
  modelId?: string
}

export interface BlueprintMaintenanceProposalInput {
  taskId: string
  providerId?: string
  modelId?: string
}

export interface BlueprintMaintenanceApplyInput {
  taskId: string
  changeSetId: string
  operationIds: string[]
}

export interface BlueprintMaintenanceApplyResult {
  task: BlueprintMaintenanceTask
  blueprintRevision: number
  appliedOperationIds: string[]
}

export interface BlueprintMaintenanceAuditRecord {
  id: string
  taskId: string
  changeSetId: string
  blueprintId: string
  beforeRevision: number
  afterRevision: number
  selectedOperationIds: string[]
  rejectedOperationIds: string[]
  status: 'pending' | 'applied'
  beforeSnapshot: unknown
  createdAt: string
  appliedAt?: string
}

export interface BlueprintMaintenanceEvent {
  task: BlueprintMaintenanceTask
}
