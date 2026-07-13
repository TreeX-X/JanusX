export interface PopoverAnchorRect {
  top: number
  bottom: number
  left: number
  width: number
}

export interface PopoverSize {
  width: number
  height: number
}

export interface PopoverPosition {
  top: number
  left: number
  placement: 'above' | 'below'
}

const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getContextPopoverPosition(
  anchor: PopoverAnchorRect,
  popover: PopoverSize,
  viewport: PopoverSize,
): PopoverPosition {
  const spaceAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN
  const spaceBelow = viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN
  const placement = popover.height <= spaceAbove || spaceAbove >= spaceBelow ? 'above' : 'below'
  const desiredTop = placement === 'above'
    ? anchor.top - ANCHOR_GAP - popover.height
    : anchor.bottom + ANCHOR_GAP

  return {
    top: clamp(desiredTop, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.height - popover.height - VIEWPORT_MARGIN)),
    left: clamp(
      anchor.left + anchor.width / 2 - popover.width / 2,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewport.width - popover.width - VIEWPORT_MARGIN),
    ),
    placement,
  }
}
