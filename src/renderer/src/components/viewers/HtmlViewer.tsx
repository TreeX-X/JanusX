import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'

interface HtmlViewerProps {
  content: string
  onChange: (value: string) => void
}

export function HtmlViewer({ content, onChange }: HtmlViewerProps) {
  const [splitRatio, setSplitRatio] = useState(50)
  const [scriptsEnabled, setScriptsEnabled] = useState(false)
  const [previewContent, setPreviewContent] = useState(content)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (value: string | undefined) => {
      onChange(value || '')
    },
    [onChange],
  )

  const handleBeforeMount = useCallback((monaco: any) => {
    monaco.editor.defineTheme('switchx-dark', {
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

  // Debounce content changes before updating iframe
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    debounceTimer.current = setTimeout(() => {
      setPreviewContent(content)
    }, 300)
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [content])

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

  const toggleScripts = useCallback(() => {
    setScriptsEnabled((v) => !v)
  }, [])

  const sandboxValue = scriptsEnabled ? 'allow-same-origin allow-scripts' : 'allow-same-origin'

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
            language="html"
            value={content}
            onChange={handleChange}
            theme="switchx-dark"
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
          className="shrink-0 flex items-center select-none"
          style={{
            padding: '6px 12px',
            background: 'rgba(6, 6, 6, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            gap: 10,
          }}
        >
          <span
            className="uppercase tracking-wider"
            style={{ fontSize: 10, color: '#555' }}
          >
            PREVIEW
          </span>
          <button
            onClick={toggleScripts}
            className="rounded transition-colors"
            style={{
              padding: '2px 8px',
              fontSize: 10,
              background: 'rgba(255, 120, 48, 0.06)',
              border: '1px solid rgba(255, 120, 48, 0.15)',
              color: '#ff7830',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 120, 48, 0.12)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 120, 48, 0.06)'
            }}
          >
            {scriptsEnabled ? '禁用脚本' : '启用脚本'}
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
          <iframe
            srcDoc={`<style>html,body{margin:0;padding:0;height:100%;overflow:auto}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:rgba(0,0,0,0.03)}::-webkit-scrollbar-thumb{background:rgba(255,120,48,0.4);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:rgba(255,120,48,0.65)}</style>${previewContent}`}
            sandbox={sandboxValue}
            className="border-0"
            style={{ background: '#ffffff', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            title="HTML Preview"
          />
        </div>
      </div>
    </div>
  )
}
