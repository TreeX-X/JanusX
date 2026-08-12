import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FileViewerContent } from '@/components/FileViewerContent'
import { useEditorStore } from '@/stores/editor'
import { Maximize2, PanelRightOpen, Pin, PinOff, Save, Search } from 'lucide-react'
import { isEditorFindShortcut, isMonacoKeyboardEvent, openEditorFind, watchFindWidgetControls, type FindableEditor } from '@/lib/editor-find'
import { useI18n } from '@/i18n/useI18n'

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

function WindowTrafficLights() {
  const { t } = useI18n('common')
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

  return (
    <div className="relative z-10 flex shrink-0 gap-2" style={noDrag}>
      <button
        type="button"
        aria-label={t('common:trafficLight.close')}
        title={t('common:trafficLight.close')}
        onClick={() => window.electron.window.close()}
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
  const activeFile = openFiles.find((file) => file.id === activeFileId) ?? null
  const [baselineContent, setBaselineContent] = useState<string | undefined>(undefined)
  const [isPinned, setIsPinned] = useState(false)
  const unwatchFindControlsRef = useRef<(() => void) | null>(null)
  const handleEditorMount = useCallback((editor: FindableEditor | null) => {
    findEditorRef.current = editor
    unwatchFindControlsRef.current?.()
    unwatchFindControlsRef.current = editor ? watchFindWidgetControls(editor.getDomNode?.()) : null
  }, [])

  useEffect(() => () => unwatchFindControlsRef.current?.(), [])

  useEffect(() => {
    if (!editorParams) return
    void openFile(editorParams.filePath, editorParams.workspacePath)
    const unsubscribe = window.electron.window.onEditorRefresh((payload) => {
      void openFile(payload.filePath, payload.workspacePath)
    })
    window.electron.window.editorReady()
    return unsubscribe
  }, [editorParams, openFile])

  useEffect(() => {
    let cancelled = false
    setBaselineContent(undefined)
    if (!activeFile || !editorParams || activeFile.viewType === 'image' || activeFile.viewType === 'binary') return
    void window.electron.git.fileBaseline(editorParams.workspacePath, activeFile.path)
      .then((baseline) => {
        if (!cancelled) setBaselineContent(baseline?.available ? baseline.content : undefined)
      })
      .catch(() => {})
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

  const handleContentChange = useCallback((content: string) => {
    if (activeFileId) updateContent(activeFileId, content)
  }, [activeFileId, updateContent])

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
  const canSave = Boolean(activeFile && activeFile.viewType !== 'image' && activeFile.viewType !== 'binary')
  const canFind = activeFile?.viewType === 'code' || activeFile?.viewType === 'markdown' || activeFile?.viewType === 'html'

  return (
    <div data-editor-window-state="ready" className="h-screen flex flex-col overflow-hidden" style={{ background: '#151517', color: '#d4d4d4' }}>
      <div
        className="relative h-[38px] shrink-0 flex items-center gap-3 px-3 select-none"
        style={{
          ...titlebarDrag,
          background: 'rgba(6, 6, 6, 0.96)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div
          data-editor-window-drag-strip
          className="absolute inset-x-0 top-0 z-20 h-2"
          style={titlebarDrag}
          aria-hidden="true"
        />
        <WindowTrafficLights />
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
                style={{ ...noDrag, color: isActive ? '#ddd' : '#777', background: isActive ? '#151517' : 'transparent' }}
                onClick={() => setActiveFile(file.id)}
              >
                {file.isDirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff7830]" /> : null}
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
                <button
                  type="button"
                  aria-label={t('editor:fileEditor.closeTab', { name: file.name })}
                  className="ml-1 shrink-0 border-0 bg-transparent p-0 text-[#666] hover:text-[#ff7474]"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeFile(file.id)
                    if (openFiles.length === 1) void window.electron.window.close()
                  }}
                >
                  ×
                </button>
                {isActive ? <span className="absolute inset-x-2 bottom-0 h-px bg-[#ff7830]" /> : null}
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
              className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#888] transition-colors hover:border-white/[0.14] hover:text-white"
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
              background: isPinned ? 'rgba(255, 120, 48, 0.14)' : 'rgba(255, 255, 255, 0.04)',
              border: isPinned ? '1px solid rgba(255, 120, 48, 0.28)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: isPinned ? '#ff9b64' : '#888',
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
            className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#999] transition-colors hover:border-white/[0.14] hover:text-white"
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
            className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#999] transition-colors enabled:hover:border-white/[0.14] enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
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
              background: activeFile?.isDirty ? 'rgba(255, 120, 48, 0.14)' : 'rgba(255, 255, 255, 0.04)',
              border: activeFile?.isDirty ? '1px solid rgba(255, 120, 48, 0.24)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: activeFile?.isDirty ? '#ffb084' : '#777',
            }}
          >
            <Save size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {activeFile ? (
          <FileViewerContent key={activeFile.id} file={activeFile} diffOriginalContent={baselineContent} onContentChange={handleContentChange} onEditorMount={handleEditorMount} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[#666]">
            {t('editor:fileEditor.missingFileInfo')}
          </div>
        )}
      </div>
    </div>
  )
}
