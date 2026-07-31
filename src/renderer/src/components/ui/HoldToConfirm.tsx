import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createHoldToConfirmController, isHoldConfirmKey } from '@/lib/hold-to-confirm'
import styles from './HoldToConfirm.module.css'

const DEFAULT_HOLD_DURATION_MS = 1000

interface HoldToConfirmProps {
  as?: 'button' | 'span'
  children: ReactNode
  className?: string
  disabled?: boolean
  label: string
  onConfirm: () => void
  style?: CSSProperties
}

export function HoldToConfirm({
  as = 'button', children, className = '', disabled = false, label,
  onConfirm, style,
}: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false)
  const confirmRef = useRef(onConfirm)
  confirmRef.current = onConfirm

  const controllerRef = useRef<ReturnType<typeof createHoldToConfirmController> | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createHoldToConfirmController({
      durationMs: DEFAULT_HOLD_DURATION_MS,
      onStart: () => setHolding(true),
      onCancel: () => setHolding(false),
      onConfirm: () => {
        setHolding(false)
        confirmRef.current()
      },
    })
  }

  useEffect(() => () => controllerRef.current?.dispose(), [])

  const start = () => {
    if (!disabled) controllerRef.current?.start()
  }
  const cancel = () => controllerRef.current?.cancel()
  const sharedProps = {
    'aria-label': `${label}，长按确认`,
    title: `${label}（长按确认）`,
    className: `${styles.control} ${holding ? styles.holding : ''} ${className}`,
    style: { ...style, '--hold-duration': `${DEFAULT_HOLD_DURATION_MS}ms` } as CSSProperties,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      start()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onBlur: cancel,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (!isHoldConfirmKey(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) start()
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLElement>) => {
      if (!isHoldConfirmKey(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      cancel()
    },
  }

  if (as === 'span') {
    return (
      <span {...sharedProps} role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}>
        <span aria-hidden="true">{children}</span>
      </span>
    )
  }

  return (
    <button {...sharedProps} type="button" disabled={disabled}>
      <span aria-hidden="true">{children}</span>
    </button>
  )
}
