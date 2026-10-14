import { useLayoutEffect, useRef, useState } from 'react'
import { reducedMotion } from '../island/islandMotion'
import type { ConstellationPoint } from './constellationGeometry'
import type { StarLayout } from './constellationLayout'

export type StarBirth = { id: string; origin: ConstellationPoint }

/** Stars and connections are projected from the same animated positions on every frame. */
export function useConstellationMotion(layout: StarLayout, birth: StarBirth | null, visible: boolean) {
  const [points, setPoints] = useState(layout.points)
  const current = useRef(points)
  const [moving, setMoving] = useState(false)
  const [completedBirth, setCompletedBirth] = useState<StarBirth | null>(null)
  const consumedBirth = useRef<StarBirth | null>(null)
  useLayoutEffect(() => {
    const freshBirth = birth !== consumedBirth.current ? birth : null
    consumedBirth.current = birth
    const from = Object.fromEntries(layout.order.map(id => [id, freshBirth?.id === id ? freshBirth.origin : current.current[id] ?? layout.points[id]]))
    let frame = 0
    const publish = (next: typeof points) => { current.current = next; setPoints(next) }
    const finish = () => { cancelAnimationFrame(frame); publish(layout.points); setMoving(false); setCompletedBirth(birth) }
    const changed = layout.order.some(id => Math.hypot(from[id].x - layout.points[id].x, from[id].y - layout.points[id].y) > .1)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!visible || reducedMotion() || !changed) { finish(); return }
    setMoving(true)
    publish(from)
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 380), eased = 1 - (1 - t) ** 3
      const next = Object.fromEntries(layout.order.map(id => {
        const start = from[id], end = layout.points[id]
        return [id, { x: start.x + (end.x - start.x) * eased, y: start.y + (end.y - start.y) * eased - (birth?.id === id ? Math.sin(Math.PI * eased) * 18 : 0) }]
      }))
      publish(next)
      if (t < 1) frame = requestAnimationFrame(tick)
      else { setMoving(false); setCompletedBirth(birth) }
    }
    frame = requestAnimationFrame(tick)
    const changedPreference = () => { if (media.matches) finish() }
    media.addEventListener('change', changedPreference)
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', changedPreference) }
  }, [layout, birth, visible])
  return { points, moving, completedBirth }
}
