export const OFFICE_PREVIEW_MIN_WIDTH = 300
export const OFFICE_PREVIEW_MAX_WIDTH = 480
export const CENTER_WORKSPACE_MIN_WIDTH = 320

export function getOfficePreviewMaxWidth(resizableWorkspaceWidth: number): number {
  return Math.max(
    OFFICE_PREVIEW_MIN_WIDTH,
    Math.min(OFFICE_PREVIEW_MAX_WIDTH, resizableWorkspaceWidth - CENTER_WORKSPACE_MIN_WIDTH),
  )
}

export function reconcileOfficePreviewWidth(
  currentWidth: number | null,
  renderedWidth: number,
  resizableWorkspaceWidth: number,
): { width: number; maxWidth: number } {
  const maxWidth = getOfficePreviewMaxWidth(resizableWorkspaceWidth)
  return {
    width: Math.min(maxWidth, Math.max(OFFICE_PREVIEW_MIN_WIDTH, currentWidth ?? renderedWidth)),
    maxWidth,
  }
}

export function clampOfficePreviewWidth(
  pointerX: number,
  officeRightEdge: number,
  resizableWorkspaceWidth: number,
): number {
  const maxWidth = getOfficePreviewMaxWidth(resizableWorkspaceWidth)

  return Math.min(maxWidth, Math.max(OFFICE_PREVIEW_MIN_WIDTH, officeRightEdge - pointerX))
}
