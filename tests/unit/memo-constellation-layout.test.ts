import { describe, expect, it } from 'vitest'
import { clipStarConnection, insertionTarget, labelGeometry, placeLabels, reconcileStars, starConnection } from '../../src/renderer/src/components/memo/constellationLayout'
import { projectStar } from '../../src/renderer/src/components/memo/constellationGeometry'

describe('stable constellation layout', () => {
  it('inserts locally, preserves distant stars and leaves survivors fixed on deletion', () => {
    const original = reconcileStars(['a', 'b', 'c', 'd', 'e'])
    const inserted = reconcileStars(['a', 'b', 'new', 'c', 'd', 'e'], original)
    for (const id of ['a', 'd', 'e']) expect(inserted.points[id]).toEqual(original.points[id])
    for (const id of ['b', 'c']) expect(Math.hypot(inserted.points[id].x - original.points[id].x, inserted.points[id].y - original.points[id].y)).toBeLessThanOrEqual(18.001)
    expect(reconcileStars(inserted.order, inserted)).toEqual(inserted)
    const removed = reconcileStars(original.order, inserted)
    for (const id of original.order) expect(removed.points[id]).toEqual(inserted.points[id])
  })
  it('reorders occupied slots and keeps repeated insertion coordinates finite and distinct', () => {
    let layout = reconcileStars(['a', 'b', 'c'])
    const reordered = reconcileStars(['c', 'a', 'b'], layout)
    expect(reordered.points.c).toEqual(layout.points.a)
    for (let index = 0; index < 30; index++) layout = reconcileStars(['a', `new-${index}`, ...layout.order.slice(1)], layout)
    expect(new Set(Object.values(layout.points).map(point => `${point.x},${point.y}`)).size).toBe(33)
    expect(Object.values(layout.points).every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    const before = reconcileStars(['first', ...layout.order], layout)
    expect(before.points.first.x).toBeLessThan(layout.points.a.x)
  })
  it('resolves only adjacent edges, including visually clipped parts, at each zoom', () => {
    for (const scale of [.4, 1, 2.4]) {
      const stars = [{ id: 'a', point: { x: 100, y: 100 } }, { id: 'b', point: { x: 300, y: 150 } }, { id: 'c', point: { x: 500, y: 90 } }].map(star => ({ ...star, point: projectStar(star.point, { x: -12, y: 20, scale }) }))
      for (let index = 0; index < 2; index++) {
        const edge = starConnection(stars[index].point, stars[index + 1].point, stars[index].id)
        expect(insertionTarget(edge[7].end, stars)).toBe(stars[index].id)
      }
      expect(insertionTarget({ x: stars[0].point.x - 30, y: stars[0].point.y }, stars)).toBeNull()
      expect(insertionTarget({ x: 900, y: 600 }, stars)).toBe('c')
    }
  })
  it('keeps sampled curves outside all four directional callouts across zoom limits', () => {
    const layout = reconcileStars(Array.from({ length: 30 }, (_, i) => `node-${i}`))
    for (const scale of [.4, 1, 2.4]) {
      const stars = layout.order.map(id => ({ id, hasLabel: true, point: projectStar(layout.points[id], { x: -84, y: 36, scale }) }))
      const sides = placeLabels(stars, stars[0].id, { width: 460, height: 160 })
      const boxes = stars.flatMap(star => labelGeometry(star.point, true, sides[star.id]).boxes)
      const segments = stars.slice(1).flatMap((star, i) => clipStarConnection(starConnection(stars[i].point, star.point, stars[i].id), boxes))
      expect(segments.length).toBeGreaterThan(0)
      for (const { start, end } of segments) for (let i = 0; i <= 10; i++) {
        const x = start.x + (end.x - start.x) * i / 10, y = start.y + (end.y - start.y) * i / 10
        expect(boxes.some(box => x > box.left + .001 && x < box.right - .001 && y > box.top + .001 && y < box.bottom - .001)).toBe(false)
      }
    }
    for (const side of ['ne', 'nw', 'se', 'sw'] as const) {
      const label = labelGeometry({ x: 0, y: 0 }, true, side)
      expect(label.titleTop + 14).toBe(label.leaderY - 4)
      expect(label.labelTop).toBe(label.leaderY + 4)
      expect(label.textLeft).toBe(side.endsWith('w') ? -132 : 24)
    }
  })
})
