import type { Workspace } from '@/types'

export interface WorkspaceResource {
  workspaceId: string
  workspacePath: string
  workspaceName: string
}

export interface JanusResourceState {
  resources: WorkspaceResource[]
}

export interface JanusResourcePreferences {
  version: 1
  attachedWorkspaceIds: string[]
}

export const JANUS_RESOURCE_STORAGE_KEY = 'janusx.janus-chat.resources.v1'

function toResource(workspace: Workspace): WorkspaceResource {
  return {
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    workspaceName: workspace.name,
  }
}

export function attachWorkspaceResource(
  state: JanusResourceState,
  workspace: Workspace,
): JanusResourceState {
  if (state.resources.some((resource) => resource.workspaceId === workspace.id)) return state
  return { resources: [...state.resources, toResource(workspace)] }
}

export function detachWorkspaceResource(
  state: JanusResourceState,
  workspaceId: string,
): JanusResourceState {
  return { resources: state.resources.filter((resource) => resource.workspaceId !== workspaceId) }
}

export function reconcileWorkspaceResources(
  state: JanusResourceState,
  workspaces: Workspace[],
): JanusResourceState {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  return {
    resources: state.resources.flatMap((resource) => {
      const workspace = workspacesById.get(resource.workspaceId)
      return workspace ? [toResource(workspace)] : []
    }),
  }
}

export function toJanusResourcePreferences(state: JanusResourceState): JanusResourcePreferences {
  return {
    version: 1,
    attachedWorkspaceIds: state.resources.map((resource) => resource.workspaceId),
  }
}

export function parseJanusResourcePreferences(value: string | null): JanusResourcePreferences {
  if (!value) return { version: 1, attachedWorkspaceIds: [] }
  try {
    const parsed = JSON.parse(value) as Partial<JanusResourcePreferences>
    return {
      version: 1,
      attachedWorkspaceIds: Array.isArray(parsed.attachedWorkspaceIds)
        ? [...new Set(parsed.attachedWorkspaceIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [],
    }
  } catch {
    return { version: 1, attachedWorkspaceIds: [] }
  }
}

export function restoreJanusResourcePreferences(
  preferences: JanusResourcePreferences,
  workspaces: Workspace[],
): JanusResourceState {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  return {
    resources: preferences.attachedWorkspaceIds.flatMap((id) => {
      const workspace = workspacesById.get(id)
      return workspace ? [toResource(workspace)] : []
    }),
  }
}
