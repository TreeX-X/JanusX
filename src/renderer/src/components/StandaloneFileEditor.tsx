import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FileViewerContent } from '@/components/FileViewerContent'
import { invalidateEditorFileCache, useEditorStore } from '@/stores/editor'
import { useThemeStore } from '@/stores/theme'
import { Maximize2, PanelRightOpen, Pin, PinOff, RefreshCw, Save, Search } from 'lucide-react'
import { isEditorDefinitionShortcut, isEditorFindShortcut, isMonacoKeyboardEvent, openEditorDefinition, openEditorFind, watchFindWidgetControls, type FindableEditor } from '@/lib/editor-find'
import { useI18n } from '@/i18n/useI18n'
import type { DefinitionTarget } from '@/lib/monaco-definition'

interface EditorWindowParams {
  filePath: string
  workspacePath: string
}

const baselineCache = new Map<string, string | undefined>()

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
  const [baselineContent, setBaselineContent] = useState<string | undefined>(undefined)
  const [baselineFileId, setBaselineFileId] = useState<string | null>(null)
  const [isPinned, setIsPinned] = useState(false)
  const unwatchFindControlsRef = useRef<(() => void) | null>(null)
  // 独立窗口不经过 App 根的 theme store，自行拉取持久化主题并挂载 [data-theme]，
  // 顶栏走 shell 语义令牌，与嵌入版保持一致；MonacoViewer 内的 load 仅覆盖编辑区。
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
      void openFile(payload.filePath, payload.workspacePath)
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

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirtyFiles = openFiles.filter((f) => f.isDirty && f.viewType !== 'image' && f.viewType !== 'binary')
      if (dirtyFiles.length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [openFiles])

  useEffect(() => {
    let cancelled = false
    if (!activeFile || !editorParams || activeFile.viewType === 'image' || activeFile.viewType === 'binary') {
      if (activeFile) setBaselineFileId(activeFile.id)
      return
    }
    if (baselineCache.has(activeFile.id)) {
      setBaselineContent(baselineCache.get(activeFile.id))
      setBaselineFileId(activeFile.id)
      return
    }
    setBaselineFileId(null)
    void window.electron.git.fileBaseline(editorParams.workspacePath, activeFile.path)
      .then((baseline) => {
        if (!cancelled) {
          const content = baseline?.available ? baseline.content : undefined
          baselineCache.set(activeFile.id, content)
          setBaselineContent(content)
          setBaselineFileId(activeFile.id)
        }
      })
      .catch(() => {
        if (!cancelled) {
          baselineCache.set(activeFile.id, undefined)
          setBaselineFileId(activeFile.id)
        }
      })
    return () => { cancelled = true }
  }, [activeFile?.id, activeFile?.mtime, activeFile?.path, activeFile?.viewType, editorParams])

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
  }, [activeFile])

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

  const handleWindowClose = useCallback(async () => {
    const dirtyFiles = openFiles.filter((f) => f.isDirty && f.viewType !== 'image' && f.viewType !== 'binary')
    if (dirtyFiles.length > 0) {
      const names = dirtyFiles.map((f) => f.name).join(', ')
      const result = await window.electron.dialog.showMessageBox({
        message: `Save changes to ${names}?`,
        detail: 'You have unsaved changes that will be lost.',
        buttons: ['Save All', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
      })
      if (result.response === 2) return
      if (result.response === 0) {
        for (const f of dirtyFiles) await saveFile(f.id)
      }
    }
    void window.electron.window.close()
  }, [openFiles, saveFile])

  const titlebarDrag = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const hasBaseline = Boolean(activeFile && (baselineFileId === activeFile.id || baselineCache.has(activeFile.id)))
  const activeBaselineContent = activeFile && baselineCache.has(activeFile.id)
    ? baselineCache.get(activeFile.id)
    : baselineContent
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
                  onClick={async (event) => {
                    event.stopPropagation()
                    if (file.isDirty && file.viewType !== 'image' && file.viewType !== 'binary') {
                      const result = await window.electron.dialog.showMessageBox({
                        message: `Save changes to ${file.name}?`,
                        detail: 'You have unsaved changes that will be lost.',
                        buttons: ['Save', "Don't Save", 'Cancel'],
                        defaultId: 0,
                        cancelId: 2,
                      })
                      if (result.response === 2) return
                      if (result.response === 0) await saveFile(file.id)
                    }
                    closeFile(file.id)
                    if (openFiles.length === 1) void window.electron.window.close()
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
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {activeFile && hasBaseline ? (
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
        ) : activeFile ? (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--shell-dim)' }}>Loading</div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--shell-dim)' }}>
            {t('editor:fileEditor.missingFileInfo')}
          </div>
        )}
      </div>
    </div>
  )
}
