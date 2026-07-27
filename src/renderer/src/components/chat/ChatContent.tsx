import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownContent({ content }: { content: string }) {
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
                title="复制"
              >
                复制
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
}

export function StreamingText({ content }: { content: string }) {
  return (
    <div className="janus-chat-streaming-text">
      {content}
      <span className="janus-chat-streaming-cursor" aria-hidden="true" />
    </div>
  )
}
