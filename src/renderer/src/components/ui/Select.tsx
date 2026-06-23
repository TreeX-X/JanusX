import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** 透传到触发按钮的 className，便于覆盖尺寸/布局 */
  className?: string
  /** 浮层额外 className */
  dropdownClassName?: string
  /** 透传到触发按钮的内联样式，便于控制尺寸 */
  style?: CSSProperties
  /** 指定浮层挂载容器，避免 Modal 内部下拉被外层遮罩覆盖 */
  getPortalContainer?: () => HTMLElement | null
}

interface DropdownPos {
  top: number
  left: number
  width: number
  openUp: boolean
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  dropdownClassName,
  style,
  getPortalContainer
}: SelectProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<DropdownPos | null>(null)

  const selected = options.find((o) => o.value === value)
  const displayLabel = selected ? selected.label : placeholder ?? ''

  // 计算浮层位置：向下展开，空间不够则向上
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const estListH = Math.min(options.length * 28 + 16, 240)
    const spaceBelow = viewportH - rect.bottom
    const openUp = spaceBelow < estListH + 8 && rect.top > estListH + 8
    const top = openUp ? rect.top - estListH : rect.bottom
    setPos({
      top,
      left: rect.left,
      width: rect.width,
      openUp
    })
  }, [open, options.length])

  // 滚动/resize 时关闭，避免定位错乱
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  // Esc 关闭 + 浮层外点击关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (listRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  const handleSelect = (o: SelectOption) => {
    if (o.disabled) return
    onChange(o.value)
    setOpen(false)
  }

  const portalContainer = getPortalContainer?.() ?? document.body

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${className ?? ''} ${
          open ? styles.triggerOpen : ''
        }`}
        style={style}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.triggerLabel}>
          {selected ? selected.label : <span className={styles.placeholder}>{placeholder ?? ''}</span>}
        </span>
        <svg
          className={styles.arrow}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            className={`${styles.dropdown} ${dropdownClassName ?? ''} ${
              pos.openUp ? styles.dropdownUp : ''
            }`}
            style={{
              top: pos.top,
              left: pos.left,
              minWidth: pos.width,
              animationDuration: '0.12s'
            }}
            role="listbox"
          >
            {options.length === 0 && (
              <div className={styles.empty}>（无选项）</div>
            )}
            {options.map((o) => {
              const isSel = o.value === value
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={isSel}
                  className={`${styles.option} ${
                    isSel ? styles.optionSelected : ''
                  } ${o.disabled ? styles.optionDisabled : ''}`}
                  onClick={() => handleSelect(o)}
                >
                  {o.label}
                </div>
              )
            })}
          </div>,
          portalContainer
        )}
    </>
  )
}

export default Select
