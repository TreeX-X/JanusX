import { useCallback } from 'react'
import Editor from '@monaco-editor/react'

interface MonacoViewerProps {
  content: string
  language: string
  onChange: (value: string) => void
  readOnly?: boolean
}

function LoadingIndicator() {
  return (
    <div className="flex items-center justify-center h-full w-full" style={{ background: '#0a0a0a' }}>
      <div className="flex items-center gap-2">
        <span style={{ color: '#555', fontSize: 12 }}>Loading</span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: '#ff7830',
            animation: 'pulse-dot 1.2s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}

export function MonacoViewer({ content, language, onChange, readOnly = false }: MonacoViewerProps) {
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
        'editor.selectionBackground': '#264f78',
        'editorLineNumber.foreground': '#444444',
        'editorLineNumber.activeForeground': '#888888',
        'editor.inactiveSelectionBackground': '#1e3a56',
      },
    })
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#0a0a0a' }}>
      <Editor
        height="100%"
        language={language}
        value={content}
        onChange={handleChange}
        theme="janusx-dark"
        loading={<LoadingIndicator />}
        options={{
          fontSize: 13,
          fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          padding: { top: 12, bottom: 12 },
          readOnly,
          domReadOnly: readOnly,
        }}
        beforeMount={handleBeforeMount}
      />
    </div>
  )
}
