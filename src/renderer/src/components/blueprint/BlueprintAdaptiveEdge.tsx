import {
  BaseEdge,
  getBezierPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { getAdaptiveEdgeEndpoints } from '@/features/blueprint/adaptive-edge-geometry'

const FALLBACK_WIDTH = 240
const FALLBACK_HEIGHT = 110

type BlueprintAdaptiveEdgeType = Edge<Record<string, never>, 'blueprintAdaptive'>

export function BlueprintAdaptiveEdge({
  source,
  target,
  markerEnd,
  markerStart,
  style,
  interactionWidth,
}: EdgeProps<BlueprintAdaptiveEdgeType>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null

  const endpoints = getAdaptiveEdgeEndpoints(
    {
      ...sourceNode.internals.positionAbsolute,
      width: sourceNode.measured.width ?? FALLBACK_WIDTH,
      height: sourceNode.measured.height ?? FALLBACK_HEIGHT,
    },
    {
      ...targetNode.internals.positionAbsolute,
      width: targetNode.measured.width ?? FALLBACK_WIDTH,
      height: targetNode.measured.height ?? FALLBACK_HEIGHT,
    },
  )
  const [path] = getBezierPath({
    sourceX: endpoints.source.x,
    sourceY: endpoints.source.y,
    sourcePosition: endpoints.source.position,
    targetX: endpoints.target.x,
    targetY: endpoints.target.y,
    targetPosition: endpoints.target.position,
  })

  return (
    <BaseEdge
      path={path}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  )
}
