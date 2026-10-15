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

/**
 * 无项目（未选择文件夹）时活动 pane 树的宿主键。
 *
 * `terminalSnapshots` 按 workspaceId 存档，没有项目时就无处可放，而这个哨兵只活在
 * `buildWorkspaceTerminalSurfaces` 产出的 surface 里：不进快照、不进热工作区、
 * 不过 `retainWorkspacePaneContent`，因此切项目即丢弃——浏览器 surface 本身在
 * 主进程存活，重开入口会按原 surfaceId 把它纳回 pane。
 */
export const GLOBAL_PANE_SCOPE = '__global__'

/** 无项目时活动 pane 树的宿主 id；有项目时仍是真实 workspaceId。 */
export function activePaneScopeId(activeWorkspaceId: string | null): string {
  return activeWorkspaceId ?? GLOBAL_PANE_SCOPE
}

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

  // 活动 surface：有项目用真实 workspaceId；无项目但有 pane 树时用全局哨兵，
  // 否则空白页打开的浏览器内容没有宿主可挂（App.tsx 的门只看 paneTree）。
  if (active.paneTree) {
    surfaces.set(activePaneScopeId(activeWorkspaceId), {
      workspaceId: activePaneScopeId(activeWorkspaceId),
      ...active,
      paneTree: active.paneTree,
    })
  }

  return Array.from(surfaces.values())
}
