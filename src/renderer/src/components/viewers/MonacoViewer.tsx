import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'
import { Uri } from 'monaco-editor/esm/vs/editor/editor.main'
import type { FindableEditor } from '@/lib/editor-find'
import { defineJanusxDarkTheme, JANUSX_DARK_THEME_NAME } from '@/lib/monaco-theme'
import { configureMonacoRuntime } from '@/lib/monaco-runtime'
import { registerDefinitionNavigation, type DefinitionTarget } from '@/lib/monaco-definition'
import type { EditorNavigationTarget } from '@/stores/editor'

configureMonacoRuntime()

interface MonacoViewerProps {
  content: string
  language: string
  onChange: (value: string) => void
  readOnly?: boolean
  onEditorMount?: (editor: FindableEditor | null) => void
  originalContent?: string
  modelPath?: string
  workspacePath?: string
  navigationTarget?: EditorNavigationTarget | null
  onDefinitionNavigate?: (target: DefinitionTarget) => void
  onNavigationComplete?: (requestId: number) => void
  definitionActionLabel?: string
  definitionErrorMessage?: string
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

export function MonacoViewer({ content, language, onChange, readOnly = false, onEditorMount, originalContent, modelPath, workspacePath, navigationTarget, onDefinitionNavigate, onNavigationComplete, definitionActionLabel, definitionErrorMessage }: MonacoViewerProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const contentRef = useRef(content)
  const diffChangeSubscriptionRef = useRef<{ dispose(): void } | null>(null)
  const definitionActionRef = useRef<IDisposable | null>(null)
  const definitionErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [definitionError, setDefinitionError] = useState<string | null>(null)
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

  const revealNavigationTarget = useCallback((editor: MonacoEditor.IStandaloneCodeEditor, target: EditorNavigationTarget | null | undefined) => {
    if (!target) return
    editor.setSelection(target.selection)
    editor.revealRangeInCenter(target.selection)
    editor.focus()
    onNavigationComplete?.(target.requestId)
  }, [onNavigationComplete])

  const showDefinitionError = useCallback(() => {
    if (!definitionErrorMessage) return
    if (definitionErrorTimerRef.current) clearTimeout(definitionErrorTimerRef.current)
    setDefinitionError(definitionErrorMessage)
    definitionErrorTimerRef.current = setTimeout(() => setDefinitionError(null), 5000)
  }, [definitionErrorMessage])

  const handleMount = useCallback((editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor
    onEditorMount?.(editor)
    definitionActionRef.current?.dispose()
    definitionActionRef.current = workspacePath && onDefinitionNavigate && definitionActionLabel
      ? registerDefinitionNavigation(editor, monaco, workspacePath, definitionActionLabel, onDefinitionNavigate, showDefinitionError)
      : null
    revealNavigationTarget(editor, navigationTarget)
  }, [definitionActionLabel, navigationTarget, onDefinitionNavigate, onEditorMount, revealNavigationTarget, showDefinitionError, workspacePath])

  const handleDiffMount = useCallback((editor: MonacoEditor.IStandaloneDiffEditor, monaco: Monaco) => {
    const modifiedEditor = editor.getModifiedEditor()
    handleMount(modifiedEditor, monaco)
    diffChangeSubscriptionRef.current?.dispose()
    diffChangeSubscriptionRef.current = modifiedEditor.onDidChangeModelContent(() => {
      const value = modifiedEditor.getValue()
      if (value !== contentRef.current) onChange(value)
    })
  }, [handleMount, onChange])

  useEffect(() => () => {
    diffChangeSubscriptionRef.current?.dispose()
    definitionActionRef.current?.dispose()
    if (definitionErrorTimerRef.current) clearTimeout(definitionErrorTimerRef.current)
    if (editorRef.current) onEditorMount?.(null)
  }, [onEditorMount])

  useEffect(() => {
    if (editorRef.current) revealNavigationTarget(editorRef.current, navigationTarget)
  }, [navigationTarget, revealNavigationTarget])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const currentValue = editor.getValue()
    if (currentValue !== content) {
      const position = editor.getPosition()
      editor.setValue(content)
      if (position) editor.setPosition(position)
    }
  }, [content])


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
      {definitionError && (
        <div
          role="status"
          className="absolute bottom-3 right-3 z-10 max-w-[min(360px,calc(100%-24px))] border px-3 py-2 text-xs shadow-lg"
          style={{ color: '#d4d4d4', background: '#202024', borderColor: '#45454d' }}
        >
          {definitionError}
        </div>
      )}
      {originalContent !== undefined ? (
        <DiffEditor
          height="100%"
          language={language}
          original={originalContent}
          modified={content}
          originalModelPath={modelPath ? `${monacoFileUri(modelPath)}?janusx-original=git` : undefined}
          modifiedModelPath={modelPath ? monacoFileUri(modelPath) : undefined}
          keepCurrentModifiedModel
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
          path={modelPath ? monacoFileUri(modelPath) : undefined}
          keepCurrentModel
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

function monacoFileUri(filePath: string): string {
  return Uri.file(filePath).toString()
}
