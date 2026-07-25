import { describe, expect, it } from 'vitest'
import {
  attachWorkspaceResource,
  detachWorkspaceResource,
  ensureEmbeddedWorkspaceResource,
  reconcileWorkspaceResources,
  selectWorkspaceResource,
  type JanusResourceState,
} from '../../src/renderer/src/components/janus/janusResources'
import type { Workspace } from '../../src/renderer/src/types'

function workspace(id: string, name = id): Workspace {
  return {
    id,
    name,
    path: `C:\\workspaces\\${id}`,
    clis: [],
    layout: { mode: 'tabs', positions: [] },
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
  }
}

const empty: JanusResourceState = { resources: [], activeResourceId: null }

describe('Janus workspace resources', () => {
  it('attaches workspaces explicitly without duplicates and selects the latest target', () => {
    const first = attachWorkspaceResource(empty, workspace('one'))
    const second = attachWorkspaceResource(first, workspace('two'))
    const repeated = attachWorkspaceResource(second, workspace('one'))

    expect(repeated.resources.map((resource) => resource.workspaceId)).toEqual(['one', 'two'])
    expect(repeated.resources.every((resource) => resource.source === 'attached')).toBe(true)
    expect(repeated.activeResourceId).toBe('one')
  })

  it('replaces the embedded resource while retaining explicitly attached resources', () => {
    const attached = attachWorkspaceResource(empty, workspace('attached'))
    const firstEmbed = ensureEmbeddedWorkspaceResource(attached, workspace('embedded-one'))
    const nextEmbed = ensureEmbeddedWorkspaceResource(firstEmbed, workspace('embedded-two'))

    expect(nextEmbed.resources).toEqual([
      expect.objectContaining({ workspaceId: 'attached', source: 'attached' }),
      expect.objectContaining({ workspaceId: 'embedded-two', source: 'embedded' }),
    ])
    expect(nextEmbed.activeResourceId).toBe('embedded-two')
  })

  it('falls back deterministically when active resources are removed or unavailable', () => {
    const state = attachWorkspaceResource(
      attachWorkspaceResource(empty, workspace('one')),
      workspace('two'),
    )
    const selected = selectWorkspaceResource(state, 'two')
    const detached = detachWorkspaceResource(selected, 'two')
    const reconciled = reconcileWorkspaceResources(detached, [workspace('one', 'Renamed')])

    expect(detached.activeResourceId).toBe('one')
    expect(reconciled.resources).toEqual([
      expect.objectContaining({ workspaceId: 'one', workspaceName: 'Renamed' }),
    ])
    expect(reconciled.activeResourceId).toBe('one')
  })
})
