import type {
  BlueprintMaintenanceAuditRecord,
  BlueprintOperation,
} from '@/services/blueprint'

export interface AuditFieldChange {
  field: string
  before: unknown
  after: unknown
}

export function selectedAuditOperations(record: BlueprintMaintenanceAuditRecord): BlueprintOperation[] {
  const selected = new Set(record.selectedOperationIds)
  return record.changeSetSnapshot.operations.filter((operation) => selected.has(operation.operationId))
}

export function auditOperationChanges(operation: BlueprintOperation): AuditFieldChange[] {
  switch (operation.type) {
    case 'move-node':
      return [{ field: 'parentId', before: operation.beforeParentId, after: operation.afterParentId }]
    case 'create-node':
      return [
        { field: 'parentId', before: null, after: operation.parentId },
        ...Object.entries(operation.after).map(([field, after]) => ({ field, before: null, after })),
      ]
    case 'update-node':
      return Object.entries(operation.after).map(([field, after]) => ({
        field,
        before: operation.before[field as keyof typeof operation.before],
        after,
      }))
    case 'add-relation':
      return [
        { field: 'relationType', before: null, after: operation.after.relationType },
        { field: 'sourceNodeId', before: null, after: operation.after.sourceNodeId },
        { field: 'targetNodeId', before: null, after: operation.after.targetNodeId },
        ...(operation.after.description !== undefined
          ? [{ field: 'description', before: null, after: operation.after.description }] : []),
      ]
    case 'update-relation':
      return [
        ...(operation.after.relationType !== undefined
          ? [{ field: 'relationType', before: operation.before.type ?? null, after: operation.after.relationType }] : []),
        ...(operation.after.description !== undefined
          ? [{ field: 'description', before: operation.before.description ?? null, after: operation.after.description }] : []),
      ]
    case 'remove-relation':
      return operation.before
        ? [
            { field: 'relationType', before: operation.before.type, after: null },
            { field: 'sourceNodeId', before: operation.before.sourceNodeId, after: null },
            { field: 'targetNodeId', before: operation.before.targetNodeId, after: null },
          ]
        : [{ field: 'relationType', before: operation.relationId, after: null }]
    case 'update-workspace-binding':
      return [
        { field: 'primaryWorkspaceId', before: operation.before.primaryWorkspaceId, after: operation.after.primaryWorkspaceId },
        { field: 'linkedWorkspaceIds', before: operation.before.linkedWorkspaceIds, after: operation.after.linkedWorkspaceIds },
      ]
    case 'archive-node':
      return [{ field: 'status', before: operation.beforeStatus, after: 'archived' }]
    case 'delete-node':
      return [
        { field: 'title', before: operation.impact.title, after: null },
        { field: 'parentId', before: operation.impact.parentId, after: null },
      ]
    case 'restore-node':
      return [
        { field: 'title', before: null, after: operation.node.title },
        { field: 'parentId', before: null, after: operation.node.parentId },
      ]
  }
}

export function auditOperationEvidence(
  record: BlueprintMaintenanceAuditRecord,
  operation: BlueprintOperation,
): string[] {
  const evidence = new Set(operation.evidenceRefs)
  for (const manifest of record.changeSetSnapshot.evidence ?? []) {
    for (const file of manifest.files) {
      if (file.supportsOperationIds.includes(operation.operationId)) evidence.add(file.path)
    }
  }
  return [...evidence].sort((left, right) => left.localeCompare(right))
}

export function formatAuditValue(value: unknown, emptyValue: string): string {
  if (value === null || value === undefined || value === '') return emptyValue
  if (Array.isArray(value)) {
    if (!value.length) return emptyValue
    return value.some((item) => typeof item === 'object' && item !== null)
      ? JSON.stringify(value)
      : value.join(', ')
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
