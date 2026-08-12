import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'

describe('Blueprint maintenance progress UI', () => {
  it('keeps progress integrated and provides a quick return to the conversation bottom', async () => {
    const [panel, styles] = await Promise.all([
      readFile('src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx', 'utf8'),
      readFile('src/renderer/src/components/blueprint/blueprint.css', 'utf8'),
    ])

    expect(panel).toContain('className="bp-maintenance-task-overview" role="status" aria-live="polite"')
    expect(panel).toContain("taskWorking = task?.status === 'analyzing' || task?.status === 'applying'")
    expect(panel).toContain('className="bp-maintenance-thinking"')
    expect(styles).toMatch(/\.bp-maintenance-task-overview\s*\{[^}]*position:\s*sticky;/s)
    expect(styles).toMatch(/\.bp-maintenance-task-overview\s*\{[^}]*top:\s*0;/s)
    expect(styles).not.toMatch(/\.bp-maintenance-task-overview\s*\{[^}]*box-shadow:/s)
    expect(panel).toContain('className="bp-maintenance-scroll-bottom"')
    expect(panel).toContain('target.offsetTop - container.clientHeight + 24')
    expect(panel).toContain('ref={conversationBottomRef}')
    expect(styles).toMatch(/\.bp-maintenance-scroll-bottom\s*\{[^}]*position:\s*sticky;/s)
    expect(styles).toContain('@keyframes bp-maintenance-thinking')
  })
})
