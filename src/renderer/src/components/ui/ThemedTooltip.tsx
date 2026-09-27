import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './ThemedTooltip.module.css'

interface ThemedTooltipProps {
  /** 提示文本（替代原生 title，原生黑框由系统绘制，主题够不着） */
  label: string
  children: ReactNode
  /** 首选方位；空间不足自动翻转 */
  placement?: 'top' | 'bottom'
  /** 悬浮多久后出现（毫秒，对齐原生 tooltip 节奏） */
  delayMs?: number
  disabled?: boolean
}

interface TipGeometry {
  left: number
  top?: number
  bottom?: number
}

/**
 * 主题化悬浮提示：一键配置机制——底座吃语义令牌，纸面走 :global 加法层。
 * 锚点 `display: contents`，不改变原布局；浮层挂 body portal，
 * 上方空间不足 48px 自动翻到下方；滚动/resize/Esc 关闭。
 */
export function ThemedTooltip({
  label,
  children,
  placement = 'top',
  delayMs = 350,
  disabled = false,
}: ThemedTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const [geometry, setGeometry] = useState<TipGeometry | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const hide = useCallback(() => {
    clearTimer()
    setGeometry(null)
  }, [])

  const show = () => {
    if (disabled || !label) return
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      // display: contents 自身无盒，量第一个子元素
      const target = anchorRef.current?.firstElementChild ?? anchorRef.current
      const rect = target?.getBoundingClientRect()
      if (!rect || (rect.width === 0 && rect.height === 0)) return
      const left = Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8))
      const below = placement === 'bottom' || (placement === 'top' && rect.top < 48)
      setGeometry(
        below
          ? { left, top: rect.bottom + 8 }
          : { left, bottom: window.innerHeight - rect.top + 8 },
      )
    }, delayMs)
  }

  useEffect(() => {
    if (geometry === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [geometry, hide])

  useEffect(() => clearTimer, [])

  return (
    <>
      <span
        ref={anchorRef}
        className={styles.anchor}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {geometry !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={styles.tip}
            role="tooltip"
            style={{
              left: geometry.left,
              ...(geometry.top !== undefined ? { top: geometry.top } : { bottom: geometry.bottom }),
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  )
}

export default ThemedTooltip
