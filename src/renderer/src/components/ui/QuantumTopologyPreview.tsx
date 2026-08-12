import { useMemo } from 'react'
import { useI18n } from '@/i18n/useI18n'
import styles from './QuantumTopologyPreview.module.css'

interface QuantumTopologyPreviewProps {
  seed: string
  name?: string
  size?: 'icon' | 'sm' | 'md' | 'lg'
  active?: boolean
  showTag?: boolean
  className?: string
}

function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return Math.abs(hash)
}

interface NodePoint {
  id: number
  x: number
  y: number
  r: number
  type: 'primary' | 'secondary' | 'accent'
}

interface EdgeLine {
  from: NodePoint
  to: NodePoint
}

export function QuantumTopologyPreview({
  seed,
  name,
  size = 'sm',
  active = false,
  showTag = false,
  className = '',
}: QuantumTopologyPreviewProps) {
  const { t } = useI18n('common')
  const { nodes, edges, hexTag } = useMemo(() => {
    const rawHash = hashString(seed + (name ?? ''))
    const hex = (rawHash % 0xff).toString(16).padStart(2, '0').toUpperCase()

    // Determine number of nodes (4 to 6)
    const nodeCount = 4 + (rawHash % 3)
    const generatedNodes: NodePoint[] = []

    const margin = 18
    const innerWidth = 100 - margin * 2
    const innerHeight = 100 - margin * 2

    for (let i = 0; i < nodeCount; i++) {
      const nodeHash = hashString(`${seed}-node-${i}`)
      const x = margin + (nodeHash % innerWidth)
      const y = margin + (hashString(`${nodeHash}-y`) % innerHeight)
      const r = i === 0 ? 5.5 : 3.5 + (nodeHash % 3) * 0.8
      const type: NodePoint['type'] = i === 0 ? 'primary' : nodeHash % 4 === 0 ? 'accent' : 'secondary'

      generatedNodes.push({ id: i, x, y, r, type })
    }

    // Connect primary node to all other nodes, plus random adjacent connections
    const generatedEdges: EdgeLine[] = []
    const primary = generatedNodes[0]!

    for (let i = 1; i < generatedNodes.length; i++) {
      generatedEdges.push({ from: primary, to: generatedNodes[i]! })
    }

    // Extra cross edge
    if (generatedNodes.length >= 4) {
      const extraHash = hashString(`${seed}-extra`)
      const n1 = generatedNodes[1 + (extraHash % (generatedNodes.length - 1))]!
      const n2 = generatedNodes[1 + ((extraHash + 1) % (generatedNodes.length - 1))]!
      if (n1 !== n2) {
        generatedEdges.push({ from: n1, to: n2 })
      }
    }

    return {
      nodes: generatedNodes,
      edges: generatedEdges,
      hexTag: `0x${hex}`,
    }
  }, [seed, name])

  const dimensions = {
    icon: { width: 18, height: 18 },
    sm: { width: 24, height: 24 },
    md: { width: 36, height: 36 },
    lg: { width: 48, height: 48 },
  }[size]

  return (
    <div
      className={`${styles.topologyContainer} ${active ? styles.topologyActive : ''} ${className}`}
      style={{ width: dimensions.width, height: dimensions.height }}
      title={name ? t('common:quantumTopology.titleWithName', { name, hexTag }) : t('common:quantumTopology.titleNoName', { hexTag })}
      aria-label={t('common:quantumTopology.ariaLabel')}
    >
      <svg className={styles.topologySvg} viewBox="0 0 100 100">
        <defs>
          <radialGradient id={`topoGrad-${seed}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f3ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0a0f18" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Glow */}
        <circle cx="50" cy="50" r="45" fill={`url(#topoGrad-${seed})`} />

        {/* Topology Edges */}
        {edges.map((edge, idx) => (
          <line
            key={`e-${idx}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            className={styles.topologyEdge}
          />
        ))}

        {/* Topology Nodes */}
        {nodes.map((node) => {
          const nodeClass =
            node.type === 'primary'
              ? styles.topologyNodePrimary
              : node.type === 'accent'
                ? styles.topologyNodeAccent
                : styles.topologyNodeSecondary

          return (
            <circle
              key={`n-${node.id}`}
              cx={node.x}
              cy={node.y}
              r={node.r}
              className={`${styles.topologyNode} ${nodeClass}`}
            />
          )
        })}
      </svg>

      {showTag && (size === 'md' || size === 'lg') && (
        <span className={styles.metaOverlay}>{hexTag}</span>
      )}
    </div>
  )
}
