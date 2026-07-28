import { describe, expect, it } from 'vitest'
import type { Workspace, WorkspaceSidebarGroup } from '../../src/shared/ipc/workspace'
import {
  clearWorkspaceSidebarGroup,
  groupWorkspaceInSidebar,
  moveWorkspaceInSidebar,
  moveWorkspaceToSidebarBoundary,
  nextWorkspaceSidebarGroupName,
  removeWorkspaceFromSidebarGroup,
  renameWorkspaceSidebarGroup,
  sortWorkspaceSidebar,
} from '../../src/shared/workspace-sidebar'

function workspace(id: string, order?: number, group?: WorkspaceSidebarGroup): Workspace {
  return {
    id,
    name: id,
    path: `C:\\${id}`,
    clis: [],
    layout: { mode: 'grid', positions: [] },
    sidebarOrder: order,
    sidebarGroup: group,
    createdAt: `2026-01-0${Number(id.slice(-1)) || 1}T00:00:00.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const groupA = { id: 'group-a', name: '模块 A' }
const groupB = { id: 'group-b', name: '模块 B' }

describe('workspace sidebar layout', () => {
  it('sorts persisted order before legacy creation order', () => {
    const result = sortWorkspaceSidebar([
      workspace('workspace-3'),
      workspace('workspace-2', 1),
      workspace('workspace-1', 0),
    ])
    expect(result.map((item) => item.id)).toEqual(['workspace-1', 'workspace-2', 'workspace-3'])
  })

  it('reorders workspaces and leaves a group at its outer edge', () => {
    const result = moveWorkspaceInSidebar([
      workspace('workspace-1', 0),
      workspace('workspace-2', 1, groupA),
      workspace('workspace-3', 2, groupA),
    ], 'workspace-1', 'workspace-2', 'before')

    expect(result.map((item) => item.id)).toEqual(['workspace-1', 'workspace-2', 'workspace-3'])
    expect(result[0]?.sidebarGroup).toBeUndefined()
    expect(result.map((item) => item.sidebarOrder)).toEqual([0, 1, 2])
  })

  it('joins a group when inserted into an internal member gap', () => {
    const result = moveWorkspaceInSidebar([
      workspace('workspace-1', 0),
      workspace('workspace-2', 1, groupA),
      workspace('workspace-3', 2, groupA),
    ], 'workspace-1', 'workspace-2', 'after')

    expect(result.map((item) => item.id)).toEqual(['workspace-2', 'workspace-1', 'workspace-3'])
    expect(result.every((item) => item.sidebarGroup?.id === 'group-a')).toBe(true)
  })

  it('creates a group and inserts the dragged workspace beside its target', () => {
    const result = groupWorkspaceInSidebar([
      workspace('workspace-1', 0),
      workspace('workspace-2', 1),
      workspace('workspace-3', 2),
    ], 'workspace-3', 'workspace-1', groupA)

    expect(result.map((item) => item.id)).toEqual(['workspace-1', 'workspace-3', 'workspace-2'])
    expect(result.slice(0, 2).map((item) => item.sidebarGroup?.id)).toEqual(['group-a', 'group-a'])
  })

  it('moves a workspace into an existing group and dissolves its old singleton', () => {
    const result = groupWorkspaceInSidebar([
      workspace('workspace-1', 0, groupA),
      workspace('workspace-2', 1, groupA),
      workspace('workspace-3', 2, groupB),
      workspace('workspace-4', 3, groupB),
    ], 'workspace-3', 'workspace-1', { id: 'unused', name: 'unused' })

    expect(result.slice(0, 2).map((item) => item.id)).toEqual(['workspace-1', 'workspace-3'])
    expect(result.find((item) => item.id === 'workspace-3')?.sidebarGroup).toEqual(groupA)
    expect(result.find((item) => item.id === 'workspace-4')?.sidebarGroup).toBeUndefined()
  })

  it('supports removing, renaming, dissolving, and boundary moves', () => {
    const grouped = [
      workspace('workspace-1', 0, groupA),
      workspace('workspace-2', 1, groupA),
      workspace('workspace-3', 2),
    ]
    const removed = removeWorkspaceFromSidebarGroup(grouped, 'workspace-1')
    expect(removed.map((item) => item.id)).toEqual(['workspace-2', 'workspace-1', 'workspace-3'])
    expect(removed[0]?.sidebarGroup).toBeUndefined()

    const renamed = renameWorkspaceSidebarGroup(grouped, 'group-a', '新名称')
    expect(renamed.slice(0, 2).map((item) => item.sidebarGroup?.name)).toEqual(['新名称', '新名称'])

    const cleared = clearWorkspaceSidebarGroup(grouped, 'group-a')
    expect(cleared.every((item) => !item.sidebarGroup)).toBe(true)

    const moved = moveWorkspaceToSidebarBoundary(grouped, 'workspace-2', 'end')
    expect(moved.map((item) => item.id)).toEqual(['workspace-1', 'workspace-3', 'workspace-2'])
    expect(moved.every((item) => !item.sidebarGroup)).toBe(true)
    expect(nextWorkspaceSidebarGroupName(grouped)).toBe('新分组')
  })
})
