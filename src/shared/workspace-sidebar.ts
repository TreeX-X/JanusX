import type { Workspace, WorkspaceSidebarGroup } from './ipc/workspace'

export type WorkspaceSidebarDropPosition = 'before' | 'after'
export type WorkspaceSidebarBoundary = 'start' | 'end'

function groupId(workspace: Workspace): string | null {
  return workspace.sidebarGroup?.id ?? null
}

function normalizeSingletonGroups(workspaces: Workspace[]): Workspace[] {
  const groupCounts = new Map<string, number>()
  for (const workspace of workspaces) {
    const id = groupId(workspace)
    if (id) groupCounts.set(id, (groupCounts.get(id) ?? 0) + 1)
  }

  return workspaces.map((workspace) => {
    const id = groupId(workspace)
    if (!id || (groupCounts.get(id) ?? 0) > 1) return workspace
    return { ...workspace, sidebarGroup: undefined }
  })
}

export function normalizeWorkspaceSidebarLayout(workspaces: Workspace[]): Workspace[] {
  return normalizeSingletonGroups(workspaces).map((workspace, sidebarOrder) => ({
    ...workspace,
    sidebarOrder,
  }))
}

export function sortWorkspaceSidebar(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((left, right) => {
    const leftOrder = Number.isFinite(left.sidebarOrder) ? left.sidebarOrder! : Number.MAX_SAFE_INTEGER
    const rightOrder = Number.isFinite(right.sidebarOrder) ? right.sidebarOrder! : Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    const createdOrder = left.createdAt.localeCompare(right.createdAt)
    return createdOrder || left.id.localeCompare(right.id)
  })
}

export function workspaceSidebarLayoutsEqual(left: Workspace[], right: Workspace[]): boolean {
  if (left.length !== right.length) return false
  return left.every((workspace, index) => {
    const candidate = right[index]
    return candidate?.id === workspace.id
      && candidate.sidebarOrder === workspace.sidebarOrder
      && candidate.sidebarGroup?.id === workspace.sidebarGroup?.id
      && candidate.sidebarGroup?.name === workspace.sidebarGroup?.name
  })
}

export function moveWorkspaceInSidebar(
  workspaces: Workspace[],
  sourceId: string,
  targetId: string,
  position: WorkspaceSidebarDropPosition,
): Workspace[] {
  if (sourceId === targetId) return workspaces
  const source = workspaces.find((workspace) => workspace.id === sourceId)
  const target = workspaces.find((workspace) => workspace.id === targetId)
  if (!source || !target) return workspaces

  let nextGroup = target.sidebarGroup
  if (target.sidebarGroup && source.sidebarGroup?.id !== target.sidebarGroup.id) {
    const members = workspaces.filter((workspace) => groupId(workspace) === target.sidebarGroup?.id)
    const outerEdge = position === 'before'
      ? members[0]?.id === targetId
      : members[members.length - 1]?.id === targetId
    if (outerEdge) nextGroup = undefined
  }

  const moved = { ...source, sidebarGroup: nextGroup }
  const remaining = workspaces.filter((workspace) => workspace.id !== sourceId)
  const targetIndex = remaining.findIndex((workspace) => workspace.id === targetId)
  const insertionIndex = targetIndex + (position === 'after' ? 1 : 0)
  remaining.splice(insertionIndex, 0, moved)
  return normalizeWorkspaceSidebarLayout(remaining)
}

export function moveWorkspaceToSidebarBoundary(
  workspaces: Workspace[],
  sourceId: string,
  boundary: WorkspaceSidebarBoundary,
): Workspace[] {
  const source = workspaces.find((workspace) => workspace.id === sourceId)
  if (!source) return workspaces
  const moved = { ...source, sidebarGroup: undefined }
  const remaining = workspaces.filter((workspace) => workspace.id !== sourceId)
  if (boundary === 'start') remaining.unshift(moved)
  else remaining.push(moved)
  return normalizeWorkspaceSidebarLayout(remaining)
}

export function groupWorkspaceInSidebar(
  workspaces: Workspace[],
  sourceId: string,
  targetId: string,
  newGroup: WorkspaceSidebarGroup,
): Workspace[] {
  if (sourceId === targetId) return workspaces
  const source = workspaces.find((workspace) => workspace.id === sourceId)
  const target = workspaces.find((workspace) => workspace.id === targetId)
  if (!source || !target) return workspaces

  const group = target.sidebarGroup ?? newGroup
  const remaining = workspaces
    .filter((workspace) => workspace.id !== sourceId)
    .map((workspace) => workspace.id === targetId && !workspace.sidebarGroup
      ? { ...workspace, sidebarGroup: group }
      : workspace)
  const targetIndex = remaining.findIndex((workspace) => workspace.id === targetId)
  remaining.splice(targetIndex + 1, 0, { ...source, sidebarGroup: group })
  return normalizeWorkspaceSidebarLayout(remaining)
}

export function removeWorkspaceFromSidebarGroup(workspaces: Workspace[], workspaceId: string): Workspace[] {
  const source = workspaces.find((workspace) => workspace.id === workspaceId)
  const sourceGroupId = source?.sidebarGroup?.id
  if (!source || !sourceGroupId) return workspaces

  const remaining = workspaces.filter((workspace) => workspace.id !== workspaceId)
  let lastGroupIndex = -1
  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    if (groupId(remaining[index]!) !== sourceGroupId) continue
    lastGroupIndex = index
    break
  }
  remaining.splice(lastGroupIndex + 1, 0, { ...source, sidebarGroup: undefined })
  return normalizeWorkspaceSidebarLayout(remaining)
}

export function renameWorkspaceSidebarGroup(
  workspaces: Workspace[],
  groupIdValue: string,
  name: string,
): Workspace[] {
  const trimmedName = name.trim()
  if (!trimmedName) return workspaces
  return workspaces.map((workspace) => workspace.sidebarGroup?.id === groupIdValue
    ? { ...workspace, sidebarGroup: { ...workspace.sidebarGroup, name: trimmedName } }
    : workspace)
}

export function clearWorkspaceSidebarGroup(workspaces: Workspace[], groupIdValue: string): Workspace[] {
  return normalizeWorkspaceSidebarLayout(workspaces.map((workspace) => workspace.sidebarGroup?.id === groupIdValue
    ? { ...workspace, sidebarGroup: undefined }
    : workspace))
}

export function nextWorkspaceSidebarGroupName(workspaces: Workspace[]): string {
  const names = new Set(workspaces
    .map((workspace) => workspace.sidebarGroup?.name)
    .filter((name): name is string => !!name))
  if (!names.has('新分组')) return '新分组'
  let suffix = 2
  while (names.has(`新分组 ${suffix}`)) suffix += 1
  return `新分组 ${suffix}`
}
