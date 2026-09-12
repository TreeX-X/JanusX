// Note: 产物工作区 column sizing; Office-era 300~480 widened to 320~640 for md/html.
// See .agents/notes/implemented/feature/2026-09-13-product-workspace.md
export const PRODUCT_WORKSPACE_MIN_WIDTH = 320
export const PRODUCT_WORKSPACE_MAX_WIDTH = 640
export const CENTER_WORKSPACE_MIN_WIDTH = 320

export function getProductWorkspaceMaxWidth(resizableWorkspaceWidth: number): number {
  return Math.max(
    PRODUCT_WORKSPACE_MIN_WIDTH,
    Math.min(PRODUCT_WORKSPACE_MAX_WIDTH, resizableWorkspaceWidth - CENTER_WORKSPACE_MIN_WIDTH),
  )
}

export function reconcileProductWorkspaceWidth(
  currentWidth: number | null,
  renderedWidth: number,
  resizableWorkspaceWidth: number,
): { width: number; maxWidth: number } {
  const maxWidth = getProductWorkspaceMaxWidth(resizableWorkspaceWidth)
  return {
    width: Math.min(maxWidth, Math.max(PRODUCT_WORKSPACE_MIN_WIDTH, currentWidth ?? renderedWidth)),
    maxWidth,
  }
}

export function clampProductWorkspaceWidth(
  pointerX: number,
  stageRightEdge: number,
  resizableWorkspaceWidth: number,
): number {
  const maxWidth = getProductWorkspaceMaxWidth(resizableWorkspaceWidth)

  return Math.min(maxWidth, Math.max(PRODUCT_WORKSPACE_MIN_WIDTH, stageRightEdge - pointerX))
}
