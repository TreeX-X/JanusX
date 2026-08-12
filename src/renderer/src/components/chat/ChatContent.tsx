import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useI18n } from '@/i18n/useI18n'

/**
 * memo：流式期间父组件每次 delta 都会重渲染整个消息列表，
 * 历史消息 content 不变时跳过 react-markdown 的整段重解析（audit P1）。
 */
export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const { t } = useI18n('common')
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: ({ className, children }) => {
          const isInline = !className
          const codeText = String(children).replace(/\n$/, '')
          if (isInline) return <code className="janus-chat-inline-code">{children}</code>
          return (
            <div className="janus-chat-code-block">
              <button
                className="janus-chat-copy-code"
                onClick={() => navigator.clipboard.writeText(codeText).catch(() => {})}
                title={t('common:chat.copy')}
              >
                {t('common:chat.copy')}
              </button>
              <code>{children}</code>
            </div>
          )
        },
        pre: ({ children }) => <pre className="janus-chat-pre">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

export function StreamingText({ content }: { content: string }) {
  return (
    <div className="janus-chat-streaming-text">
      {content}
      <span className="janus-chat-streaming-cursor" aria-hidden="true" />
    </div>
  )
}
