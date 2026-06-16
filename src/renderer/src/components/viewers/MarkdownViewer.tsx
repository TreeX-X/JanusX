import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownViewerProps {
  content: string
  onChange: (value: string) => void
}

export function MarkdownViewer({ content, onChange }: MarkdownViewerProps) {
  const [splitRatio, setSplitRatio] = useState(50)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleChange = useCallback(
    (value: string | undefined) => {
      onChange(value || '')
    },
    [onChange],
  )

  const handleBeforeMount = useCallback((monaco: any) => {
    monaco.editor.defineTheme('janusx-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0a0a',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editorCursor.foreground': '#ff7830',
        'editor.selectionBackground': 'rgba(100, 140, 200, 0.25)',
        'editorLineNumber.foreground': '#444444',
        'editorLineNumber.activeForeground': '#888888',
        'editor.inactiveSelectionBackground': 'rgba(100, 140, 200, 0.12)',
      },
    })
  }, [])

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const pct = (x / rect.width) * 100
      setSplitRatio(Math.max(20, Math.min(80, pct)))
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden" style={{ background: '#0a0a0a', height: '100%' }}>
      {/* Left: Editor */}
      <div className="flex flex-col overflow-hidden" style={{ width: `${splitRatio}%`, height: '100%' }}>
        <div
          className="shrink-0 uppercase tracking-wider select-none"
          style={{
            padding: '6px 12px',
            fontSize: 10,
            color: '#555',
            background: 'rgba(6, 6, 6, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          EDITOR
        </div>
        <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
          <Editor
            height="100%"
            language="markdown"
            value={content}
            onChange={handleChange}
            theme="janusx-dark"
            loading={null}
            options={{
              fontSize: 13,
              fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              padding: { top: 12, bottom: 12 },
            }}
            beforeMount={handleBeforeMount}
          />
        </div>
      </div>

      {/* Divider */}
      <div
        className="shrink-0 h-full transition-colors"
        style={{
          width: 3,
          cursor: 'col-resize',
          background: 'rgba(255, 255, 255, 0.06)',
        }}
        onMouseDown={handleDividerMouseDown}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#ff7830'
        }}
        onMouseLeave={(e) => {
          if (!isDragging.current) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
          }
        }}
      />

      {/* Right: Preview */}
      <div className="flex flex-col overflow-hidden" style={{ width: `${100 - splitRatio}%`, height: '100%' }}>
        <div
          className="shrink-0 uppercase tracking-wider select-none"
          style={{
            padding: '6px 12px',
            fontSize: 10,
            color: '#555',
            background: 'rgba(6, 6, 6, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          PREVIEW
        </div>
        <div
          className="flex-1 overflow-auto"
          style={{
            padding: 16,
            background: '#0a0a0a',
            color: '#d4d4d4',
            height: '100%',
          }}
        >
          <div className="markdown-preview">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{ color: '#e8e8e8', fontSize: 22, fontWeight: 700, marginBottom: 12, marginTop: 20 }}>
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ color: '#e8e8e8', fontSize: 18, fontWeight: 600, marginBottom: 10, marginTop: 18 }}>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ color: '#e8e8e8', fontSize: 15, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>
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
                          background: 'rgba(26, 26, 26, 0.85)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: 3,
                          padding: '1px 5px',
                          fontSize: 12,
                          fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
                        }}
                      >
                        {children}
                      </code>
                    )
                  }
                  return (
                    <code
                      style={{
                        fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
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
                      background: 'rgba(26, 26, 26, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
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
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                ul: ({ children }) => (
                  <ul style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.7, marginBottom: 10, paddingLeft: 20 }}>
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.7, marginBottom: 10, paddingLeft: 20 }}>
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
                      background: 'rgba(26, 26, 26, 0.85)',
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
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
