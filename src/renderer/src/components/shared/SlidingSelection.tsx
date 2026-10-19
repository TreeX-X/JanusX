import { useLayoutEffect, useState, type RefObject } from 'react'

interface Geometry { left: number; top: number; width: number; height: number }

/** One backdrop follows layout positions, independent of drag preview transforms. */
export function SlidingSelection({ containerRef, activeId, itemAttribute, layoutKey, hidden = false, className, testId }: {
  containerRef: RefObject<HTMLDivElement>
  activeId: string | null
  itemAttribute: 'data-tab-id' | 'data-rail-tool'
  layoutKey: string
  hidden?: boolean
  className: string
  testId: string
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const items = Array.from(container.querySelectorAll<HTMLElement>(`[${itemAttribute}]`))
    const measure = () => {
      const item = items.find((item) => item.getAttribute(itemAttribute) === activeId)
      const next = item ? { left: item.offsetLeft, top: item.offsetTop, width: item.offsetWidth, height: item.offsetHeight } : null
      setGeometry((current) => current?.left === next?.left && current?.top === next?.top
        && current?.width === next?.width && current?.height === next?.height ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    items.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [containerRef, activeId, itemAttribute, layoutKey, hidden])

  return <span aria-hidden="true" className={className} data-testid={testId}
    data-visible={!hidden && geometry !== null}
    style={{ width: geometry?.width ?? 0, height: geometry?.height ?? 0,
      transform: `translate3d(${geometry?.left ?? 0}px, ${geometry?.top ?? 0}px, 0)` }} />
}
