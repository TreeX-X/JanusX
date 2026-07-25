import type { Workspace } from '@/types'

export interface WorkspaceResource {
  workspaceId: string
  workspacePath: string
  workspaceName: string
  source: 'attached' | 'embedded'
}

export interface JanusResourceState {
  resources: WorkspaceResource[]
  activeResourceId: string | null
}

function toResource(workspace: Workspace, source: WorkspaceResource['source']): WorkspaceResource {
  return {
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    workspaceName: workspace.name,
    source,
  }
}

export function attachWorkspaceResource(
  state: JanusResourceState,
  workspace: Workspace,
): JanusResourceState {
  const exists = state.resources.some((resource) => resource.workspaceId === workspace.id)
  return {
    resources: exists ? state.resources : [...state.resources, toResource(workspace, 'attached')],
    activeResourceId: workspace.id,
  }
}

export function ensureEmbeddedWorkspaceResource(
  state: JanusResourceState,
  workspace: Workspace,
): JanusResourceState {
  const resources = state.resources
    .filter((resource) => resource.source !== 'embedded' || resource.workspaceId === workspace.id)
  const exists = resources.some((resource) => resource.workspaceId === workspace.id)
  return {
    resources: exists
      ? resources.map((resource) => resource.workspaceId === workspace.id
          ? { ...resource, workspaceName: workspace.name, workspacePath: workspace.path }
          : resource)
      : [...resources, toResource(workspace, 'embedded')],
    activeResourceId: workspace.id,
  }
}

export function detachWorkspaceResource(
  state: JanusResourceState,
  workspaceId: string,
): JanusResourceState {
  const resources = state.resources.filter((resource) => resource.workspaceId !== workspaceId)
  return {
    resources,
    activeResourceId: state.activeResourceId === workspaceId
      ? resources[0]?.workspaceId ?? null
      : state.activeResourceId,
  }
}

export function selectWorkspaceResource(
  state: JanusResourceState,
  workspaceId: string,
): JanusResourceState {
  return state.resources.some((resource) => resource.workspaceId === workspaceId)
    ? { ...state, activeResourceId: workspaceId }
    : state
}

export function reconcileWorkspaceResources(
  state: JanusResourceState,
  workspaces: Workspace[],
): JanusResourceState {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  const resources = state.resources.flatMap((resource) => {
    const workspace = workspacesById.get(resource.workspaceId)
    return workspace
      ? [{ ...resource, workspaceName: workspace.name, workspacePath: workspace.path }]
      : []
  })
  return {
    resources,
    activeResourceId: state.activeResourceId && resources.some((resource) =>
      resource.workspaceId === state.activeResourceId)
      ? state.activeResourceId
      : resources[0]?.workspaceId ?? null,
  }
}
