// Scan-reveal timing for the file tree. The overlay lives inside `.tree`, so its height is the scrollable
// content height rather than the visible viewport height; a fixed duration would make the sweep speed grow
// with the tree, so the duration scales with content height to hold the speed constant.

/** One viewport of tree takes this long to scan. */
export const SCAN_BASE_MS = 1100

/** Ceiling, so a very deep tree cannot stall the reveal. Past it the beam speeds up but still sweeps all of it. */
export const SCAN_MAX_MS = 2600

/**
 * Duration for one top-to-bottom sweep of `contentHeight` at the base speed.
 *
 * A short tree (content at or below one viewport) keeps the tuned 1100ms. A taller tree scales linearly so
 * the visible portion always takes about the same time regardless of how long the tree is — without this the
 * beam would cross a 2x viewport in the same 1100ms and finish the visible area in half the time, leaving
 * the rest of the animation running below the fold.
 */
export function resolveScanDurationMs(contentHeight: number, viewportHeight: number): number {
  if (!Number.isFinite(contentHeight) || !Number.isFinite(viewportHeight)) return SCAN_BASE_MS
  if (contentHeight <= 0 || viewportHeight <= 0) return SCAN_BASE_MS
  const scaled = (SCAN_BASE_MS * contentHeight) / viewportHeight
  return Math.round(Math.min(SCAN_MAX_MS, Math.max(SCAN_BASE_MS, scaled)))
}
