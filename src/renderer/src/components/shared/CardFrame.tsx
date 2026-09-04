import { useCallback, useEffect, useReducer } from 'react'

/**
 * Shared card-workbench primitives (Phase 4, §9).
 * Extracted from `BlueprintWorkbench`'s `requestClose` + `hidden/open/closing`
 * state machine so blueprint and knowledge workbenches share one lifecycle:
 * frame open/close, skeleton placeholder, grid-track card index helper, and
 * a reduced-motion escape hatch. No business logic lives here.
 */

export type WorkbenchPhase = 'hidden' | 'open' | 'closing'

type PhaseAction =
  | { type: 'open' }
  | { type: 'parent-closed' }
  | { type: 'request-close' }
  | { type: 'exit-finished' }

export interface PhaseEvent {
  /** Fired exactly once when the workbench reaches `hidden` from `closing`. */
  onHidden?: () => void
}

/**
 * Pure phase reducer (unit-tested): reopening while closing returns to
 * `open` without emitting hidden; `exit-finished` is a no-op unless closing.
 */
export function workbenchPhaseReducer(
  phase: WorkbenchPhase,
  action: PhaseAction,
  events?: PhaseEvent,
): WorkbenchPhase {
  switch (action.type) {
    case 'open':
      return 'open'
    case 'parent-closed':
      return phase === 'hidden' ? 'hidden' : 'closing'
    case 'request-close':
      return phase === 'hidden' ? 'hidden' : 'closing'
    case 'exit-finished':
      if (phase !== 'closing') return phase
      events?.onHidden?.()
      return 'hidden'
  }
}

export interface UseWorkbenchPhaseOptions {
  /**
   * Fallback close path for workbenches that unmount on a timer instead of an
   * animation-end event (the knowledge workbench closes after `exitMs`).
   * Animation-driven workbenches set this false and call `handleExitFinished`
   * from `onAnimationEnd`, with `exitMs` kept as a stuck-animation safety net.
   */
  awaitAnimation?: boolean
  /** Exit duration in ms; also the safety-net timeout when awaiting animation. */
  exitMs?: number
  onClose?: () => void
}

const DEFAULT_EXIT_MS = 320

/**
 * Owns the hidden/open/closing lifecycle for a card workbench.
 * Returns `rendered` (portal alive), `isClosing`, `requestClose`, and
 * `handleExitFinished` for `onAnimationEnd` wiring.
 */
export function useWorkbenchPhase(
  isOpen: boolean,
  { awaitAnimation = false, exitMs = DEFAULT_EXIT_MS, onClose }: UseWorkbenchPhaseOptions = {},
) {
  const [phase, dispatch] = useReducer(
    (current: WorkbenchPhase, action: PhaseAction) =>
      workbenchPhaseReducer(current, action, { onHidden: onClose }),
    isOpen ? 'open' : 'hidden',
  )

  useEffect(() => {
    dispatch({ type: isOpen ? 'open' : 'parent-closed' })
  }, [isOpen])

  // Timer close path (or safety net when awaiting a stuck animation).
  useEffect(() => {
    if (phase !== 'closing') return
    const wait = awaitAnimation ? exitMs + 500 : exitMs
    const timer = setTimeout(() => dispatch({ type: 'exit-finished' }), wait)
    return () => clearTimeout(timer)
  }, [phase, awaitAnimation, exitMs])

  const requestClose = useCallback(() => dispatch({ type: 'request-close' }), [])
  const handleExitFinished = useCallback(() => dispatch({ type: 'exit-finished' }), [])

  return {
    phase,
    rendered: phase !== 'hidden',
    isClosing: phase === 'closing',
    requestClose,
    handleExitFinished,
  }
}

/** Grid-track card index helper for staggered enter/exit (`--card-index`). */
export function cardIndexStyle(index: number): { '--card-index': number } {
  return { '--card-index': index } as { '--card-index': number }
}

/** Prefers-reduced-motion probe (SSR-safe; Electron renderer always has matchMedia). */
export function useReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function CardSkeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className="card-frame-skeleton" role="status" aria-label={label}>
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span key={index} className="card-frame-skeleton-line" style={{ width: `${92 - index * 13}%` }} />
      ))}
    </div>
  )
}
