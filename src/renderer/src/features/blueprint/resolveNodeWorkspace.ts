/**
 * @file Projected-node workspace resolution (E0-4 discounted)
 * @description Legacy nodes match the renderer registry by id directly.
 *  Projected harness nodes carry no registry id (the pure adapter cannot know
 *  renderer UUIDs, and repositories.primary needs E0-2 in P3); resolve them
 *  through the graph owners map (graphId -> checkout cwd) plus the node
 *  workspaceSnapshot path, matched against the registry by path.
 *  Pure: no stores, no IPC — the caller supplies ownerCwd from
 *  `useBlueprintStore.getState().workspacePathFor(blueprintId)`.
 *  See .agents/notes/proposed/architecture/2026-09-23-blueprint-notev2-implementation-plan.md (E0-4).
 */
import type { BlueprintNode } from '@/services/blueprint'
import type { Workspace } from '@/types'

/** Path equality tolerant to slash/case spelling variants of one checkout. */
export function sameCheckoutPath(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** Checkout identity present even when no local registry entry exists. */
export function nodeCheckoutPath(node: BlueprintNode, ownerCwd: string | null): string | null {
  return ownerCwd ?? node.workspaceSnapshot?.path ?? null
}

export function resolveNodeWorkspace(
  node: BlueprintNode,
  ownerCwd: string | null,
  workspaces: Workspace[],
): Workspace | null {
  if (node.workspaceId) {
    const direct = workspaces.find((w) => w.id === node.workspaceId)
    if (direct) return direct
  }
  if (ownerCwd) {
    const byOwners = workspaces.find((w) => w.path && sameCheckoutPath(w.path, ownerCwd))
    if (byOwners) return byOwners
  }
  const snapPath = node.workspaceSnapshot?.path
  if (snapPath) {
    const bySnapshot = workspaces.find((w) => w.path && sameCheckoutPath(w.path, snapPath))
    if (bySnapshot) return bySnapshot
  }
  return null
}
