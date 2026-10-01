export type IslandStage = 'collapsed' | 'peek' | 'expanded'
export type IslandInteractionAction = 'replay-knowledge' | 'collapse' | 'expand' | 'none'

const INTERACTIVE_DESCENDANT_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
].join(',')

export function isInteractiveIslandDescendant(target: EventTarget | null, island: Element): boolean {
  if (!(target instanceof Element)) return false
  const interactiveElement = target.closest(INTERACTIVE_DESCENDANT_SELECTOR)
  return interactiveElement !== null && interactiveElement !== island && island.contains(interactiveElement)
}

export function getSingleActivationAction(stage: IslandStage): IslandInteractionAction {
  if (stage === 'collapsed') return 'replay-knowledge'
  if (stage === 'peek') return 'collapse'
  return 'none'
}

export function getDoubleActivationAction(stage: IslandStage): IslandInteractionAction {
  return stage === 'expanded' ? 'collapse' : 'expand'
}

export type SingleActivationIntent = 'open-product' | 'default'

/**
 * A live product notice claims the single activation: clicking the island in
 * collapsed or peek stage opens the product workspace directly instead of
 * replaying/collapsing the capsule. The knowledge surface (recall result or
 * empty capsule) keeps its collapse semantics while it presents — the product
 * capsule yields to it visually, so the click must follow what is displayed.
 */
export function getSingleActivationIntent(input: {
  stage: IslandStage
  productNoticeAlive: boolean
  knowledgePresenting: boolean
}): SingleActivationIntent {
  if (input.stage !== 'expanded' && input.productNoticeAlive && !input.knowledgePresenting) {
    return 'open-product'
  }
  return 'default'
}

export function isDoubleTap(previousTapTime: number, now: number, delay: number): boolean {
  return previousTapTime > 0 && now - previousTapTime < delay
}

export interface TapPoint {
  x: number
  y: number
}

export function isDoubleTapWithinTolerance(
  previousTapTime: number,
  now: number,
  delay: number,
  previousPoint: TapPoint | null,
  currentPoint: TapPoint,
  tolerance: number,
): boolean {
  if (!isDoubleTap(previousTapTime, now, delay) || !previousPoint) return false
  return Math.hypot(currentPoint.x - previousPoint.x, currentPoint.y - previousPoint.y) <= tolerance
}

/* ════════════════════════════════════════════════════════════
   Island window persistence + drag (expanded stage, all views)
   Pure helpers so the geometry/policy stays unit-testable;
   the components own DOM + localStorage side effects.
   ════════════════════════════════════════════════════════════ */

export interface IslandDragOffset {
  x: number
  y: number
}

export interface IslandViewport {
  width: number
  height: number
}

export interface IslandPanelSize {
  width: number
  height: number
}

/** Grab strips kept visible so a dragged panel can always be recovered. */
export const ISLAND_DRAG_KEEP_X = 120
export const ISLAND_DRAG_TOP_KEEP = 64
export const ISLAND_DRAG_MIN_Y = -8

/** Clamp an island-window drag offset. With the panel size known, the window
 *  may dock against any viewport edge while keeping a grab strip visible;
 *  without it (e.g. rehydrating a persisted offset), fall back to
 *  conservative centered-panel bounds. Pure: everything is injected. */
export function clampIslandDragOffset(
  offset: IslandDragOffset,
  viewport: IslandViewport,
  panel?: IslandPanelSize,
): IslandDragOffset {
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return { x: 0, y: 0 }
  if (!(viewport.width > 0) || !(viewport.height > 0)) return { x: 0, y: 0 }
  const maxX = panel && panel.width > 0
    ? Math.max(0, viewport.width / 2 + panel.width / 2 - ISLAND_DRAG_KEEP_X)
    : Math.max(0, viewport.width / 2 - 140)
  const maxY = panel && panel.height > 0
    ? Math.max(0, viewport.height - 12 - ISLAND_DRAG_TOP_KEEP)
    : Math.max(0, viewport.height - 140)
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(ISLAND_DRAG_MIN_Y, offset.y)),
  }
}

/** Implicit dismiss (outside click / Esc / terminal switch) is suppressed
 *  while the island window is pinned, whatever view it shows. Explicit
 *  collapse (double-activate) always goes through, so a pinned window can
 *  still return to the capsule in one gesture. */
export function shouldSuppressIslandDismiss(input: {
  stage: IslandStage
  islandPinned: boolean
}): boolean {
  return input.stage === 'expanded' && input.islandPinned
}
