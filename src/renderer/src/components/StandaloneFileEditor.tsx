import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useEditorCloseDialog } from './EditorCloseDialog'
import { FileViewerContent } from '@/components/FileViewerContent'
import { getEditorFileId, invalidateEditorFileCache, useEditorStore } from '@/stores/editor'
import { useThemeStore } from '@/stores/theme'
import { GitCompareArrows, Maximize2, PanelRightOpen, Pin, PinOff, RefreshCw, Save, Search } from 'lucide-react'
import { isEditorDefinitionShortcut, isEditorFindShortcut, isMonacoKeyboardEvent, openEditorDefinition, openEditorFind, watchFindWidgetControls, type FindableEditor } from '@/lib/editor-find'
import { useI18n } from '@/i18n/useI18n'
import type { DefinitionTarget } from '@/lib/monaco-definition'

interface EditorWindowParams {
  filePath: string
  workspacePath: string
}

function getEditorWindowParams(): EditorWindowParams | null {
  const params = new URLSearchParams(window.location.search)
  const filePath = params.get('editorFile')
  const workspacePath = params.get('workspacePath')
  if (!filePath || !workspacePath) return null
  return { filePath, workspacePath }
}

function WindowTrafficLights({ onClose }: { onClose: () => void }) {
  const { t } = useI18n('common')
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

  return (
    <div className="relative z-10 flex shrink-0 gap-2" style={noDrag}>
      <button
        type="button"
        aria-label={t('common:trafficLight.close')}
        title={t('common:trafficLight.close')}
        onClick={onClose}
        className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
      />
      <button
        type="button"
        aria-label={t('common:trafficLight.minimize')}
        title={t('common:trafficLight.minimize')}
        onClick={() => window.electron.window.minimize()}
        className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
      />
      <button
        type="button"
        aria-label={t('common:trafficLight.maximize')}
        title={t('common:trafficLight.maximize')}
        onClick={() => window.electron.window.maximize()}
        className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
      />
    </div>
  )
}

export function StandaloneFileEditor() {
  const { t } = useI18n('editor')
  const findEditorRef = useRef<FindableEditor | null>(null)
  const editorParams = useMemo(() => getEditorWindowParams(), [])
  const openFiles = useEditorStore((state) => state.openFiles)
  const activeFileId = useEditorStore((state) => state.activeFileId)
  const openFile = useEditorStore((state) => state.openFile)
  const setActiveFile = useEditorStore((state) => state.setActiveFile)
  const closeFile = useEditorStore((state) => state.closeFile)
  const updateContent = useEditorStore((state) => state.updateContent)
  const saveFile = useEditorStore((state) => state.saveFile)
  const reloadOpenFile = useEditorStore((state) => state.reloadOpenFile)
  const openFileAt = useEditorStore((state) => state.openFileAt)
  const navigationTarget = useEditorStore((state) => state.navigationTarget)
  const consumeNavigationTarget = useEditorStore((state) => state.consumeNavigationTarget)
  const activeFile = openFiles.find((file) => file.id === activeFileId) ?? null
  const { confirmClose, closeDialog } = useEditorCloseDialog()
  const [diffFileId, setDiffFileId] = useState<string | null>(null)
  const [baselineStatus, setBaselineStatus] = useState<'loading' | 'unavailable' | null>(null)
  const [baselineContent, setBaselineContent] = useState<string | undefined>(undefined)
  const [baselineFileId, setBaselineFileId] = useState<string | null>(null)
  const [isPinned, setIsPinned] = useState(false)
  const viewedPath = activeFile && !activeFile.isLoading && !activeFile.error && activeFile.viewType !== 'binary'
    ? activeFile.absolutePath : null
  // Note: report only successfully loaded, viewable files to the main workbench — see .agents/notes/workbench/first-run-learning.md
  useEffect(() => {
    if (!editorParams || !viewedPath) return
    window.electron.window.reportEditorViewed({ filePath: viewedPath, workspacePath: editorParams.workspacePath })
  }, [viewedPath, editorParams])
  const unwatchFindControlsRef = useRef<(() => void) | null>(null)
  // 正式入口在 React 挂载前加载主题；保留幂等调用，供直接挂载组件的宿主初始化。
  // Note: .agents/notes/workbench/standalone-editor-initial-theme.md
  useEffect(() => {
    void useThemeStore.getState().load()
  }, [])
  const handleEditorMount = useCallback((editor: FindableEditor | null) => {
    findEditorRef.current = editor
    unwatchFindControlsRef.current?.()
    unwatchFindControlsRef.current = editor ? watchFindWidgetControls(editor.getDomNode?.()) : null
  }, [])

  useEffect(() => () => unwatchFindControlsRef.current?.(), [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isEditorDefinitionShortcut(event) || !findEditorRef.current || !isMonacoKeyboardEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      void openEditorDefinition(findEditorRef.current)
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    if (!editorParams) return
    void openFile(editorParams.filePath, editorParams.workspacePath)
    const unsubscribe = window.electron.window.onEditorRefresh((payload) => {
      // The main process reuses this window for new files. Opening through the
      // store activates an existing tab and only loads content for a new tab;
      // reloading here would reset the current editor's scroll position.
      void openFile(payload.filePath, payload.workspacePath).then(() => {
        // Reopening the already active tab changes no effect dependencies.
        const state = useEditorStore.getState()
        const file = state.openFiles.find(item => item.id === getEditorFileId(payload.filePath) && item.id === state.activeFileId)
        if (file && !file.isLoading && !file.error && file.viewType !== 'binary') {
          window.electron.window.reportEditorViewed({ filePath: file.absolutePath, workspacePath: payload.workspacePath })
        }
      })
    })
    window.electron.window.editorReady()
    return unsubscribe
  }, [editorParams, openFile])

  // Note: standalone editors auto-refresh clean tabs on external disk changes — see .agents/notes/workbench/standalone-editor-auto-refresh.md
  useEffect(() => {
    if (!editorParams) return
    const workspacePath = editorParams.workspacePath
    return window.electron.fileTree.onChanged((payload) => {
      if (payload.workspacePath !== workspacePath) return
      invalidateEditorFileCache(workspacePath)
      void useEditorStore.getState().reloadOpenFiles(workspacePath, payload.changedFilePath ?? null)
    })
  }, [editorParams])

  const closeWindow = useCallback(() => {
    void window.electron.window.confirmEditorClose()
  }, [])

  const handleWindowClose = useCallback(() => {
    confirmClose(useEditorStore.getState().openFiles.map(file => file.id), closeWindow)
  }, [confirmClose, closeWindow])

  useEffect(() => window.electron.window.onEditorCloseRequested(handleWindowClose), [handleWindowClose])

  useEffect(() => {
    let cancelled = false
    const file = useEditorStore.getState().openFiles.find(item => item.id === activeFileId)
    if (!file || !editorParams || diffFileId !== file.id) return
    setBaselineStatus('loading')
    setBaselineFileId(null)
    void window.electron.git.fileBaseline(editorParams.workspacePath, file.path)
      .then(baseline => {
        if (cancelled) return
        setBaselineContent(baseline?.available ? baseline.content : undefined)
        setBaselineFileId(file.id)
        setBaselineStatus(baseline?.available ? null : 'unavailable')
      })
      .catch(() => { if (!cancelled) setBaselineStatus('unavailable') })
    return () => { cancelled = true }
  }, [activeFileId, activeFile?.mtime, diffFileId, editorParams])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditorFindShortcut(event) && findEditorRef.current && !isMonacoKeyboardEvent(event)) {
        event.preventDefault()
        void openEditorFind(findEditorRef.current)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (activeFileId) void saveFile(activeFileId)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeFileId, saveFile])

  useEffect(() => { findEditorRef.current = null }, [activeFileId])

  useEffect(() => {
    document.title = activeFile ? t('editor:fileEditor.documentTitle', { prefix: activeFile.isDirty ? '* ' : '', name: activeFile.name }) : t('editor:fileEditor.windowTitle')
  }, [activeFile, t])

  const handleDefinitionNavigate = useCallback((target: DefinitionTarget) => {
    if (editorParams) void openFileAt(target.absolutePath, editorParams.workspacePath, target.selection)
  }, [editorParams, openFileAt])

  const togglePinned = useCallback(async () => {
    const result = await window.electron.window.setAlwaysOnTop(!isPinned)
    setIsPinned(result.value)
  }, [isPinned])

  const embedInWorkspace = useCallback(async () => {
    if (!activeFile || !editorParams) return
    await window.electron.window.embedEditor({
      filePath: activeFile.absolutePath,
      workspacePath: editorParams.workspacePath,
      content: activeFile.content,
      isDirty: activeFile.isDirty,
    })
  }, [activeFile, editorParams])

  const titlebarDrag = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const diffEnabled = Boolean(activeFile && diffFileId === activeFile.id)
  const activeBaselineContent = diffEnabled && baselineFileId === activeFile?.id ? baselineContent : undefined
  const canSave = Boolean(activeFile && activeFile.viewType !== 'image' && activeFile.viewType !== 'binary')
  const canFind = activeFile?.viewType === 'code' || activeFile?.viewType === 'markdown' || activeFile?.viewType === 'html'

  return (
    <div data-editor-window-state="ready" className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--shell-canvas)', color: 'var(--shell-text)' }}>
      <div
        className="relative h-[38px] shrink-0 flex items-center gap-3 px-3 select-none"
        style={{
          ...titlebarDrag,
          background: 'var(--shell-pane-chrome)',
          borderBottom: '1px solid var(--shell-border)',
        }}
      >
        <div
          data-editor-window-drag-strip
          className="absolute inset-x-0 top-0 z-20 h-2"
          style={titlebarDrag}
          aria-hidden="true"
        />
        <WindowTrafficLights onClose={handleWindowClose} />
        <div
          data-editor-drag-region
          className="flex min-w-0 flex-1 self-stretch items-end overflow-x-auto"
          style={titlebarDrag}
        >
          {openFiles.map((file) => {
            const isActive = file.id === activeFileId
            return (
              <div
                key={file.id}
                data-editor-tab={file.absolutePath}
                data-active={isActive ? 'true' : 'false'}
                className="relative flex h-[31px] max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md px-3 font-mono text-[11px]"
                style={{ ...noDrag, color: isActive ? 'var(--shell-text)' : 'var(--shell-dim)', background: isActive ? 'var(--shell-canvas)' : 'transparent' }}
                onClick={() => setActiveFile(file.id)}
              >
                {file.isDirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--shell-accent)' }} /> : null}
                {file.externalChanged ? (
                  <button
                    type="button"
                    className="shrink-0 border-0 bg-transparent p-0 hover:opacity-80"
                    style={{ color: 'var(--shell-accent-strong)' }}
                    title="Disk version changed ? click to reload"
                    onClick={(event) => { event.stopPropagation(); void reloadOpenFile(file.absolutePath) }}
                  >
                    <RefreshCw size={11} strokeWidth={2} />
                  </button>
                ) : null}
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
                <button
                  type="button"
                  aria-label={t('editor:fileEditor.closeTab', { name: file.name })}
                  className="ml-1 shrink-0 border-0 bg-transparent p-0 hover:opacity-100"
                  style={{ color: 'var(--shell-dim)', opacity: 0.7 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    confirmClose([file.id], () => {
                      closeFile(file.id)
                      if (useEditorStore.getState().openFiles.length === 0) closeWindow()
                    })
                  }}
                >
                  ×
                </button>
                {isActive ? <span className="absolute inset-x-2 bottom-0 h-px" style={{ background: 'var(--shell-accent)' }} /> : null}
              </div>
            )
          })}
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1.5" style={noDrag}>
          {canFind && <button type="button" aria-pressed={diffEnabled}
            aria-label={t('editor:fileEditor.compareHead')} title={t('editor:fileEditor.compareHead')}
            onClick={() => setDiffFileId(diffEnabled ? null : activeFileId)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--control-border)]"
            style={{ color: diffEnabled ? 'var(--shell-accent-strong)' : 'var(--shell-muted)', background: diffEnabled ? 'var(--shell-accent-soft)' : 'transparent' }}>
            <GitCompareArrows size={14} strokeWidth={1.8} />
          </button>}
          {canFind && (
            <button
              type="button"
              aria-label={t('editor:fileEditor.find')}
              title={t('editor:fileEditor.findTitle')}
              onClick={() => void openEditorFind(findEditorRef.current)}
              onMouseDown={(event) => event.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded border border-[var(--control-border)] bg-transparent text-[var(--shell-muted)] transition-colors hover:border-[var(--shell-accent-border)] hover:text-[var(--shell-text)]"
            >
              <Search size={14} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            aria-pressed={isPinned}
            aria-label={isPinned ? t('editor:fileEditor.unpinWindow') : t('editor:fileEditor.pinWindow')}
            title={isPinned ? t('editor:fileEditor.unpinWindow') : t('editor:fileEditor.pinWindow')}
            onClick={() => void togglePinned()}
            onMouseDown={(event) => event.stopPropagation()}
            className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors"
            style={{
              background: isPinned ? 'var(--shell-accent-soft)' : 'transparent',
              border: isPinned ? '1px solid var(--shell-accent-border)' : '1px solid var(--control-border)',
              color: isPinned ? 'var(--shell-accent-strong)' : 'var(--shell-muted)',
            }}
          >
            {isPinned ? <PinOff size={14} strokeWidth={1.8} /> : <Pin size={14} strokeWidth={1.8} />}
          </button>
          <button
            type="button"
            aria-label={t('editor:fileEditor.maximizeWindow')}
            title={t('editor:fileEditor.maximizeWindow')}
            onClick={() => void window.electron.window.maximize()}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--control-border)] bg-transparent text-[var(--shell-muted)] transition-colors hover:border-[var(--shell-accent-border)] hover:text-[var(--shell-text)]"
          >
            <Maximize2 size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label={t('editor:fileEditor.embedToMain')}
            title={t('editor:fileEditor.embedToMain')}
            disabled={!activeFile || !editorParams}
            onClick={() => void embedInWorkspace()}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--control-border)] bg-transparent text-[var(--shell-muted)] transition-colors enabled:hover:border-[var(--shell-accent-border)] enabled:hover:text-[var(--shell-text)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <PanelRightOpen size={14} strokeWidth={1.8} />
          </button>
        </div>
        {canSave && (
          <button
            type="button"
            onClick={() => activeFileId && void saveFile(activeFileId)}
            aria-label={t('editor:fileEditor.save')}
            title={t('editor:fileEditor.save')}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors"
            style={{
              ...noDrag,
              background: activeFile?.isDirty ? 'var(--shell-accent-soft)' : 'transparent',
              border: activeFile?.isDirty ? '1px solid var(--shell-accent-border)' : '1px solid var(--control-border)',
              color: activeFile?.isDirty ? 'var(--shell-accent-strong)' : 'var(--shell-dim)',
            }}
          >
            <Save size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {diffEnabled && baselineStatus && <div role="status" className="px-3 py-1 text-xs" style={{ color: 'var(--shell-muted)' }}>
        {t(baselineStatus === 'loading' ? 'editor:fileEditor.diffLoading' : 'editor:fileEditor.diffUnavailable')}
      </div>}
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {activeFile ? (
          <FileViewerContent
            key={`${activeFile.id}:${activeFile.absolutePath}`}
            file={activeFile}
            workspacePath={editorParams?.workspacePath}
            navigationTarget={navigationTarget}
            onDefinitionNavigate={handleDefinitionNavigate}
            onNavigationComplete={consumeNavigationTarget}
            definitionActionLabel={t('editor:fileEditor.goToDefinition')}
            definitionErrorMessage={t('editor:fileEditor.cppDefinitionUnavailable')}
            diffOriginalContent={activeBaselineContent}
            onContentChange={(content) => updateContent(activeFile.id, content)}
            onEditorMount={handleEditorMount}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--shell-dim)' }}>
            {t('editor:fileEditor.missingFileInfo')}
          </div>
        )}
      </div>
      {closeDialog}
    </div>
  )
}
