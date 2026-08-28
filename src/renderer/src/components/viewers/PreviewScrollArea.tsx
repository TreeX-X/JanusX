import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export function PreviewScrollArea({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState({ top: 0, height: 0 })
  const [expanded, setExpanded] = useState(false)
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null)

  const sync = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const max = viewport.scrollHeight - viewport.clientHeight
    if (max <= 0) {
      setThumb({ top: 0, height: 0 })
      return
    }
    const height = Math.max(28, (viewport.clientHeight / viewport.scrollHeight) * viewport.clientHeight)
    setThumb({ top: (viewport.scrollTop / max) * (viewport.clientHeight - height), height })
  }, [])

  useEffect(() => {
    sync()
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(sync)
    observer.observe(viewport)
    observer.observe(viewport.firstElementChild ?? viewport)
    return () => observer.disconnect()
  }, [sync])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (!viewport || thumb.height <= 0) return
    event.preventDefault()
    setExpanded(true)
    dragRef.current = { startY: event.clientY, startTop: thumb.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const drag = dragRef.current
    if (!viewport || !drag) return
    const track = viewport.clientHeight - thumb.height
    const top = Math.max(0, Math.min(track, drag.startTop + event.clientY - drag.startY))
    viewport.scrollTop = (top / track) * (viewport.scrollHeight - viewport.clientHeight)
    sync()
  }

  return (
    <div
      className={`preview-scroll-area${expanded ? ' is-expanded' : ''}`}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setExpanded(event.clientX >= rect.right - 20 || dragRef.current !== null)
      }}
      onMouseLeave={() => { if (!dragRef.current) setExpanded(false) }}
    >
      <div ref={viewportRef} className="preview-scroll-viewport" onScroll={sync}>
        {children}
      </div>
      {thumb.height > 0 && (
        <div
          className="preview-scrollbar-track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragRef.current = null }}
        >
          <div className="preview-scrollbar-thumb" style={{ top: thumb.top, height: thumb.height }} />
        </div>
      )}
    </div>
  )
}
