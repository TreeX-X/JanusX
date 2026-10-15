import { annotationClearance, clearConnection, type ConstellationPoint as Point, type ConstellationRect as Rect, type ConstellationSegment as Segment } from './constellationGeometry'

export interface StarLayout { order: string[]; points: Record<string, Point> }
export type LabelSide = 'ne' | 'se' | 'nw' | 'sw'
const seed = (id: string) => { let value = 2166136261; for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0) / 4294967295 }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** A stable, irregular walk: changes of direction follow available space, not a fixed row count. */
function appendPosition(id: string, previous: Point, before?: Point): Point {
  const variation = seed(id)
  const direction = before && previous.x < before.x ? -1 : 1
  const x = previous.x + direction * (108 + variation * 50)
  if (x > 570 || x < 44) return { x: previous.x - direction * (24 + variation * 38), y: previous.y + 126 + variation * 45 }
  return { x, y: Math.max(64, previous.y + (variation - .43) * 92) }
}

export function reconcileStars(ids: string[], previous?: StarLayout): StarLayout {
  const points: Record<string, Point> = {}
  const surviving = previous?.order.filter(id => ids.includes(id)) ?? []
  const nextSurviving = ids.filter(id => previous?.points[id])
  // Reordering permutes occupied places; renaming and selection do not change geometry.
  nextSurviving.forEach((id, index) => { points[id] = previous!.points[surviving[index]] })
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index]
    if (points[id]) continue
    const before = points[ids[index - 1]]
    const after = ids.slice(index + 1).map(key => points[key]).find(Boolean)
    if (!before && !after) points[id] = { x: 52, y: 92 }
    else if (!after) points[id] = appendPosition(id, before, points[ids[index - 2]])
    else if (!before) points[id] = { x: after.x - 114, y: after.y + 34 + seed(id) * 28 }
    else {
      const length = distance(before, after) || 1
      const normal = { x: -(after.y - before.y) / length, y: (after.x - before.x) / length }
      const midpoint = { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 }
      const candidates = [54, -54, 88, -88, 124, -124].map(offset => ({ x: midpoint.x + normal.x * offset, y: midpoint.y + normal.y * offset }))
      points[id] = candidates.reduce((best, candidate) => {
        const score = (point: Point) => Object.values(points).reduce((sum, other) => sum + Math.max(0, 74 - distance(point, other)) ** 2, 0) + distance(point, midpoint) * .05
        return score(candidate) < score(best) ? candidate : best
      })
      // Make a little breathing room locally; distant identities retain their exact positions.
      const push = Math.max(0, Math.min(18, (150 - length) / 2))
      points[ids[index - 1]] = { x: before.x - (after.x - before.x) / length * push, y: before.y - (after.y - before.y) / length * push }
      const afterId = ids.slice(index + 1).find(key => points[key])!
      points[afterId] = { x: after.x + (after.x - before.x) / length * push, y: after.y + (after.y - before.y) / length * push }
    }
  }
  return { order: [...ids], points }
}

/** Sample one shallow quadratic; drawing, insertion and clipping all consume this geometry. */
export function starConnection(start: Point, end: Point, id: string): Segment[] {
  const length = distance(start, end)
  if (!length) return []
  const bend = (seed(id) - .5) * Math.min(30, length * .18)
  const control = { x: (start.x + end.x) / 2 - (end.y - start.y) / length * bend, y: (start.y + end.y) / 2 + (end.x - start.x) / length * bend }
  const points = Array.from({ length: 17 }, (_, index) => {
    const t = index / 16, s = 1 - t
    return { x: s * s * start.x + 2 * s * t * control.x + t * t * end.x, y: s * s * start.y + 2 * s * t * control.y + t * t * end.y }
  })
  return points.slice(1).map((end, index) => ({ start: points[index], end }))
}

export function clipStarConnection(segments: Segment[], obstacles: Rect[]): Segment[] {
  return segments.flatMap(({ start, end }) => clearConnection(start, end, obstacles, .01))
}

export function pointOnConnection(point: Point, segments: Segment[]) {
  let best = { distance: Infinity, t: 0, point }
  segments.forEach(({ start, end }, index) => {
    const dx = end.x - start.x, dy = end.y - start.y
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)))
    const closest = { x: start.x + dx * t, y: start.y + dy * t }
    const gap = distance(point, closest)
    if (gap < best.distance) best = { distance: gap, t: (index + t) / segments.length, point: closest }
  })
  return best
}

export function insertionTarget(point: Point, stars: Array<{ id: string; point: Point }>): string | null {
  if (!stars.length) return null
  let best = { distance: 34, afterId: undefined as string | undefined }
  stars.slice(1).forEach((star, index) => {
    const result = pointOnConnection(point, starConnection(stars[index].point, star.point, stars[index].id))
    if (result.t > .06 && result.t < .94 && result.distance < best.distance) best = { distance: result.distance, afterId: stars[index].id }
  })
  if (best.afterId) return best.afterId
  const first = stars[0].point, next = stars[1]?.point ?? { x: first.x + 100, y: first.y }
  if (distance(point, first) < 100 && (point.x - first.x) * (next.x - first.x) + (point.y - first.y) * (next.y - first.y) < 0) return null
  return stars.at(-1)!.id
}

export function labelGeometry(point: Point, hasLabel: boolean, side: LabelSide = 'ne') {
  const left = side.endsWith('w'), below = side.startsWith('s')
  const direction = left ? -1 : 1
  const leaderY = below ? 30 : -16
  const textLeft = left ? -132 : 24
  const titleTop = leaderY - 18, labelTop = leaderY + 4
  const base = annotationClearance({ x: 0, y: 0 }, hasLabel)
  const boxes = base.map(box => {
    // Vertical translation moves the callout only; the diagonal always starts at the star.
    const translated = { left: left ? -box.right : box.left, right: left ? -box.left : box.right,
      top: box.top + (below ? 46 : 0), bottom: box.bottom + (below ? 46 : 0) }
    return { left: point.x + translated.left, right: point.x + translated.right, top: point.y + translated.top, bottom: point.y + translated.bottom }
  })
  boxes[0] = { left: point.x + (left ? -24 : 2), right: point.x + (left ? -2 : 24), top: point.y + Math.min(0, leaderY) - 4, bottom: point.y + Math.max(0, leaderY) + 4 }
  return { side, textLeft, titleTop, labelTop, leaderY, boxes, path: `M ${6 * direction} 0 L ${20 * direction} ${leaderY} H ${132 * direction}` }
}

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

export function placeLabels(stars: Array<{ id: string; point: Point; hasLabel: boolean }>, selectedId: string | null, viewport: { width: number; height: number }): Record<string, LabelSide> {
  const occupied: Rect[] = stars.map(({ point }) => ({ left: point.x - 17, right: point.x + 17, top: point.y - 17, bottom: point.y + 17 }))
  const result: Record<string, LabelSide> = {}
  const edges = stars.slice(1).flatMap((star, index) => starConnection(stars[index].point, star.point, stars[index].id))
  const ordered = [...stars].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId))
  for (const star of ordered) {
    const candidates: LabelSide[] = ['ne', 'se', 'nw', 'sw']
    const score = (side: LabelSide) => {
      const boxes = labelGeometry(star.point, star.hasLabel, side).boxes.slice(1)
      return boxes.reduce((sum, box) => sum + occupied.reduce((total, other) => total + overlap(box, other), 0) * 8 +
        Math.max(0, -box.left) * 4 + Math.max(0, box.right - viewport.width) * 4 + Math.max(0, -box.top) * 4 + Math.max(0, box.bottom - viewport.height) * 4 +
        edges.filter(edge => pointOnConnection({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }, [edge]).distance < 18).length * 10, 0)
    }
    const side = candidates.reduce((best, next) => score(next) < score(best) ? next : best)
    result[star.id] = side
    occupied.push(...labelGeometry(star.point, star.hasLabel, side).boxes)
  }
  return result
}
