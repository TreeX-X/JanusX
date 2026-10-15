import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import './islandMotion.css'

export const ISLAND_MOTION_MS = 220
const easing = 'cubic-bezier(.2,.7,.2,1)'
export type IslandPhase = 'closed' | 'entering' | 'open' | 'closing'
export const islandMotionStyle = { '--island-motion-duration': `${ISLAND_MOTION_MS}ms`, '--island-motion-easing': easing } as CSSProperties
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Keep exit content mounted; reverse transitions cancel their old cleanup. */
export function useIslandPresence(open: boolean) {
  const [phase, setPhase] = useState<IslandPhase>('closed')
  useLayoutEffect(() => {
    let first = 0
    let second = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const settle = () => { if (media.matches) setPhase(open ? 'open' : 'closed') }
    if (media.matches) settle()
    else if (open) {
      setPhase('entering')
      first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPhase('open')) })
    } else {
      setPhase(current => current === 'closed' ? current : 'closing')
      timer = setTimeout(() => setPhase('closed'), ISLAND_MOTION_MS)
    }
    media.addEventListener('change', settle)
    return () => {
      cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(timer)
      media.removeEventListener('change', settle)
    }
  }, [open])
  return { present: open || phase !== 'closed', phase }
}

/** Reveal visible content only; neither focus nor business state is changed. */
export function useIslandReveal(root: RefObject<HTMLElement | null>, visible: boolean, identity: string) {
  useEffect(() => {
    if (!visible || reducedMotion()) return
    const animations: Animation[] = []
    const frame = requestAnimationFrame(() => {
      const element = root.current
      if (!element) return
      const bounds = element.getBoundingClientRect()
      let count = 0
      for (const child of element.querySelectorAll<HTMLElement>('[data-island-reveal]')) {
        const box = child.getBoundingClientRect()
        if (box.right < bounds.left || box.left > bounds.right || box.bottom < bounds.top || box.top > bounds.bottom) continue
        const frames = child.getAttribute('data-island-reveal') === 'line'
          ? [{ opacity: 0, strokeDashoffset: '1' }, { opacity: 1, strokeDashoffset: '0' }]
          : [{ opacity: 0 }, { opacity: 1 }]
        animations.push(child.animate(frames, {
          duration: 180, delay: Math.min(count++, 8) * 18, fill: 'backwards', easing: 'ease-out',
        }))
      }
    })
    return () => { cancelAnimationFrame(frame); animations.forEach(animation => animation.cancel()) }
  }, [root, visible, identity])
}

/** Present the solved geometry without feeding intermediate animation boxes back into layout. */
export function createIslandGeometryMotion(moving: HTMLElement | null, shell: HTMLElement | null) {
  const animations: Animation[] = []
  const cancel = () => { animations.splice(0).forEach(animation => animation.cancel()) }
  const apply = (change: () => void, animate: boolean) => {
    const before = moving?.getBoundingClientRect()
    const beforeShell = shell?.getBoundingClientRect()
    cancel()
    change()
    if (!animate || !moving || !before || reducedMotion()) return
    const after = moving.getBoundingClientRect()
    const transform = getComputedStyle(moving).transform
    if (before.left !== after.left || before.top !== after.top) animations.push(moving.animate([
      { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) ${transform === 'none' ? '' : transform}` },
      { transform },
    ], { duration: ISLAND_MOTION_MS, easing }))
    if (shell && beforeShell) {
      const afterShell = shell.getBoundingClientRect()
      if (beforeShell.width !== afterShell.width || beforeShell.height !== afterShell.height) animations.push(shell.animate([
        { width: `${beforeShell.width}px`, height: `${beforeShell.height}px` },
        { width: `${afterShell.width}px`, height: `${afterShell.height}px` },
      ], { duration: ISLAND_MOTION_MS, easing }))
    }
  }
  return { apply, cancel }
}
