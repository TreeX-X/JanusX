// Note: 隐藏滚动条的横向标签条由滚轮驱动，竖向滚轮换轴、触控板横向手势走原生 — see .agents/notes/workbench/preview-editor-display-style.md
const DOM_DELTA_PIXEL = 0
const DOM_DELTA_LINE = 1
const LINE_HEIGHT_PX = 16

type WheelDeltaSource = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>

/**
 * 横向标签条上的滚轮横向滚动量；返回 null 表示留给原生处理
 * （触控板横向手势 / 平台已换轴的 shift+滚轮本身就能横向滚，不再叠加）。
 */
export function resolveWheelScrollXDelta(event: WheelDeltaSource, viewportWidth: number): number | null {
  if (event.deltaY === 0) return null
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return null
  const scale = event.deltaMode === DOM_DELTA_LINE
    ? LINE_HEIGHT_PX
    : event.deltaMode === DOM_DELTA_PIXEL
      ? 1
      : Math.max(1, viewportWidth)
  return event.deltaY * scale
}

/**
 * 竖向滚轮换轴驱动横向滚动；只在真正滚动时接管事件，到边后放行给父级链，
 * 空闲条（无溢出）完全不拦截。
 */
export function attachWheelScrollX(element: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    const delta = resolveWheelScrollXDelta(event, element.clientWidth)
    if (delta === null) return
    const max = element.scrollWidth - element.clientWidth
    if (max <= 0) return
    const next = Math.min(max, Math.max(0, element.scrollLeft + delta))
    if (next === element.scrollLeft) return
    event.preventDefault()
    element.scrollLeft = next
  }
  element.addEventListener('wheel', onWheel, { passive: false })
  return () => element.removeEventListener('wheel', onWheel)
}

/** 选中项变化时把 tab 滚入可视区（最小位移），不触碰祖先滚动容器。 */
export function revealStripItem(element: HTMLElement, itemAttribute: string, activeId: string | null): void {
  if (!activeId) return
  const items = Array.from(element.querySelectorAll<HTMLElement>(`[${itemAttribute}]`))
  const item = items.find((node) => node.getAttribute(itemAttribute) === activeId)
  if (!item) return
  const margin = 2
  const start = item.offsetLeft - margin
  const end = item.offsetLeft + item.offsetWidth + margin
  if (start < element.scrollLeft) element.scrollLeft = Math.max(0, start)
  else if (end > element.scrollLeft + element.clientWidth) {
    element.scrollLeft = Math.min(element.scrollWidth - element.clientWidth, end - element.clientWidth)
  }
}
