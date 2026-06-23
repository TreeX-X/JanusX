/**
 * @file 蓝图节点自定义卡片（React Flow node type = 'blueprint'）
 * @description 显示标题 / 状态圆点 / 进度条 / 终端指示器。详见 design §5.2。
 */

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { BlueprintNodeStatus, BlueprintNodeType } from '@/services/blueprint'
import { STATUS_VISUALS, NODE_TYPE_LABEL } from './blueprintStatus'

/** 自定义节点携带的数据 */
export interface BlueprintNodeData extends Record<string, unknown> {
  title: string
  status: BlueprintNodeStatus
  nodeType: BlueprintNodeType
  progress: number
  boundTerminalId: string | null
}

/** Blueprint 画布使用的 React Flow Node 类型 */
export type BlueprintRFNodeType = Node<BlueprintNodeData, 'blueprint'>

function BlueprintNodeCardImpl({ data, selected }: NodeProps<BlueprintRFNodeType>) {
  const d = data
  const visual = STATUS_VISUALS[d.status] ?? STATUS_VISUALS['not-started']
  const progress = Math.max(0, Math.min(100, d.progress ?? 0))

  return (
    <div className={`bp-node-card${selected ? ' bp-node-card--selected' : ''}`}>
      {/* 父连接点（顶部） */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div className="bp-node-card__header">
        <span
          className="bp-node-card__dot"
          style={{ background: visual.color, color: visual.color }}
        />
        <span className="bp-node-card__type">
          {NODE_TYPE_LABEL[d.nodeType] ?? d.nodeType}
        </span>
      </div>

      <div className="bp-node-card__title">{d.title || '(未命名)'}</div>

      <div className="bp-node-card__progress">
        <div
          className="bp-node-card__progress-bar"
          style={{ width: `${progress}%`, background: visual.color }}
        />
      </div>

      <div className="bp-node-card__footer">
        <span style={{ color: visual.color }}>{visual.label}</span>
        {d.boundTerminalId ? (
          <span className="bp-node-card__terminal" title={`终端: ${d.boundTerminalId}`}>
            term
          </span>
        ) : null}
      </div>

      {/* 子连接点（底部） */}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

export const BlueprintNodeCard = memo(BlueprintNodeCardImpl)
