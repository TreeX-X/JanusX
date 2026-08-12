import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'

describe('Blueprint maintenance authorization UI', () => {
  it('supports multiple workspaces and keeps maintenance scoped to one node', async () => {
    const panel = await readFile('src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx', 'utf8')

    expect(panel).toContain('className="bp-maintenance-workspace-picker"')
    expect(panel).toContain('aria-pressed={selected}')
    expect(panel).toContain('authorizedWorkspaces: selectedWorkspaces.map')
    expect(panel).toContain("nodeScope: { type: 'node', nodeId: scopeNodeId }")
    expect(panel).not.toContain("setScopeType")
    expect(panel).toContain('window.electron.workspace.list()')
  })
})
