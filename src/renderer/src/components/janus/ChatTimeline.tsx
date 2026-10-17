// Note: ordered display only; business effects remain in controllers — see .agents/notes/agent/requirements/chat-work-timeline.md
import type { ReactNode } from 'react'
import type { ChatTimelineSnapshot, ChatToolBlock } from '../../../../shared/chat-timeline'
import { MarkdownContent, StreamingText } from '../chat/ChatContent'
import { ThinkingRegion } from './ThinkingRegion'
import { ToolCallCard } from './ToolCallCard'
import { useI18n } from '@/i18n/useI18n'

export interface ChatTimelineProps {
  snapshot: ChatTimelineSnapshot
  streaming?: boolean
  workspaceNames: Map<string, string>
  renderToolDetails?: (block: ChatToolBlock) => ReactNode
}

export function ChatTimeline({ snapshot, streaming = false, workspaceNames, renderToolDetails }: ChatTimelineProps) {
  const { t } = useI18n('janus')
  // Only text followed by an actual tool call is known to be a work update.
  // Keep the trailing answer in the normal palette, without guessing from its words.
  const lastToolIndex = snapshot.blocks.reduce((last, block, index) => block.kind === 'tool' ? index : last, -1)
  return <div className="janus-chat-timeline">
    {snapshot.truncated && <p role="status">{t('janus:chat.timeline.truncated')}</p>}
    {snapshot.blocks.map((block, index) => {
      const active = streaming && block.endedAt === undefined
      return <div key={block.id} className="janus-chat-timeline-block" data-kind={block.kind} data-phase={block.kind === 'text' ? index < lastToolIndex ? 'process' : 'answer' : undefined} data-call-id={block.kind === 'tool' ? block.callId : undefined}>
        {block.kind === 'reasoning' ? <ThinkingRegion streaming={active} startedAt={block.startedAt} preview={block.preview}
          snapshot={{ text: block.text, chars: block.chars, truncated: !!block.truncated,
            ...(block.endedAt === undefined ? {} : { durationMs: Math.max(0, block.endedAt - block.startedAt) }) }} />
          : block.kind === 'text' ? <>
            {active ? <StreamingText content={block.text} /> : <MarkdownContent content={block.text} />}
            {block.truncated && <p role="status">{t('janus:chat.timeline.truncated')}</p>}
          </> : block.kind === 'tool' ? <>
            <ToolCallCard entry={block.entry} workspaceNames={workspaceNames} />
            {renderToolDetails?.(block)}
            {block.details?.filter(detail => detail.kind === 'config').map(detail => <div key={detail.id} className="janus-chat-tool-result" data-config-state={detail.applied ? 'applied' : detail.operation === 'read' ? 'read' : detail.operation === 'apply' ? 'not-applied' : 'draft'}>
              <strong>{t(detail.applied ? 'janus:chat.timeline.configApplied' : detail.operation === 'read' ? 'janus:chat.timeline.configRead' : detail.operation === 'apply' ? 'janus:chat.timeline.configNotApplied' : 'janus:chat.timeline.configDraft')}</strong>
              <p>{detail.summary}</p>
              <span>{t(detail.valid ? 'janus:chat.timeline.valid' : 'janus:chat.timeline.invalid')}</span>
              {!!detail.errors.length && <ul>{detail.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
              {!!detail.warnings.length && <ul>{detail.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
            </div>)}
          </> : null}
      </div>
    })}
  </div>
}
