import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { layoutCompanionIslands, type CompanionLayout, type CompanionMode } from '../island/islandLayout'
import { createIslandGeometryMotion } from '../island/islandMotion'

export function useAuxiliaryIslandLayout(host: RefObject<HTMLDivElement | null>, present: boolean, closing: boolean) {
  const [layout, setLayout] = useState<CompanionLayout | null>(null)
  const previousMode = useRef<CompanionMode | undefined>(undefined)
  const exiting = useRef(closing)
  exiting.current = closing
  const apply = useRef<((animate: boolean) => void) | null>(null)
  useLayoutEffect(() => {
    const shell = host.current
    if (!present || !shell) return
    const cluster = shell.closest<HTMLElement>('.janus-island-cluster')
    const owned = [shell, cluster].filter((element): element is HTMLElement => Boolean(element))
    const properties = ['--auxiliary-main-left', '--auxiliary-main-top', '--auxiliary-main-width', '--auxiliary-main-height']
    const snapshots = owned.map(element => ({ element, mode: element.getAttribute('data-auxiliary-layout'), styles: properties.map(name => [name, element.style.getPropertyValue(name)]) }))
    const originalInert = shell.inert
    const originalHidden = shell.getAttribute('aria-hidden')
    const motion = createIslandGeometryMotion(cluster ?? shell, shell)
    const restore = () => {
      for (const { element, mode, styles } of snapshots) {
        if (mode === null) element.removeAttribute('data-auxiliary-layout'); else element.setAttribute('data-auxiliary-layout', mode)
        for (const [name, value] of styles) {
          if (value) element.style.setProperty(name, value); else element.style.removeProperty(name)
        }
      }
      shell.inert = originalInert
      if (originalHidden === null) shell.removeAttribute('aria-hidden'); else shell.setAttribute('aria-hidden', originalHidden)
    }
    const solve = (animate: boolean) => {
      if (exiting.current) { motion.apply(restore, animate); return }
      const topInset = (shell.closest('.titlebar-drag')?.getBoundingClientRect().bottom ?? 0) + 12
      const next = layoutCompanionIslands({ viewportWidth: innerWidth, viewportHeight: innerHeight,
        companionWidth: Math.min(560, Math.max(420, innerWidth * .32)), side: 'right', previousMode: previousMode.current, topInset })
      previousMode.current = next.mode
      motion.apply(() => {
        for (const element of owned) {
          element.dataset.auxiliaryLayout = next.mode
          element.style.setProperty('--auxiliary-main-left', `${next.main.left}px`)
          element.style.setProperty('--auxiliary-main-top', `${next.main.top}px`)
          element.style.setProperty('--auxiliary-main-width', `${next.main.width}px`)
          element.style.setProperty('--auxiliary-main-height', `${next.main.height}px`)
        }
      }, animate)
      shell.inert = originalInert || next.mode === 'focus'
      if (shell.inert) shell.setAttribute('aria-hidden', 'true')
      else if (originalHidden === null) shell.removeAttribute('aria-hidden')
      setLayout(next)
    }
    const resize = () => solve(false)
    apply.current = solve
    solve(true)
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => {
      motion.cancel(); restore(); previousMode.current = undefined; apply.current = null
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [host, present])
  useLayoutEffect(() => { apply.current?.(true) }, [closing])
  return layout
}
