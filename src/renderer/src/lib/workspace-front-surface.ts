import type { WorkspacePaneNode } from '@/lib/workspace-pane'

export function shouldRenderWorkspacePane(hasPaneContent: boolean): boolean {
  return hasPaneContent
}

export interface WorkspaceTerminalSurfaceSnapshot {
  paneTree: WorkspacePaneNode | null
  activeTerminalId: string | null
  focusedPaneId: string | null
}

export interface WorkspaceTerminalSurface extends WorkspaceTerminalSurfaceSnapshot {
  workspaceId: string
  paneTree: WorkspacePaneNode
}

export const MAX_HOT_WORKSPACE_SURFACES = 4
export const HOT_WORKSPACE_EVICTION_GRACE_MS = 30_000

/** Move the active workspace to the front and evict the least recently used surface. */
export function touchWorkspaceSurfaceRecency(
  recentWorkspaceIds: readonly string[],
  activeWorkspaceId: string | null,
  capacity = MAX_HOT_WORKSPACE_SURFACES,
): string[] {
  if (!activeWorkspaceId || capacity <= 0) return []
  return [
    activeWorkspaceId,
    ...recentWorkspaceIds.filter((workspaceId) => workspaceId !== activeWorkspaceId),
  ].slice(0, capacity)
}

/** Build only hot workspace surfaces while the active state overrides its saved snapshot. */
export function buildWorkspaceTerminalSurfaces(
  snapshots: Record<string, WorkspaceTerminalSurfaceSnapshot>,
  activeWorkspaceId: string | null,
  active: WorkspaceTerminalSurfaceSnapshot,
  hotWorkspaceIds: readonly string[],
): WorkspaceTerminalSurface[] {
  const surfaces = new Map<string, WorkspaceTerminalSurface>()

  for (const workspaceId of hotWorkspaceIds) {
    const snapshot = snapshots[workspaceId]
    if (!snapshot) continue
    if (!snapshot.paneTree) continue
    surfaces.set(workspaceId, { workspaceId, ...snapshot, paneTree: snapshot.paneTree })
  }

  if (activeWorkspaceId && active.paneTree) {
    surfaces.set(activeWorkspaceId, {
      workspaceId: activeWorkspaceId,
      ...active,
      paneTree: active.paneTree,
    })
  }

  return Array.from(surfaces.values())
}
