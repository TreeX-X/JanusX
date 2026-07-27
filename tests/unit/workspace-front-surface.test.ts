import { describe, expect, it } from 'vitest'
import { shouldRenderWorkspacePane } from '../../src/renderer/src/lib/workspace-front-surface'

describe('workspace front surface', () => {
  it('renders an embedded Chat pane even when the workspace has no terminal', () => {
    expect(shouldRenderWorkspacePane('no-terminal', true)).toBe(true)
  })

  it('keeps the terminal selector when an empty workspace has no pane content', () => {
    expect(shouldRenderWorkspacePane('no-terminal', false)).toBe(false)
  })

  it('continues rendering active terminal workspaces', () => {
    expect(shouldRenderWorkspacePane('terminal-active', false)).toBe(true)
  })
})
