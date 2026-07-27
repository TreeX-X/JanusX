/**
 * @file 共享的 Markdown 渲染组件样式
 * @description
 *  统一 QuickNote 预览与 MarkdownViewer 预览的渲染外观，避免两处各写一份内联样式。
 *  调用方：`<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>`。
 */

import type { Components } from 'react-markdown'

const CODE_FONT = "'Cascadia Code', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace"
const PROSE_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"

export const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 style={{ color: '#e8e8e8', fontSize: 22, fontWeight: 700, marginBottom: 12, marginTop: 20, lineHeight: 1.3 }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ color: '#e8e8e8', fontSize: 18, fontWeight: 600, marginBottom: 10, marginTop: 18, lineHeight: 1.3 }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ color: '#e8e8e8', fontSize: 15, fontWeight: 600, marginBottom: 8, marginTop: 16, lineHeight: 1.3 }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.7, marginBottom: 10, fontFamily: PROSE_FONT }}>
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    <a href={href} style={{ color: '#ff7830', textDecoration: 'none' }}>
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          style={{
            background: 'rgba(18, 18, 20, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 12,
            fontFamily: CODE_FONT,
          }}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        style={{
          fontFamily: CODE_FONT,
          fontSize: 12,
        }}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre
      style={{
        background: 'rgba(18, 18, 20, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        borderRadius: 4,
        padding: 12,
        overflowX: 'auto',
        marginBottom: 12,
      }}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: '3px solid #ff7830',
        paddingLeft: 12,
        color: '#999',
        marginBottom: 12,
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
    <li style={{ marginBottom: 4 }}>{children}</li>
  ),
  hr: () => (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        margin: '16px 0',
      }}
    />
  ),
  table: ({ children }) => (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        marginBottom: 12,
        fontSize: 12,
      }}
    >
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '6px 10px',
        background: 'rgba(18, 18, 20, 0.85)',
        color: '#e8e8e8',
        fontWeight: 600,
        textAlign: 'left',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '6px 10px',
      }}
    >
      {children}
    </td>
  ),
}