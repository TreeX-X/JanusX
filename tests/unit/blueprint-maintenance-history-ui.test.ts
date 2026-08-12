import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'

describe('Blueprint maintenance audit history UI', () => {
  it('loads scoped audits and renders translated revision, operation, and empty states', async () => {
    const panel = await readFile('src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx', 'utf8')
    const store = await readFile('src/renderer/src/stores/blueprint-maintenance.ts', 'utf8')

    expect(store).toContain('listMaintenanceAudits({ blueprintId, taskId })')
    expect(panel).toContain("t('blueprint:maintenance.auditHistory')")
    expect(panel).toContain("t('blueprint:maintenance.auditRevision'")
    expect(panel).toContain("t('blueprint:maintenance.auditOperations'")
    expect(panel).toContain("t('blueprint:maintenance.auditEmpty')")
    expect(panel).toContain('record.selectedOperationIds.length')
    expect(panel).toContain('selectedAuditOperations(record)')
    expect(panel).toContain('auditOperationChanges(operation)')
    expect(panel).toContain('auditOperationEvidence(record, operation)')
  })
})
