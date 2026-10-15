import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceTerminalSurfaces,
  GLOBAL_PANE_SCOPE,
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

  it('hosts a project-less pane tree under the global scope so a blank page can open a browser', () => {
    const globalPane = createEmptyPaneLeaf('pane-global')

    const surfaces = buildWorkspaceTerminalSurfaces({}, null, {
      paneTree: globalPane,
      activeTerminalId: null,
      focusedPaneId: 'pane-global',
    }, [])

    expect(surfaces.map(({ workspaceId }) => workspaceId)).toEqual([GLOBAL_PANE_SCOPE])
    expect(surfaces[0]?.paneTree).toBe(globalPane)
  })

  it('builds no surface when there is neither a project nor a pane tree', () => {
    expect(buildWorkspaceTerminalSurfaces({}, null, {
      paneTree: null,
      activeTerminalId: null,
      focusedPaneId: null,
    }, [])).toEqual([])
  })

  it('does not leak the global scope into hot snapshot surfaces', () => {
    const paneA = createEmptyPaneLeaf('pane-a')
    const globalPane = createEmptyPaneLeaf('pane-global')

    const surfaces = buildWorkspaceTerminalSurfaces({
      a: { paneTree: paneA, activeTerminalId: 'terminal-a', focusedPaneId: 'pane-a' },
    }, null, {
      paneTree: globalPane,
      activeTerminalId: null,
      focusedPaneId: 'pane-global',
    }, ['a'])

    // 热快照仍按真实 workspaceId 呈现并全部不可见，活动面单独走全局哨兵。
    expect(surfaces.map(({ workspaceId }) => workspaceId)).toEqual(['a', GLOBAL_PANE_SCOPE])
  })
})
