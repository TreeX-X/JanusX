import type {
  BlueprintNode,
  BlueprintNodeStatus,
  BlueprintNodeType,
  BlueprintNodeWorkspaceBinding,
  BlueprintRelation,
  BlueprintRelationType,
} from './types'

export type BlueprintMaintenanceScope =
  | { type: 'node'; nodeId: string }
  | { type: 'subtree'; nodeId: string }
  | { type: 'blueprint' }

export interface BlueprintEvidenceFile {
  path: string
  sha256: string
  role: 'critical' | 'supporting'
  sourceState: 'committed' | 'staged' | 'unstaged' | 'untracked'
  supportsOperationIds: string[]
}

export interface BlueprintEvidenceManifest {
  workspaceId: string
  workspaceRootFingerprint: string
  gitHead?: string
  files: BlueprintEvidenceFile[]
}

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
  risk: 'low' | 'medium' | 'high'
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

export interface BlueprintAddRelationOperation extends BlueprintOperationBase {
  type: 'add-relation'
  /** Proposal-local id so dependent operations can reference the new relation. */
  tempRelationId: string
  after: {
    sourceNodeId: string
    targetNodeId: string
    relationType: BlueprintRelationType
    description?: string
  }
}

export interface BlueprintUpdateRelationOperation extends BlueprintOperationBase {
  type: 'update-relation'
  relationId: string
  before: Partial<Pick<BlueprintRelation, 'type' | 'description'>>
  after: {
    relationType?: BlueprintRelationType
    description?: string
  }
}

export interface BlueprintRemoveRelationOperation extends BlueprintOperationBase {
  type: 'remove-relation'
  relationId: string
  before?: BlueprintRelation
}

export interface BlueprintUpdateWorkspaceBindingOperation extends BlueprintOperationBase {
  type: 'update-workspace-binding'
  nodeId: string
  before: BlueprintNodeWorkspaceBinding
  after: BlueprintNodeWorkspaceBinding
}

export interface BlueprintArchiveNodeOperation extends BlueprintOperationBase {
  type: 'archive-node'
  nodeId: string
  beforeStatus: BlueprintNodeStatus
}

export interface BlueprintDeleteNodeImpact {
  title: string
  parentId: string | null
  childIds: string[]
  incomingRelationIds: string[]
  outgoingRelationIds: string[]
}

export interface BlueprintDeleteNodeOperation extends BlueprintOperationBase {
  type: 'delete-node'
  nodeId: string
  /** Always forced to 'high'; deletion never joins bulk approval. */
  risk: 'high'
  impact: BlueprintDeleteNodeImpact
}

/**
 * Undo-only operation emitted when reversing an applied delete-node. It is not
 * part of the model proposal schema and is rejected by proposal normalization.
 */
export interface BlueprintRestoreNodeOperation extends BlueprintOperationBase {
  type: 'restore-node'
  nodeId: string
  node: BlueprintNode
  relations: BlueprintRelation[]
}

export type BlueprintOperation =
  | BlueprintCreateNodeOperation
  | BlueprintUpdateNodeOperation
  | BlueprintMoveNodeOperation
  | BlueprintAddRelationOperation
  | BlueprintUpdateRelationOperation
  | BlueprintRemoveRelationOperation
  | BlueprintUpdateWorkspaceBindingOperation
  | BlueprintArchiveNodeOperation
  | BlueprintDeleteNodeOperation
  | BlueprintRestoreNodeOperation

export type BlueprintChangeSetStatus =
  | 'ready'
  | 'applied'
  | 'partially-approved'
  | 'rejected'
  | 'stale'

export interface BlueprintChangeSet {
  id: string
  taskId: string
  blueprintId: string
  baseRevision: number
  version: number
  status: BlueprintChangeSetStatus
  reason: string
  evidence?: BlueprintEvidenceManifest[]
  operations: BlueprintOperation[]
  createdAt: string
  /** Marks reverse ChangeSets generated from an audit record. */
  undoOfAuditId?: string
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
  changeSetHistory: BlueprintChangeSet[]
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
  /**
   * Every selected delete-node operation must appear here. The main process
   * rejects the apply otherwise — bulk approval never covers deletions.
   */
  confirmedDeleteOperationIds?: string[]
}

export interface BlueprintMaintenanceApplyResult {
  task: BlueprintMaintenanceTask
  blueprintRevision: number
  appliedOperationIds: string[]
}

export interface BlueprintMaintenanceAuditListInput {
  blueprintId: string
  taskId?: string
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
  /** Delete operations the user individually confirmed at apply time. */
  confirmedDeleteOperationIds?: string[]
  status: 'pending' | 'applied'
  changeSetSnapshot: BlueprintChangeSet
  /** Real ids assigned when create-node / add-relation operations were applied, keyed by temp id. */
  createdNodeIds?: Record<string, string>
  createdRelationIds?: Record<string, string>
  /** Set when this record was produced by applying a reverse ChangeSet. */
  undoOfAuditId?: string
  beforeSnapshot: unknown
  afterSnapshot?: unknown
  createdAt: string
  appliedAt?: string
}

export interface BlueprintMaintenanceUndoPrepareInput {
  blueprintId: string
  auditId: string
}

export interface BlueprintMaintenanceUndoPrepareResult {
  changeSet: BlueprintChangeSet
  /** Human-readable conflicts against the current Blueprint; non-blocking for unselected operations. */
  conflicts: string[]
}

export interface BlueprintMaintenanceUndoApplyInput {
  blueprintId: string
  undoChangeSetId: string
  operationIds: string[]
  confirmedDeleteOperationIds?: string[]
}

export interface BlueprintMaintenanceUndoApplyResult {
  blueprintRevision: number
  appliedOperationIds: string[]
  auditId: string
}

export interface BlueprintMaintenanceEvent {
  task: BlueprintMaintenanceTask
}
