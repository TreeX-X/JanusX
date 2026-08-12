/**
 * @file ??????????React Flow node type = 'blueprint'?
 * @description ???? / ???? / ??? / ???????? design ?5.2?
 */

import { createContext, memo, useContext } from 'react'
import { Handle, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import type { BlueprintNodeStatus, BlueprintNodeType } from '@/services/blueprint'
import { STATUS_VISUALS, NODE_TYPE_LABEL_KEY } from './blueprintStatus'
import { useI18n } from '@/i18n/useI18n'

/** 低于该缩放阈值时卡片进入极简渲染（只保留状态点 + 标题 + 折叠入口） */
const SEMANTIC_ZOOM_THRESHOLD = 0.5

/** 画布注入的卡片交互；脱离画布上下文（如测试）时为 null，卡片隐藏折叠入口 */
export const BlueprintCardActionsContext = createContext<{
  toggleCollapse: (nodeId: string) => void
} | null>(null)

/** ?????????? */
export interface BlueprintNodeData extends Record<string, unknown> {
  title: string
  status: BlueprintNodeStatus
  nodeType: BlueprintNodeType
  progress: number
  workspaceName: string | null
  boundTerminalId: string | null
  childCount?: number
  collapsed?: boolean
  childSummary?: string
  issueSummary?: string
  blockedReason?: string
  analysisSummary?: string
  collapsedSummary?: string
  searchMatched?: boolean
  searchDimmed?: boolean
}

/** Blueprint ????? React Flow Node ?? */
export type BlueprintRFNodeType = Node<BlueprintNodeData, 'blueprint'>

function BlueprintNodeCardImpl({ id, data, selected }: NodeProps<BlueprintRFNodeType>) {
  const { t } = useI18n('blueprint')
  const d = data
  const actions = useContext(BlueprintCardActionsContext)
  const minimal = useStore((s) => s.transform[2] < SEMANTIC_ZOOM_THRESHOLD)
  const visual = STATUS_VISUALS[d.status] ?? STATUS_VISUALS['not-started']
  const progress = Math.max(0, Math.min(100, d.progress ?? 0))
  const childCount = d.childCount ?? 0
  const collapsed = d.collapsed ?? false

  return (
    <div
      className={[
        'bp-node-card',
        `bp-node-card--type-${d.nodeType}`,
        minimal ? 'bp-node-card--minimal' : '',
        selected ? 'bp-node-card--selected' : '',
        d.searchMatched ? 'bp-node-card--matched' : '',
        d.searchDimmed ? 'bp-node-card--dimmed' : ''
      ].filter(Boolean).join(' ')}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div className="bp-node-card__header">
        <span className="bp-node-card__dot" style={{ background: visual.color, color: visual.color }} />
        {minimal ? null : (
          <span className="bp-node-card__type">{NODE_TYPE_LABEL_KEY[d.nodeType] ? t(NODE_TYPE_LABEL_KEY[d.nodeType]) : d.nodeType}</span>
        )}
        {childCount > 0 && actions ? (
          <button
            type="button"
            className="bp-node-card__collapse nodrag"
            onClick={(e) => { e.stopPropagation(); actions.toggleCollapse(id) }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-expanded={!collapsed}
            aria-label={collapsed
              ? t('blueprint:nodeCard.expandSubtree', { count: childCount })
              : t('blueprint:nodeCard.collapseSubtree', { count: childCount })}
            title={collapsed
              ? t('blueprint:nodeCard.expandSubtree', { count: childCount })
              : t('blueprint:nodeCard.collapseSubtree', { count: childCount })}
          >
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
            {childCount}
          </button>
        ) : null}
      </div>

      <div className="bp-node-card__title">{d.title || <span className="bp-node-card__title--empty">{t('blueprint:nodeCard.untitled')}</span>}</div>

      {minimal ? null : (
        <>
          <div className="bp-node-card__progress">
            <div className="bp-node-card__progress-bar" style={{ width: `${progress}%`, background: visual.color }} />
          </div>

          <div className="bp-node-card__footer">
            <span style={{ color: visual.color }}>{t(visual.labelKey)}</span>
            <span className={`bp-node-card__workspace${d.workspaceName ? '' : ' bp-node-card__workspace--empty'}`}>
              {d.workspaceName ?? t('blueprint:nodeCard.noWorkspace')}
            </span>
            {d.boundTerminalId ? (
              <span className="bp-node-card__terminal" title={t('blueprint:nodeCard.terminalAria', { id: d.boundTerminalId })}>
                term
              </span>
            ) : null}
          </div>
          {(d.childSummary || d.issueSummary || d.blockedReason || d.analysisSummary || d.collapsedSummary) ? (
            <div className="bp-node-card__signals" aria-label={t('blueprint:nodeCard.signalsAria')}>
              {d.childSummary ? <span>{d.childSummary}</span> : null}
              {d.issueSummary ? <span className="bp-node-card__signal--risk">{d.issueSummary}</span> : null}
              {d.blockedReason ? <span className="bp-node-card__signal--blocked">{t('blueprint:nodeCard.blocked')}</span> : null}
              {d.analysisSummary ? <span className="bp-node-card__signal--analysis">{d.analysisSummary}</span> : null}
              {d.collapsedSummary ? <span className="bp-node-card__signal--collapsed">{d.collapsedSummary}</span> : null}
            </div>
          ) : null}
        </>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

export const BlueprintNodeCard = memo(BlueprintNodeCardImpl)
