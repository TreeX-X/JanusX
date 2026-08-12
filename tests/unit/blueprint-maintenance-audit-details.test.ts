import { describe, expect, it } from 'vitest'
import type { BlueprintMaintenanceAuditRecord } from '../../src/shared/janus/maintenance-types'
import {
  auditOperationChanges,
  auditOperationEvidence,
  formatAuditValue,
  selectedAuditOperations,
} from '../../src/renderer/src/components/blueprint/maintenanceAuditDetails'

function auditFixture(): BlueprintMaintenanceAuditRecord {
  return {
    id: 'audit-1', taskId: 'task-1', changeSetId: 'set-1', blueprintId: 'bp-1',
    beforeRevision: 3, afterRevision: 4, selectedOperationIds: ['update-1'], rejectedOperationIds: ['move-1'],
    status: 'applied', beforeSnapshot: {}, afterSnapshot: {}, createdAt: '2026-08-11T00:00:00.000Z',
    changeSetSnapshot: {
      id: 'set-1', taskId: 'task-1', blueprintId: 'bp-1', baseRevision: 3, version: 1,
      status: 'applied', reason: 'test', createdAt: '2026-08-11T00:00:00.000Z',
      evidence: [{
        workspaceId: 'ws-1', workspaceRootFingerprint: 'root', files: [{
          path: 'src/feature.ts', sha256: 'hash', role: 'critical', sourceState: 'committed', supportsOperationIds: ['update-1'],
        }],
      }],
      operations: [{
        operationId: 'update-1', type: 'update-node', nodeId: 'root', before: { notes: 'old', tags: [] }, after: { notes: 'new', tags: ['audit'] },
        reason: 'update', evidenceRefs: ['docs/spec.md'], dependsOn: [], risk: 'low',
      }, {
        operationId: 'move-1', type: 'move-node', nodeId: 'root', beforeParentId: null, afterParentId: 'other',
        reason: 'rejected', evidenceRefs: [], dependsOn: [], risk: 'low',
      }],
    },
  }
}

describe('Blueprint maintenance audit details', () => {
  it('shows only approved operations with field changes and deduplicated evidence', () => {
    const audit = auditFixture()
    const operations = selectedAuditOperations(audit)

    expect(operations.map((operation) => operation.operationId)).toEqual(['update-1'])
    expect(auditOperationChanges(operations[0])).toEqual([
      { field: 'notes', before: 'old', after: 'new' },
      { field: 'tags', before: [], after: ['audit'] },
    ])
    expect(auditOperationEvidence(audit, operations[0])).toEqual(['docs/spec.md', 'src/feature.ts'])
  })

  it('formats empty, array, and scalar values for compact display', () => {
    expect(formatAuditValue(null, 'None')).toBe('None')
    expect(formatAuditValue([], 'None')).toBe('None')
    expect(formatAuditValue(['a', 'b'], 'None')).toBe('a, b')
    expect(formatAuditValue([{ title: 'Requirement A' }], 'None')).toBe('[{"title":"Requirement A"}]')
    expect(formatAuditValue(42, 'None')).toBe('42')
  })
})
