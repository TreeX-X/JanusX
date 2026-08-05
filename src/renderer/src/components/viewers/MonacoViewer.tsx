import { useCallback, useEffect, useRef } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import type { FindableEditor } from '@/lib/editor-find'
import { defineJanusxDarkTheme, JANUSX_DARK_THEME_NAME } from '@/lib/monaco-theme'
import { configureMonacoRuntime } from '@/lib/monaco-runtime'

configureMonacoRuntime()

interface MonacoViewerProps {
  content: string
  language: string
  onChange: (value: string) => void
  readOnly?: boolean
  onEditorMount?: (editor: FindableEditor | null) => void
  originalContent?: string
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

export function MonacoViewer({ content, language, onChange, readOnly = false, onEditorMount, originalContent }: MonacoViewerProps) {
  const editorRef = useRef<FindableEditor | null>(null)
  const contentRef = useRef(content)
  const diffChangeSubscriptionRef = useRef<{ dispose(): void } | null>(null)
  contentRef.current = content
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

  const handleDiffMount = useCallback((editor: {
    getModifiedEditor(): FindableEditor & {
      getValue(): string
      onDidChangeModelContent(callback: () => void): { dispose(): void }
    }
  }) => {
    const modifiedEditor = editor.getModifiedEditor()
    handleMount(modifiedEditor)
    diffChangeSubscriptionRef.current?.dispose()
    diffChangeSubscriptionRef.current = modifiedEditor.onDidChangeModelContent(() => {
      const value = modifiedEditor.getValue()
      if (value !== contentRef.current) onChange(value)
    })
  }, [handleMount, onChange])

  useEffect(() => () => {
    diffChangeSubscriptionRef.current?.dispose()
    if (editorRef.current) onEditorMount?.(null)
  }, [onEditorMount])

  const commonOptions = {
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    lineNumbers: 'on' as const,
    renderLineHighlight: 'line' as const,
    padding: { top: 12, bottom: 12 },
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#0a0a0a' }}>
      {originalContent !== undefined ? (
        <DiffEditor
          height="100%"
          language={language}
          original={originalContent}
          modified={content}
          theme={JANUSX_DARK_THEME_NAME}
          loading={<LoadingIndicator />}
          options={{ ...commonOptions, renderSideBySide: false, readOnly, originalEditable: false, domReadOnly: readOnly }}
          beforeMount={handleBeforeMount}
          onMount={handleDiffMount}
        />
      ) : (
        <Editor
          height="100%"
          language={language}
          value={content}
          onChange={handleChange}
          theme={JANUSX_DARK_THEME_NAME}
          loading={<LoadingIndicator />}
          options={{ ...commonOptions, readOnly, domReadOnly: readOnly }}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
        />
      )}
    </div>
  )
}
