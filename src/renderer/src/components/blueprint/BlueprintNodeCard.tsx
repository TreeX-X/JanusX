/**
 * @file ??????????React Flow node type = 'blueprint'?
 * @description ???? / ???? / ??? / ???????? design ?5.2?
 */

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { BlueprintNodeStatus, BlueprintNodeType } from '@/services/blueprint'
import { STATUS_VISUALS, NODE_TYPE_LABEL } from './blueprintStatus'

/** ?????????? */
export interface BlueprintNodeData extends Record<string, unknown> {
  title: string
  status: BlueprintNodeStatus
  nodeType: BlueprintNodeType
  progress: number
  workspaceName: string | null
  boundTerminalId: string | null
  searchMatched?: boolean
  searchDimmed?: boolean
}

/** Blueprint ????? React Flow Node ?? */
export type BlueprintRFNodeType = Node<BlueprintNodeData, 'blueprint'>

function BlueprintNodeCardImpl({ data, selected }: NodeProps<BlueprintRFNodeType>) {
  const d = data
  const visual = STATUS_VISUALS[d.status] ?? STATUS_VISUALS['not-started']
  const progress = Math.max(0, Math.min(100, d.progress ?? 0))

  return (
    <div
      className={[
        'bp-node-card',
        selected ? 'bp-node-card--selected' : '',
        d.searchMatched ? 'bp-node-card--matched' : '',
        d.searchDimmed ? 'bp-node-card--dimmed' : ''
      ].filter(Boolean).join(' ')}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div className="bp-node-card__header">
        <span className="bp-node-card__dot" style={{ background: visual.color, color: visual.color }} />
        <span className="bp-node-card__type">{NODE_TYPE_LABEL[d.nodeType] ?? d.nodeType}</span>
      </div>

      <div className="bp-node-card__title">{d.title || <span className="bp-node-card__title--empty">Untitled</span>}</div>

      <div className="bp-node-card__progress">
        <div className="bp-node-card__progress-bar" style={{ width: `${progress}%`, background: visual.color }} />
      </div>

      <div className="bp-node-card__footer">
        <span style={{ color: visual.color }}>{visual.label}</span>
        <span className={`bp-node-card__workspace${d.workspaceName ? '' : ' bp-node-card__workspace--empty'}`}>
          {d.workspaceName ?? 'No workspace'}
        </span>
        {d.boundTerminalId ? (
          <span className="bp-node-card__terminal" title={`??: ${d.boundTerminalId}`}>
            term
          </span>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

export const BlueprintNodeCard = memo(BlueprintNodeCardImpl)
