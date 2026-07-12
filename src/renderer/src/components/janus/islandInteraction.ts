export type IslandStage = 'collapsed' | 'peek' | 'expanded'
export type IslandInteractionAction = 'replay-knowledge' | 'collapse' | 'expand' | 'none'

export function getSingleActivationAction(stage: IslandStage): IslandInteractionAction {
  if (stage === 'collapsed') return 'replay-knowledge'
  if (stage === 'peek') return 'collapse'
  return 'none'
}

export function getDoubleActivationAction(stage: IslandStage): IslandInteractionAction {
  return stage === 'expanded' ? 'collapse' : 'expand'
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
