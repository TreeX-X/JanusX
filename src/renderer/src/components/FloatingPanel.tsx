import { useState, useRef, useEffect, useCallback } from 'react'

interface FloatingPanelProps {
  visible: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
}

export function FloatingPanel({
  visible,
  title,
  onClose,
  children,
  initialWidth = 700,
  initialHeight = 500,
  minWidth = 400,
  minHeight = 300,
}: FloatingPanelProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [initialized, setInitialized] = useState(false)

  const dragging = useRef(false)
  const resizing = useRef<'none' | 'right' | 'bottom' | 'corner'>('none')
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0, width: 0, height: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  // Initialize position on first show
  useEffect(() => {
    if (visible && !initialized) {
      const x = window.innerWidth - 280 - initialWidth - 16
      const y = Math.max(40, (window.innerHeight - 60 - 26 - initialHeight) / 2 + 40)
      setPosition({ x: Math.max(10, x), y })
      setSize({ width: initialWidth, height: initialHeight })
      setInitialized(true)
    }
  }, [visible, initialized, initialWidth, initialHeight])

  // ESC key handler
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, onClose])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
      width: 0,
      height: 0,
    }
    document.body.style.userSelect = 'none'
  }, [position])

  const handleResizeStart = useCallback((e: React.MouseEvent, edge: 'right' | 'bottom' | 'corner') => {
    e.stopPropagation()
    resizing.current = edge
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
      width: size.width,
      height: size.height,
    }
    document.body.style.userSelect = 'none'
  }, [position, size])

  // Global mouse handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        const newX = Math.max(0, Math.min(window.innerWidth - 100, dragStart.current.posX + dx))
        const newY = Math.max(0, Math.min(window.innerHeight - 36, dragStart.current.posY + dy))
        setPosition({ x: newX, y: newY })
      }
      if (resizing.current !== 'none') {
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        let newWidth = dragStart.current.width
        let newHeight = dragStart.current.height
        if (resizing.current === 'right' || resizing.current === 'corner') {
          newWidth = Math.max(minWidth, Math.min(window.innerWidth - 40, dragStart.current.width + dx))
        }
        if (resizing.current === 'bottom' || resizing.current === 'corner') {
          newHeight = Math.max(minHeight, Math.min(window.innerHeight - 80, dragStart.current.height + dy))
        }
        setSize({ width: newWidth, height: newHeight })
      }
    }

    const handleMouseUp = () => {
      dragging.current = false
      resizing.current = 'none'
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minWidth, minHeight])

  if (!visible) return null

  return (
    <div
      ref={panelRef}
      className="fixed"
      style={{
        zIndex: 50,
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        background: 'rgba(22, 22, 22, 0.97)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
        animation: 'file-panel-in 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center px-3 shrink-0"
        style={{
          height: 36,
          background: 'rgba(16, 16, 16, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          cursor: 'move',
        }}
        onMouseDown={handleDragStart}
      >
        <span
          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono"
          style={{ fontSize: 12, color: '#d4d4d4' }}
        >
          {title}
        </span>
        <button
          className="ml-2 shrink-0 transition-colors"
          style={{ fontSize: 16, color: '#666', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ff5858' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#666' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden" style={{ height: '100%' }}>
        {children}
      </div>

      {/* Resize handles */}
      {/* Right edge */}
      <div
        className="absolute top-0 right-0"
        style={{
          width: 2,
          height: '100%',
          cursor: 'ew-resize',
        }}
        onMouseDown={(e) => handleResizeStart(e, 'right')}
      />
      {/* Bottom edge */}
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: '100%',
          height: 4,
          cursor: 'ns-resize',
        }}
        onMouseDown={(e) => handleResizeStart(e, 'bottom')}
      />
      {/* Right-bottom corner */}
      <div
        className="absolute bottom-0 right-0"
        style={{
          width: 8,
          height: 8,
          cursor: 'nwse-resize',
        }}
        onMouseDown={(e) => handleResizeStart(e, 'corner')}
      />
    </div>
  )
}
