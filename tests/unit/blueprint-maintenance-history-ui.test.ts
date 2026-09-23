import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'

describe('Blueprint right column is chat-only', () => {
  it('renders the bound project chat with no machine surface', async () => {
    const panel = await readFile('src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx', 'utf8')

    // Chat-only: bound project conversation, chipless composer, plan-first.
    expect(panel).toContain('bindProject(')
    expect(panel).toContain('minimalComposer')
    expect(panel).toContain("setApprovalMode('plan')")
    expect(panel).toContain('<JanusChat')
    // No queue chrome and no legacy readers.
    expect(panel).not.toContain('bp-maintenance-start')
    expect(panel).not.toContain('bp-maintenance-machine')
    expect(panel).not.toContain('bp-maintenance-proposal')
    expect(panel).not.toContain('bp-maintenance-history__item')
    expect(panel).not.toContain('bp-maintenance-migrate')
    expect(panel).not.toContain('undoPanel')
    expect(panel).not.toContain('auditHistory')
    expect(panel).not.toContain('panelView')
    expect(panel).not.toContain('migratePreview')
    expect(panel).not.toContain('acceptRequirementCandidate')
    expect(panel).not.toContain('maintenanceAuditDetails')
  })
})
