import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'

describe('Blueprint maintenance progress UI', () => {
  it('keeps proposal progress visible while the conversation scrolls', async () => {
    const [panel, styles] = await Promise.all([
      readFile('src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx', 'utf8'),
      readFile('src/renderer/src/components/blueprint/blueprint.css', 'utf8'),
    ])

    expect(panel).toContain('className="bp-maintenance-task-overview" role="status" aria-live="polite"')
    expect(styles).toMatch(/\.bp-maintenance-task-overview\s*\{[^}]*position:\s*sticky;/s)
    expect(styles).toMatch(/\.bp-maintenance-task-overview\s*\{[^}]*top:\s*0;/s)
  })
})
