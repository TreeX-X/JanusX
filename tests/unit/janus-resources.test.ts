import { describe, expect, it } from 'vitest'
import {
  attachWorkspaceResource,
  detachWorkspaceResource,
  parseJanusResourcePreferences,
  reconcileWorkspaceResources,
  restoreJanusResourcePreferences,
  toJanusResourcePreferences,
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

const empty: JanusResourceState = { resources: [] }

describe('Janus workspace resources', () => {
  it('keeps every attached workspace in one unordered-access collection without duplicates', () => {
    const first = attachWorkspaceResource(empty, workspace('one'))
    const second = attachWorkspaceResource(first, workspace('two'))
    const repeated = attachWorkspaceResource(second, workspace('one'))

    expect(repeated.resources.map((resource) => resource.workspaceId)).toEqual(['one', 'two'])
    expect(repeated).toBe(second)
    expect(repeated).not.toHaveProperty('activeResourceId')
  })

  it('removes only the requested resource and reconciles current workspace metadata', () => {
    const state = attachWorkspaceResource(
      attachWorkspaceResource(empty, workspace('one')),
      workspace('two'),
    )
    const detached = detachWorkspaceResource(state, 'two')
    const reconciled = reconcileWorkspaceResources(detached, [workspace('one', 'Renamed')])

    expect(reconciled.resources).toEqual([
      expect.objectContaining({ workspaceId: 'one', workspaceName: 'Renamed' }),
    ])
  })

  it('persists and restores every attached workspace by current identity', () => {
    const state = attachWorkspaceResource(
      attachWorkspaceResource(empty, workspace('one')),
      workspace('two'),
    )
    const preferences = toJanusResourcePreferences(state)

    expect(preferences).toEqual({ version: 1, attachedWorkspaceIds: ['one', 'two'] })
    expect(restoreJanusResourcePreferences(preferences, [workspace('one', 'Current'), workspace('two')])).toEqual({
      resources: [
        expect.objectContaining({ workspaceId: 'one', workspaceName: 'Current' }),
        expect.objectContaining({ workspaceId: 'two' }),
      ],
    })
  })

  it('sanitizes malformed preferences and ignores the legacy active selection', () => {
    expect(parseJanusResourcePreferences('{"attachedWorkspaceIds":["one","one",3],"activeResourceId":"one"}')).toEqual({
      version: 1,
      attachedWorkspaceIds: ['one'],
    })
    expect(parseJanusResourcePreferences('{')).toEqual({ version: 1, attachedWorkspaceIds: [] })
  })
})
