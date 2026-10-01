import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import { useThemeStore } from '@/stores/theme'

interface FloatingPanelProps {
  visible: boolean
  title: string
  onClose: () => void | Promise<void>
  children: React.ReactNode
  titlebarContent?: React.ReactNode
  titlebarActions?: React.ReactNode
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
  embedded?: boolean
}

export function FloatingPanel({
  visible,
  title,
  onClose,
  children,
  titlebarContent,
  titlebarActions,
  initialWidth = 700,
  initialHeight = 500,
  minWidth = 400,
  minHeight = 300,
  embedded = false,
}: FloatingPanelProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [initialized, setInitialized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  const dragging = useRef(false)
  const resizing = useRef<'none' | 'right' | 'bottom' | 'corner'>('none')
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0, width: 0, height: 0 })
  const restoreBounds = useRef({ x: 0, y: 0, width: initialWidth, height: initialHeight })
  const panelRef = useRef<HTMLDivElement>(null)
  // Hooks 必须在 early-return 之前调用：之前 planche 判断写在 `if (!visible) return null`
  // 之后，浮动/嵌入切换时 hook 顺序漂移，主题切换后顶栏可能停留在旧配色。
  const isDark = useThemeStore((s) => s.theme) === 'dark'

  useEffect(() => {
    if (visible && !initialized) {
      const x = window.innerWidth - 280 - initialWidth - 16
      const y = Math.max(40, (window.innerHeight - 60 - 26 - initialHeight) / 2 + 40)
      setPosition({ x: Math.max(10, x), y })
      setSize({ width: initialWidth, height: initialHeight })
      setInitialized(true)
    }
  }, [visible, initialized, initialWidth, initialHeight])

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

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized || embedded) return
    if ((e.target as HTMLElement).closest('[data-floating-panel-interactive]')) return
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
  }, [embedded, isMaximized, position])

  const handleResizeStart = useCallback((e: React.MouseEvent, edge: 'right' | 'bottom' | 'corner') => {
    e.stopPropagation()
    if (isMaximized || embedded) return
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
  }, [embedded, isMaximized, position, size])

  const handleToggleMaximize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isMaximized) {
      setPosition({ x: restoreBounds.current.x, y: restoreBounds.current.y })
      setSize({ width: restoreBounds.current.width, height: restoreBounds.current.height })
      setIsMaximized(false)
      return
    }

    restoreBounds.current = { x: position.x, y: position.y, width: size.width, height: size.height }
    setPosition({ x: 8, y: 44 })
    setSize({
      width: Math.max(minWidth, window.innerWidth - 16),
      height: Math.max(minHeight, window.innerHeight - 56),
    })
    setIsMaximized(true)
  }, [isMaximized, minHeight, minWidth, position, size])

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
  const interactiveTitlebar = { WebkitAppRegion: 'no-drag', position: 'relative', zIndex: 1 } as CSSProperties
  // 顶栏与面板统一走 shell 语义令牌：planche / dark 都由 [data-theme] 提供，
  // 浮动与嵌入共用同一套，避免一端写死深灰黑导致新主题漂移。

  return (
    <div
      ref={panelRef}
      className={embedded ? 'absolute inset-0' : 'fixed'}
      style={{
        zIndex: 50,
        left: embedded ? 0 : position.x,
        top: embedded ? 0 : position.y,
        right: embedded ? 0 : undefined,
        bottom: embedded ? 0 : undefined,
        width: embedded ? '100%' : size.width,
        height: embedded ? '100%' : size.height,
        background: 'var(--shell-chrome)',
        border: '1px solid var(--shell-border)',
        borderRadius: embedded ? 0 : 12,
        boxShadow: embedded
          ? 'none'
          : isDark
            ? '0 16px 40px rgba(0, 0, 0, 0.5)'
            : '3px 3px 0 rgba(28, 52, 59, 0.22)',
        animation: embedded ? 'none' : 'file-panel-in 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center gap-3 px-3 shrink-0"
        style={{
          height: 38,
          background: 'var(--shell-pane-chrome)',
          borderBottom: '1px solid var(--shell-border)',
          cursor: isMaximized || embedded ? 'default' : 'move',
        }}
        onMouseDown={handleDragStart}
      >
        <div
          className="flex shrink-0 gap-2"
          data-floating-panel-interactive
          style={interactiveTitlebar}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
          />
          <button
            type="button"
            aria-label="Minimize panel"
            onClick={onClose}
            className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
          />
          <button
            type="button"
            aria-label={isMaximized ? 'Restore panel' : 'Maximize panel'}
            onClick={handleToggleMaximize}
            disabled={embedded}
            className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
          />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          {titlebarContent ?? (
            <span
              className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono"
              style={{ fontSize: 12, color: 'var(--shell-text)' }}
            >
              {title}
            </span>
          )}
        </div>
        {titlebarActions && (
          <div
            className="shrink-0"
            data-floating-panel-interactive
            style={interactiveTitlebar}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {titlebarActions}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden" style={{ height: '100%' }}>
        {children}
      </div>

      <div
        className="absolute top-0 right-0"
        style={{
          width: 2,
          height: '100%',
          cursor: isMaximized || embedded ? 'default' : 'ew-resize',
        }}
        onMouseDown={(e) => handleResizeStart(e, 'right')}
      />
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: '100%',
          height: 4,
          cursor: isMaximized || embedded ? 'default' : 'ns-resize',
        }}
        onMouseDown={(e) => handleResizeStart(e, 'bottom')}
      />
      <div
        className="absolute bottom-0 right-0"
        style={{
          width: 8,
          height: 8,
          cursor: isMaximized || embedded ? 'default' : 'nwse-resize',
        }}
        onMouseDown={(e) => handleResizeStart(e, 'corner')}
      />
    </div>
  )
}
