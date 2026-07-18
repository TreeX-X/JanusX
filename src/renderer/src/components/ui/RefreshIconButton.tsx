import type { MouseEventHandler } from 'react'
import styles from './RefreshIconButton.module.css'

interface RefreshIconButtonProps {
  accent: 'blue' | 'orange'
  label: string
  loading?: boolean
  onClick: MouseEventHandler<HTMLButtonElement>
  className?: string
}

export function RefreshIconButton({
  accent,
  label,
  loading = false,
  onClick,
  className = '',
}: RefreshIconButtonProps) {
  const accessibleLabel = loading ? `${label} in progress` : label

  return (
    <button
      type="button"
      className={`${styles.button} ${className}`.trim()}
      data-accent={accent}
      data-loading={loading ? 'true' : 'false'}
      onClick={onClick}
      disabled={loading}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6v5h-5" />
        <path d="M4 18v-5h5" />
        <path d="M6.1 9a7 7 0 0 1 11.7-2.6L20 11" />
        <path d="M17.9 15a7 7 0 0 1-11.7 2.6L4 13" />
      </svg>
    </button>
  )
}
