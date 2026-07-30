import { useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { FindableEditor } from '@/lib/editor-find'
import { defineJanusxDarkTheme, JANUSX_DARK_THEME_NAME } from '@/lib/monaco-theme'

interface MonacoViewerProps {
  content: string
  language: string
  onChange: (value: string) => void
  readOnly?: boolean
  onEditorMount?: (editor: FindableEditor | null) => void
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

export function MonacoViewer({ content, language, onChange, readOnly = false, onEditorMount }: MonacoViewerProps) {
  const editorRef = useRef<FindableEditor | null>(null)
  const handleChange = useCallback(
    (value: string | undefined) => {
      onChange(value || '')
    },
    [onChange],
  )

  const handleBeforeMount = useCallback((monaco: any) => {
    defineJanusxDarkTheme(monaco)
  }, [])

  const handleMount = useCallback((editor: FindableEditor) => {
    editorRef.current = editor
    onEditorMount?.(editor)
  }, [onEditorMount])

  useEffect(() => () => {
    if (editorRef.current) onEditorMount?.(null)
  }, [onEditorMount])

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#0a0a0a' }}>
      <Editor
        height="100%"
        language={language}
        value={content}
        onChange={handleChange}
        theme={JANUSX_DARK_THEME_NAME}
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
        onMount={handleMount}
      />
    </div>
  )
}
