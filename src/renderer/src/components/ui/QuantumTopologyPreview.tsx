import { useI18n } from '@/i18n/useI18n'
import styles from './QuantumTopologyPreview.module.css'

/** 卡片品类（与 KnowledgeCardKind 对齐，未知回落为 fact 圆点）。 */
export type KnowledgeMarkKind = 'fact' | 'wiki' | 'observation' | 'graph' | string

interface QuantumTopologyPreviewProps {
  kind?: KnowledgeMarkKind
  name?: string
  size?: 'icon' | 'sm' | 'md' | 'lg'
  className?: string
  /** 保留旧签名兼容：种子不再驱动构图，仅透传为 className 备用 */
  seed?: string
  active?: boolean
  showTag?: boolean
}

const KIND_CLASS: Record<string, string> = {
  fact: styles.kindFact,
  wiki: styles.kindWiki,
  observation: styles.kindObservation,
  graph: styles.kindGraph,
}

/* 石板手绘标：单线条、微不对称、圆头笔触，fill 只给实心圆点。 */
function MarkPaths({ kind }: { kind: string }) {
  switch (kind) {
    case 'wiki':
      return (
        <>
          <path d="M8.2 4.6 L16.4 5.3 L15.9 17.6 L7.7 16.9 Z" />
          <path d="M5 7.6 L7.6 7.3 M4.8 10.6 L7.2 10.4" />
        </>
      )
    case 'observation':
      return (
        <>
          <path d="M3.6 12.1 C6.6 7.6 10 6.1 12 6.1 C14 6.1 17.4 7.6 20.4 12.1 C17.4 16.4 14 17.9 12 17.9 C10 17.9 6.6 16.4 3.6 12.1 Z" />
          <circle cx="12" cy="12" r="1.6" className={styles.markDot} />
        </>
      )
    case 'graph':
      return (
        <>
          <path d="M6.2 15.8 L11.8 7.4 L17.9 14.8 Z" />
          <circle cx="6" cy="16.2" r="1.4" className={styles.markDot} />
          <circle cx="12" cy="7" r="1.4" className={styles.markDot} />
          <circle cx="18" cy="15.2" r="1.4" className={styles.markDot} />
        </>
      )
    case 'fact':
    default:
      return (
        <>
          <path d="M12 4.9 C16.4 5 19.1 7.7 19 12 C18.9 16.3 16.2 19.1 11.9 19 C7.7 18.9 5 16.2 5.1 11.9 C5.2 7.6 7.8 4.8 12 4.9 Z" />
          <circle cx="12" cy="12" r="1.6" className={styles.markDot} />
        </>
      )
  }
}

const DIMENSIONS = {
  icon: { width: 18, height: 18 },
  sm: { width: 24, height: 24 },
  md: { width: 36, height: 36 },
  lg: { width: 48, height: 48 },
} as const

export function QuantumTopologyPreview({
  kind = 'fact',
  name,
  size = 'sm',
  className = '',
}: QuantumTopologyPreviewProps) {
  const { t } = useI18n('common')
  const dimensions = DIMENSIONS[size] ?? DIMENSIONS.sm
  const kindClass = KIND_CLASS[kind] ?? KIND_CLASS.fact

  return (
    <span
      className={`${styles.mark} ${kindClass} ${className}`}
      style={{ width: dimensions.width, height: dimensions.height }}
      title={name}
      aria-label={t('common:quantumTopology.ariaLabel')}
      aria-hidden={name ? undefined : 'true'}
    >
      <svg className={styles.markSvg} viewBox="0 0 24 24" aria-hidden="true">
        <MarkPaths kind={KIND_CLASS[kind] ? kind : 'fact'} />
      </svg>
    </span>
  )
}

export default QuantumTopologyPreview
