import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createIslandGeometryMotion } from '../island/islandMotion'
import { layoutMemoIslands, layoutMemoPanel, MEMO_PANEL_MARGIN, type MemoIslandLayout, type MemoIslandMode, type MemoIslandPane } from './memoLayout'

/** Own only local geometry variables; closing or switching views restores the host. */
export function useMemoIslandLayout(trigger: RefObject<HTMLButtonElement | null>, open: boolean, filesCollapsed: boolean, exiting = false) {
  const [placement, setPlacement] = useState<MemoIslandLayout | null>(null)
  const [active, setActive] = useState(false)
  const [pane, setPane] = useState<MemoIslandPane>('memo')
  const previousMode = useRef<MemoIslandMode | undefined>(undefined)
  const options = useRef({ filesCollapsed, pane, exiting })
  options.current = { filesCollapsed, pane, exiting }
  const applyLayout = useRef<((animate?: boolean) => void) | null>(null)

  useLayoutEffect(() => {
    if (!open) { setActive(false); previousMode.current = undefined; return }
    const island = trigger.current?.closest<HTMLElement>('.janus-island-shell')
    const anchor = island ?? trigger.current?.closest<HTMLElement>('.janus-chat')
    if (!anchor) return
    const cluster = island?.closest<HTMLElement>('.janus-island-cluster')
    const owned = [island, cluster].filter((element): element is HTMLElement => Boolean(element))
    const properties = ['--memo-main-left', '--memo-main-top', '--memo-main-width', '--memo-main-height']
    const snapshots = owned.map(element => ({
      element,
      mode: element.getAttribute('data-memo-layout'),
      pane: element.getAttribute('data-memo-pane'),
      styles: properties.map(name => [name, element.style.getPropertyValue(name)]),
    }))
    const originalInert = island?.inert ?? false
    const originalHidden = island?.getAttribute('aria-hidden') ?? null
    const motion = createIslandGeometryMotion(cluster ?? island ?? null, island ?? null)
    const geometry = motion.apply
    const restore = () => {
      for (const { element, mode, pane: originalPane, styles } of snapshots) {
        if (mode === null) element.removeAttribute('data-memo-layout'); else element.setAttribute('data-memo-layout', mode)
        if (originalPane === null) element.removeAttribute('data-memo-pane'); else element.setAttribute('data-memo-pane', originalPane)
        for (const [name, value] of styles) {
          if (value) element.style.setProperty(name, value); else element.style.removeProperty(name)
        }
      }
      if (island) {
        island.inert = originalInert
        if (originalHidden === null) island.removeAttribute('aria-hidden'); else island.setAttribute('aria-hidden', originalHidden)
      }
    }
    const layout = (animate = false) => {
      const { filesCollapsed, pane, exiting } = options.current
      if (island && (island.dataset.stage !== 'expanded' || island.dataset.view !== 'chat')) {
        restore(); setActive(false); return
      }
      if (!island && trigger.current?.offsetParent === null) { setActive(false); return }
      if (exiting) { geometry(restore, animate); return }
      let next: MemoIslandLayout
      if (island) {
        const titlebarBottom = island.closest('.titlebar-drag')?.getBoundingClientRect().bottom ?? 0
        next = layoutMemoIslands({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, filesCollapsed, previousMode: previousMode.current, topInset: titlebarBottom + MEMO_PANEL_MARGIN })
        let visiblePane = pane
        if (next.mode === 'focus' && previousMode.current !== 'focus') {
          if (document.activeElement?.closest('.memo-panel')) visiblePane = 'memo'
          else if (document.activeElement?.closest('.janus-chat')) visiblePane = 'chat'
          if (visiblePane !== pane) setPane(visiblePane)
        }
        previousMode.current = next.mode
        geometry(() => { for (const element of owned) {
          element.dataset.memoLayout = next.mode
          element.dataset.memoPane = visiblePane
          element.style.setProperty('--memo-main-left', `${next.main.left}px`)
          element.style.setProperty('--memo-main-top', `${next.main.top}px`)
          element.style.setProperty('--memo-main-width', `${next.main.width}px`)
          element.style.setProperty('--memo-main-height', `${next.main.height}px`)
        } }, animate)
        island.inert = originalInert || (next.mode === 'focus' && visiblePane === 'memo')
        if (island.inert) island.setAttribute('aria-hidden', 'true')
        else if (originalHidden === null) island.removeAttribute('aria-hidden')
        else island.setAttribute('aria-hidden', originalHidden)
      } else {
        const rect = anchor.getBoundingClientRect()
        const { box } = layoutMemoPanel({ hostLeft: rect.left, hostWidth: rect.width, hostTop: rect.top, hostHeight: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight })
        next = { mode: 'parallel', main: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, memo: box, compactFiles: filesCollapsed || box.width < 460 }
      }
      setPlacement(next)
      setActive(true)
    }
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => layout()) }
    const mutation = new MutationObserver(schedule)
    mutation.observe(anchor, { attributes: true, attributeFilter: ['data-stage', 'data-view', 'hidden'] })
    const resize = new ResizeObserver(schedule)
    if (!island) resize.observe(anchor)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    applyLayout.current = layout
    layout(true)
    return () => {
      cancelAnimationFrame(frame)
      motion.cancel()
      applyLayout.current = null
      mutation.disconnect(); resize.disconnect()
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      restore()
    }
  }, [trigger, open])
  useLayoutEffect(() => { applyLayout.current?.(true) }, [filesCollapsed, pane, exiting])

  return { placement, active, pane, setPane }
}
