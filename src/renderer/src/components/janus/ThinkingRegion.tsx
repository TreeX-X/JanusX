/**
 * @file 思维链收纳区 —— 只活在对话加载效果区内，默认收起。
 * @description 流式中显示“思考中…N字”进度行，结束后收起为“已思考 N 字”一行；
 *              点击才展开限定高度的滚动区。无 reasoning 时渲染 null，
 *              与现状视图完全一致。推理永不计入正文，仅 UI 展示。
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { ReasoningSnapshot } from './janusReasoning'

export interface ThinkingRegionProps {
  snapshot: ReasoningSnapshot
  streaming: boolean
}

export function ThinkingRegion({ snapshot, streaming }: ThinkingRegionProps) {
  const { t } = useI18n('janus')
  const [expanded, setExpanded] = useState(false)
  if (snapshot.chars === 0) return null

  return (
    <div className="janus-chat-thinking" data-streaming={streaming}>
      <button
        type="button"
        className="janus-chat-thinking-toggle"
        aria-expanded={expanded}
        aria-label={t('janus:chat.thinking.label')}
        title={expanded ? t('janus:chat.thinking.collapseTitle') : t('janus:chat.thinking.expandTitle')}
        onClick={() => setExpanded((value) => !value)}
      >
        {streaming
          ? <LoaderCircle size={11} className="janus-runtime-tool-spinner" aria-hidden="true" />
          : expanded
            ? <ChevronDown size={11} aria-hidden="true" />
            : <ChevronRight size={11} aria-hidden="true" />}
        <span>{streaming
          ? t('janus:chat.thinking.streaming', { n: snapshot.chars })
          : t('janus:chat.thinking.done', { n: snapshot.chars })}</span>
      </button>
      {expanded && (
        <div className="janus-chat-thinking-body" role="note" aria-label={t('janus:chat.thinking.label')}>
          <pre>{snapshot.text}{snapshot.truncated ? t('janus:chat.thinking.truncated') : ''}</pre>
        </div>
      )}
    </div>
  )
}
