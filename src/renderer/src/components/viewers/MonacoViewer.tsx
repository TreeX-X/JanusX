import { readFileViewState, saveFileViewState } from '@/lib/file-view-state'
import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'
import { Uri } from 'monaco-editor/esm/vs/editor/editor.main'
import type { FindableEditor } from '@/lib/editor-find'
import { defineJanusxThemes, getMonacoThemeName } from '@/lib/monaco-theme'
import { useThemeStore } from '@/stores/theme'
import { configureMonacoRuntime } from '@/lib/monaco-runtime'
import { registerDefinitionNavigation, type DefinitionTarget } from '@/lib/monaco-definition'
import type { EditorNavigationTarget } from '@/stores/editor'

const editorViewStates = new Map<string, MonacoEditor.ICodeEditorViewState>()

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
  // Note: 加载态与容器走 definition.ts 令牌管道，不写字面量 — .agents/notes/workbench/preview-editor-display-style.md
  return (
    <div className="flex items-center justify-center h-full w-full" style={{ background: 'var(--shell-canvas)' }}>
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--shell-dim)', fontSize: 12 }}>Loading</span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--shell-accent)',
            animation: 'pulse-dot 1.2s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}

export function MonacoViewer({ content, language, onChange, readOnly = false, onEditorMount, originalContent, modelPath, workspacePath, navigationTarget, onDefinitionNavigate, onNavigationComplete, definitionActionLabel, definitionErrorMessage }: MonacoViewerProps) {
  // Note: one number per pane keeps the preview readable — see .agents/notes/terminal/monaco-diff-single-line-number.md
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const contentRef = useRef(content)
  const diffChangeSubscriptionRef = useRef<{ dispose(): void } | null>(null)
  const viewStateSubscriptionRef = useRef<{ dispose(): void } | null>(null)
  const definitionActionRef = useRef<IDisposable | null>(null)
  const diffIndicatorRef = useRef<{
    original: MonacoEditor.IEditorDecorationsCollection
    modified: MonacoEditor.IEditorDecorationsCollection
    subscription: IDisposable
  } | null>(null)
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
    defineJanusxThemes(monaco)
  }, [])

  const appTheme = useThemeStore((s) => s.theme)
  const monacoThemeName = getMonacoThemeName(appTheme)

  useEffect(() => {
    void useThemeStore.getState().load()
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
    viewStateSubscriptionRef.current?.dispose()
    if (modelPath) {
      const saveViewState = () => {
        const viewState = editor.saveViewState()
        if (viewState) editorViewStates.set(modelPath, viewState)
        saveFileViewState(modelPath, { scrollTop: editor.getScrollTop(), scrollLeft: editor.getScrollLeft(), cursor: editor.getPosition() ?? undefined })
      }
      const subscriptions = [editor.onDidScrollChange(saveViewState), editor.onDidChangeCursorPosition(saveViewState)]
      viewStateSubscriptionRef.current = { dispose: () => subscriptions.forEach((subscription) => subscription.dispose()) }
    }
    if (modelPath && !navigationTarget) {
      const viewState = editorViewStates.get(modelPath)
      if (viewState) {
        window.requestAnimationFrame(() => {
          editor.layout()
          editor.restoreViewState(viewState)
        })
      }
    }
    if (!navigationTarget) {
      const state = readFileViewState(modelPath)
      if (state.cursor) editor.setPosition(state.cursor)
      if (state.scrollTop !== undefined) editor.setScrollTop(state.scrollTop)
      if (state.scrollLeft !== undefined) editor.setScrollLeft(state.scrollLeft)
    }
    const model = editor.getModel()
    if (model && model.getValue() !== contentRef.current) model.setValue(contentRef.current)
    definitionActionRef.current?.dispose()
    definitionActionRef.current = workspacePath && onDefinitionNavigate && definitionActionLabel
      ? registerDefinitionNavigation(editor, monaco, workspacePath, definitionActionLabel, onDefinitionNavigate, showDefinitionError)
      : null
    revealNavigationTarget(editor, navigationTarget)
  }, [definitionActionLabel, modelPath, navigationTarget, onDefinitionNavigate, onEditorMount, revealNavigationTarget, showDefinitionError, workspacePath])

  const handleDiffMount = useCallback((editor: MonacoEditor.IStandaloneDiffEditor, monaco: Monaco) => {
    const modifiedEditor = editor.getModifiedEditor()
    handleMount(modifiedEditor, monaco)
    diffChangeSubscriptionRef.current?.dispose()
    diffChangeSubscriptionRef.current = modifiedEditor.onDidChangeModelContent(() => {
      const value = modifiedEditor.getValue()
      if (value !== contentRef.current) onChange(value)
    })
    // Note: 行号染色走 decoration；竖条经视觉复核撤除 — .agents/notes/workbench/preview-editor-display-style.md
    diffIndicatorRef.current?.subscription.dispose()
    diffIndicatorRef.current?.original.clear()
    diffIndicatorRef.current?.modified.clear()
    const originalIndicators = editor.getOriginalEditor().createDecorationsCollection([])
    const modifiedIndicators = modifiedEditor.createDecorationsCollection([])
    const updateDiffIndicators = () => {
      const originalDecorations: MonacoEditor.IModelDeltaDecoration[] = []
      const modifiedDecorations: MonacoEditor.IModelDeltaDecoration[] = []
      for (const change of editor.getLineChanges() ?? []) {
        if (change.originalEndLineNumber >= change.originalStartLineNumber && change.originalEndLineNumber > 0) {
          for (let line = change.originalStartLineNumber; line <= change.originalEndLineNumber; line += 1) {
            originalDecorations.push({
              range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
              options: { isWholeLine: true, lineNumberClassName: 'diff-num-del' },
            })
          }
        }
        if (change.modifiedEndLineNumber >= change.modifiedStartLineNumber && change.modifiedEndLineNumber > 0) {
          for (let line = change.modifiedStartLineNumber; line <= change.modifiedEndLineNumber; line += 1) {
            modifiedDecorations.push({
              range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
              options: { isWholeLine: true, lineNumberClassName: 'diff-num-add' },
            })
          }
        }
      }
      originalIndicators.set(originalDecorations)
      modifiedIndicators.set(modifiedDecorations)
    }
    updateDiffIndicators()
    diffIndicatorRef.current = {
      original: originalIndicators,
      modified: modifiedIndicators,
      subscription: editor.onDidUpdateDiff(updateDiffIndicators),
    }
  }, [handleMount, onChange])

  // 模型在 diff 退出后仍被复用：主动清掉装饰，避免行号染色残留在普通预览。
  useEffect(() => {
    if (originalContent !== undefined) return
    diffIndicatorRef.current?.subscription.dispose()
    diffIndicatorRef.current?.original.clear()
    diffIndicatorRef.current?.modified.clear()
    diffIndicatorRef.current = null
  }, [originalContent])

  useEffect(() => () => {
    diffChangeSubscriptionRef.current?.dispose()
    viewStateSubscriptionRef.current?.dispose()
    definitionActionRef.current?.dispose()
    diffIndicatorRef.current?.subscription.dispose()
    diffIndicatorRef.current?.original.clear()
    diffIndicatorRef.current?.modified.clear()
    diffIndicatorRef.current = null
    if (definitionErrorTimerRef.current) clearTimeout(definitionErrorTimerRef.current)
    if (editorRef.current) {
      if (modelPath) {
        const viewState = editorRef.current.saveViewState()
        if (viewState) editorViewStates.set(modelPath, viewState)
      }
      onEditorMount?.(null)
    }
  }, [modelPath, onEditorMount])

  useEffect(() => {
    if (editorRef.current) revealNavigationTarget(editorRef.current, navigationTarget)
  }, [navigationTarget, revealNavigationTarget])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const currentValue = editor.getValue()
    if (currentValue !== content) {
      const position = editor.getPosition()
      editor.getModel()?.setValue(content)
      if (position) editor.setPosition(position)
    }
  }, [content])


  // Note: 排版与折叠对齐 opencode —— .agents/notes/workbench/preview-editor-display-style.md
  const commonOptions = {
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: 24,
    tabSize: 2,
    detectIndentation: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    lineNumbers: 'on' as const,
    renderLineHighlight: 'line' as const,
    padding: { top: 12, bottom: 12 },
  }

  const diffOptions = {
    ...commonOptions,
    lineNumbersMinChars: 3,
    glyphMargin: false,
    folding: false,
    renderIndicators: true,
    renderMarginRevertIcon: false,
    renderOverviewRuler: false,
    renderSideBySide: true,
    useInlineViewWhenSpaceIsLimited: true,
    renderSideBySideInlineBreakpoint: 800,
    experimental: { useTrueInlineView: true },
    hideUnchangedRegions: { enabled: true, revealLineCount: 20, minimumLineCount: 20, contextLineCount: 20 },
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'var(--shell-canvas)' }}>
      {definitionError && (
        <div
          role="status"
          className="absolute bottom-3 right-3 z-10 max-w-[min(360px,calc(100%-24px))] border px-3 py-2 text-xs shadow-lg"
          style={{ color: 'var(--shell-text)', background: 'var(--popover-background)', borderColor: 'var(--shell-border)' }}
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
          theme={monacoThemeName}
          loading={<LoadingIndicator />}
          options={{ ...diffOptions, readOnly, originalEditable: false, domReadOnly: readOnly }}
          beforeMount={handleBeforeMount}
          onMount={handleDiffMount}
        />
      ) : (
        <Editor
          height="100%"
          language={language}
          value={content}
          path={modelPath ? monacoFileUri(modelPath) : undefined}
          onChange={handleChange}
          theme={monacoThemeName}
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
