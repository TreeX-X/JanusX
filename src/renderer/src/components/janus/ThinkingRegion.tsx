/**
 * @file 思维链收纳区 —— 只活在对话加载效果区内，默认收起。
 * @description 流式中显示“思考中…N字”进度行，结束后收起为“已思考 N 字”一行；
 *              点击才展开限定高度的滚动区。无 reasoning 时渲染 null，
 *              与现状视图完全一致。推理永不计入正文，仅 UI 展示。
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import {
  extractThinkingGist,
  extractThinkingLiveTail,
  formatThinkingDuration,
  type ReasoningSnapshot,
} from './janusReasoning'

// Note: agentX Activity/thinking parity (elapsed + collapsed live tail) — see .agents/notes/2026-09-26-janus-chat-feedback-parity--54b1046a.md
export interface ThinkingRegionProps {
  snapshot: ReasoningSnapshot
  streaming: boolean
  /** 本轮开始时间（毫秒时间戳；流式中用于实时计时，落库后用 snapshot.durationMs）。 */
  startedAt?: number | null
}

function useNowWhileStreaming(streaming: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!streaming) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [streaming])
  return now
}

export function ThinkingRegion({ snapshot, streaming, startedAt = null }: ThinkingRegionProps) {
  const { t } = useI18n('janus')
  const [expanded, setExpanded] = useState(false)
  const now = useNowWhileStreaming(streaming)
  if (snapshot.chars === 0) return null

  const liveDurationMs = streaming && typeof startedAt === 'number'
    ? Math.max(0, now - startedAt)
    : null
  const doneDurationMs = !streaming && typeof snapshot.durationMs === 'number' ? snapshot.durationMs : null
  const durationMs = streaming ? liveDurationMs : doneDurationMs
  const durationText = typeof durationMs === 'number' ? formatThinkingDuration(durationMs) : null
  const gist = extractThinkingGist(snapshot.text)
  const liveTail = streaming ? extractThinkingLiveTail(snapshot.text) : ''

  const baseLabel = streaming
    ? t('janus:chat.thinking.streaming', { n: snapshot.chars })
    : t('janus:chat.thinking.done', { n: snapshot.chars })
  const headerText = [baseLabel, durationText, gist].filter(Boolean).join(' · ')

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
        <span>{headerText}</span>
      </button>
      {!expanded && streaming && liveTail && (
        <div className="janus-chat-thinking-live" aria-live="polite">
          <span>{liveTail}</span>
          <span className="janus-chat-streaming-cursor" aria-hidden="true" />
        </div>
      )}
      {expanded && (
        <div className="janus-chat-thinking-body" role="note" aria-label={t('janus:chat.thinking.label')}>
          <pre>{snapshot.text}{snapshot.truncated ? t('janus:chat.thinking.truncated') : ''}</pre>
        </div>
      )}
    </div>
  )
}
