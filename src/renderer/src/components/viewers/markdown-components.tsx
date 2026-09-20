/**
 * @file 共享的 Markdown 渲染组件样式
 * @description
 *  统一 MarkdownViewer / 产物工作区 LocalFileStage / QuickNote / 聊天区 MarkdownContent 的渲染外观。
 *  调用方：`<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>`，
 *  外层包一层 `className="markdown-preview"`（聊天区同时保留 `janus-chat-message-content`）即可吃到
 *  markdown-preview.css 里的斑马纹 / hover / 滚动条增强。
 */

import { isValidElement, useState, type CSSProperties, type ReactNode } from 'react'
import type { Components } from 'react-markdown'
import { useLocalAssetAbsolutePath, useLocalAssetUrl } from './local-asset'

const CODE_FONT = "'Cascadia Code', 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace"
const PROSE_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif"

function getCodeText(children: ReactNode): string {
  if (typeof children === 'string') return children.replace(/\n$/, '')
  if (Array.isArray(children)) return children.map((child) => getCodeText(child)).join('')
  if (isValidElement<{ children?: ReactNode }>(children)) return getCodeText(children.props.children)
  return ''
}

function getLanguage(className?: string): string {
  const match = /language-([\w+-]+)/.exec(className ?? '')
  return match?.[1] ?? ''
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="md-codeblock-copy"
      aria-label={copied ? '已复制代码' : '复制代码'}
      onClick={() => {
        if (!text) return
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {})
      }}
      style={{
        background: copied ? 'rgba(255, 120, 48, 0.18)' : 'rgba(255, 255, 255, 0.07)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 4,
        color: copied ? '#ffb37a' : '#aaa',
        fontSize: 10,
        lineHeight: 1,
        padding: '4px 8px',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function CodeBlockFrame({ children }: { children: ReactNode }) {
  const codeElement = Array.isArray(children) ? children[0] : children
  const language = isValidElement<{ className?: string }>(codeElement)
    ? getLanguage(codeElement.props.className)
    : ''
  const text = getCodeText(children)
  return (
    <div
      className="md-codeblock"
      style={{
        background: '#101013',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 8,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 10px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.09)',
        }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', fontFamily: CODE_FONT }}>
          {language || 'code'}
        </span>
        <CopyButton text={text} />
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 480,
        }}
      >
        {children}
      </pre>
    </div>
  )
}

const thStyle: CSSProperties = {
  border: '1px solid rgba(255, 255, 255, 0.14)',
  padding: '8px 12px',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#fff',
  fontWeight: 700,
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  border: '1px solid rgba(255, 255, 255, 0.11)',
  padding: '8px 12px',
  color: '#d4d4d4',
  lineHeight: 1.6,
  verticalAlign: 'top',
}

function ResolvedMarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const absolutePath = useLocalAssetAbsolutePath(src)
  const resolved = useLocalAssetUrl(src)
  // Local files load through `file:readBinary` into a `data:` URL because the
  // renderer cannot reach workspace paths directly. While a local asset is
  // still loading the `src` stays unset so a relative path never fires a
  // broken request against the app bundle; remote URLs render immediately.
  const pendingLocal = Boolean(absolutePath && !resolved)
  return (
    <img
      src={pendingLocal ? undefined : resolved}
      alt={alt ?? ''}
      loading="lazy"
      style={{
        maxWidth: '100%',
        height: 'auto',
        display: 'block',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.12)',
        margin: '10px 0',
        background: '#000',
      }}
    />
  )
}

export const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 12, marginTop: 20, lineHeight: 1.3, paddingBottom: 8, borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ color: '#f0f0f0', fontSize: 18, fontWeight: 700, marginBottom: 10, marginTop: 18, lineHeight: 1.35, paddingBottom: 6, borderBottom: '1px solid rgba(255, 255, 255, 0.09)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ color: '#e8e8e8', fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 16, lineHeight: 1.35 }}>
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700, marginBottom: 6, marginTop: 14, lineHeight: 1.4 }}>
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 style={{ color: '#d4d4d4', fontSize: 12, fontWeight: 700, marginBottom: 6, marginTop: 12, lineHeight: 1.4 }}>
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 style={{ color: '#aaa', fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 12, lineHeight: 1.4 }}>
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.75, marginBottom: 10, fontFamily: PROSE_FONT, overflowWrap: 'break-word' }}>
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    <a href={href} style={{ color: '#ff9159', textDecoration: 'none', overflowWrap: 'break-word' }}>
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: '#e0e0e0' }}>{children}</em>
  ),
  del: ({ children }) => (
    <del style={{ color: '#888' }}>{children}</del>
  ),
  img: ({ src, alt }) => <ResolvedMarkdownImage src={src} alt={alt ?? ''} />,
  input: ({ checked }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      readOnly
      style={{ accentColor: '#ff7830', width: 13, height: 13, marginRight: 6, verticalAlign: -2 }}
    />
  ),
  code: ({ className, children }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          style={{
            background: 'rgba(255, 120, 48, 0.13)',
            border: '1px solid rgba(255, 120, 48, 0.28)',
            borderRadius: 4,
            padding: '1px 5px',
            fontSize: 12,
            color: '#ffb37a',
            fontFamily: CODE_FONT,
            overflowWrap: 'break-word',
          }}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className={className}
        style={{
          fontFamily: CODE_FONT,
          fontSize: 12,
          lineHeight: 1.7,
          color: '#e6e6e6',
          whiteSpace: 'pre',
        }}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => <CodeBlockFrame>{children}</CodeBlockFrame>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: '3px solid #ff7830',
        background: 'rgba(255, 120, 48, 0.06)',
        borderRadius: '0 6px 6px 0',
        padding: '10px 12px',
        color: '#b5b5b5',
        margin: '0 0 12px',
        fontFamily: PROSE_FONT,
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.7, marginBottom: 10, paddingLeft: 20, fontFamily: PROSE_FONT }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.7, marginBottom: 10, paddingLeft: 20, fontFamily: PROSE_FONT }}>
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: 5, overflowWrap: 'break-word' }}>{children}</li>
  ),
  hr: () => (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid rgba(255, 255, 255, 0.14)',
        margin: '18px 0',
      }}
    />
  ),
  table: ({ children }) => (
    <div
      className="md-table-wrap"
      style={{
        overflowX: 'auto',
        marginBottom: 14,
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        background: 'rgba(255, 255, 255, 0.015)',
      }}
    >
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          minWidth: 480,
          fontSize: 12.5,
          fontFamily: PROSE_FONT,
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'rgba(255, 255, 255, 0.04)' }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="md-tr">{children}</tr>,
  th: ({ children }) => <th style={thStyle}>{children}</th>,
  td: ({ children }) => <td style={tdStyle}>{children}</td>,
}
