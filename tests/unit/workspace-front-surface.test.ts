import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceTerminalSurfaces,
  MAX_HOT_WORKSPACE_SURFACES,
  shouldRenderWorkspacePane,
  touchWorkspaceSurfaceRecency,
} from '../../src/renderer/src/lib/workspace-front-surface'
import { createEmptyPaneLeaf } from '../../src/renderer/src/lib/workspace-pane'

describe('workspace front surface', () => {
  it('renders an embedded Chat pane even when the workspace has no terminal', () => {
    expect(shouldRenderWorkspacePane(true)).toBe(true)
  })

  it('keeps the terminal selector when an empty workspace has no pane content', () => {
    expect(shouldRenderWorkspacePane(false)).toBe(false)
  })

  it('keeps visited workspace surfaces mounted and lets active state override its snapshot', () => {
    const paneA = createEmptyPaneLeaf('pane-a')
    const stalePaneB = createEmptyPaneLeaf('pane-b-stale')
    const activePaneB = createEmptyPaneLeaf('pane-b-active')

    const surfaces = buildWorkspaceTerminalSurfaces({
      a: { paneTree: paneA, activeTerminalId: 'terminal-a', focusedPaneId: 'pane-a' },
      b: { paneTree: stalePaneB, activeTerminalId: null, focusedPaneId: 'pane-b-stale' },
      empty: { paneTree: null, activeTerminalId: null, focusedPaneId: null },
    }, 'b', {
      paneTree: activePaneB,
      activeTerminalId: 'terminal-b',
      focusedPaneId: 'pane-b-active',
    }, ['a', 'b'])

    expect(surfaces.map(({ workspaceId }) => workspaceId)).toEqual(['a', 'b'])
    expect(surfaces.find(({ workspaceId }) => workspaceId === 'a')?.paneTree).toBe(paneA)
    expect(surfaces.find(({ workspaceId }) => workspaceId === 'b')).toMatchObject({
      paneTree: activePaneB,
      activeTerminalId: 'terminal-b',
      focusedPaneId: 'pane-b-active',
    })
  })

  it('keeps the active workspace and evicts the least recently used surface', () => {
    let recent = touchWorkspaceSurfaceRecency([], 'a', 3)
    recent = touchWorkspaceSurfaceRecency(recent, 'b', 3)
    recent = touchWorkspaceSurfaceRecency(recent, 'c', 3)
    recent = touchWorkspaceSurfaceRecency(recent, 'a', 3)
    recent = touchWorkspaceSurfaceRecency(recent, 'd', 3)

    expect(recent).toEqual(['d', 'a', 'c'])
  })

  it('can retain one grace surface before returning to the normal hot limit', () => {
    const duringGrace = touchWorkspaceSurfaceRecency(
      ['d', 'c', 'b', 'a'],
      'e',
      MAX_HOT_WORKSPACE_SURFACES + 1,
    )

    expect(duringGrace).toEqual(['e', 'd', 'c', 'b', 'a'])
    expect(duringGrace.slice(0, MAX_HOT_WORKSPACE_SURFACES)).toEqual(['e', 'd', 'c', 'b'])
  })

  it('does not build cold workspace surfaces', () => {
    const paneA = createEmptyPaneLeaf('pane-a')
    const paneB = createEmptyPaneLeaf('pane-b')

    const surfaces = buildWorkspaceTerminalSurfaces({
      a: { paneTree: paneA, activeTerminalId: null, focusedPaneId: 'pane-a' },
      b: { paneTree: paneB, activeTerminalId: null, focusedPaneId: 'pane-b' },
    }, 'a', {
      paneTree: paneA,
      activeTerminalId: null,
      focusedPaneId: 'pane-a',
    }, ['a'])

    expect(surfaces.map(({ workspaceId }) => workspaceId)).toEqual(['a'])
  })
})
