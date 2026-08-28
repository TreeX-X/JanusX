import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useEditorStore } from '@/stores/editor'
import { FloatingPanel } from '@/components/FloatingPanel'
import { useWorkspaceStore } from '@/stores/workspace'
import type { OpenFile } from '@/types'
import type { DefinitionTarget } from '@/lib/monaco-definition'
import { PanelRightClose, PanelRightOpen, RefreshCw, Save, Search } from 'lucide-react'
import { isEditorDefinitionShortcut, isEditorFindShortcut, isMonacoKeyboardEvent, openEditorDefinition, openEditorFind, watchFindWidgetControls, type FindableEditor } from '@/lib/editor-find'
import { useI18n } from '@/i18n/useI18n'

/*-- P4: 查看器栈（Monaco/HTML/Markdown viewer）按需分包，编辑器未打开文件时不加载 --*/
const FileViewerContent = lazy(() =>
  import('@/components/FileViewerContent').then((m) => ({ default: m.FileViewerContent }))
)

function ViewerContent({ file, workspacePath, onEditorMount }: { file: OpenFile; workspacePath: string | null; onEditorMount?: (editor: FindableEditor | null) => void }) {
  const { t } = useI18n('editor')
  const updateContent = useEditorStore((s) => s.updateContent)
  const openFileAt = useEditorStore((s) => s.openFileAt)
  const navigationTarget = useEditorStore((s) => s.navigationTarget)
  const consumeNavigationTarget = useEditorStore((s) => s.consumeNavigationTarget)
  const handleDefinitionNavigate = useCallback((target: DefinitionTarget) => {
    if (workspacePath) void openFileAt(target.absolutePath, workspacePath, target.selection)
  }, [openFileAt, workspacePath])
  return (
    <Suspense fallback={null}>
      <FileViewerContent
        file={file}
        workspacePath={workspacePath ?? undefined}
        navigationTarget={navigationTarget}
        onDefinitionNavigate={handleDefinitionNavigate}
        onNavigationComplete={consumeNavigationTarget}
        definitionActionLabel={t('editor:fileEditor.goToDefinition')}
        definitionErrorMessage={t('editor:fileEditor.cppDefinitionUnavailable')}
        onContentChange={(content) => updateContent(file.id, content)}
        onEditorMount={onEditorMount}
      />
    </Suspense>
  )
}

function TabItem({
  file,
  isActive,
  onSelect,
  onClose,
  onReload,
}: {
  file: OpenFile
  isActive: boolean
  onSelect: () => void
  onClose: (e: React.MouseEvent) => void
  onReload: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="h-[30px] px-3 text-xs cursor-pointer flex items-center gap-1.5 font-mono relative transition-colors select-none rounded-t-[6px]"
      style={{
        color: isActive ? '#d4d4d4' : hovered ? '#999' : '#666',
        background: isActive ? 'rgba(10, 10, 10, 0.98)' : 'transparent',
      }}
      onClick={onSelect}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {file.isDirty && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: '#ff7830' }}
        />
      )}
      {file.externalChanged && (
        <button
          className="shrink-0 flex items-center justify-center"
          style={{
            color: '#4fc3f7',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
          title="Disk version changed ? click to reload"
          onClick={(e) => { e.stopPropagation(); onReload() }}
        >
          <RefreshCw size={11} strokeWidth={2} />
        </button>
      )}
      <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]">
        {file.name}
      </span>
      {isActive && (
        <div
          className="absolute bottom-0 left-2.5 right-2.5 h-px"
          style={{ background: '#ff7830' }}
        />
      )}
      <button
        className="shrink-0"
        style={{
          opacity: hovered ? 0.4 : 0,
          color: '#888',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: 1,
          padding: 0,
          marginLeft: 2,
          transition: 'opacity 0.15s',
        }}
        onClick={onClose}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ff5858'; e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.opacity = hovered ? '0.4' : '0' }}
      >
        ×
      </button>
    </div>
  )
}

export function FileEditor() {
  const { t } = useI18n('editor')
  const findEditorRef = useRef<FindableEditor | null>(null)
  const unwatchFindControlsRef = useRef<(() => void) | null>(null)
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFileId = useEditorStore((s) => s.activeFileId)
  const isVisible = useEditorStore((s) => s.isVisible)
  const setActiveFile = useEditorStore((s) => s.setActiveFile)
  const closeFile = useEditorStore((s) => s.closeFile)
  const closePanel = useEditorStore((s) => s.closePanel)
  const hidePanel = useEditorStore((s) => s.hidePanel)
  const saveFile = useEditorStore((s) => s.saveFile)
  const reloadOpenFile = useEditorStore((s) => s.reloadOpenFile)
  const isEmbedded = useEditorStore((s) => s.isEmbedded)
  const setEmbedded = useEditorStore((s) => s.setEmbedded)
  const activeWorkspacePath = useWorkspaceStore((s) =>
    s.workspaces.find((workspace) => workspace.id === s.activeWorkspaceId)?.path ?? null,
  )

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null
  const canSave = activeFile && activeFile.viewType !== 'image' && activeFile.viewType !== 'binary'
  const canFind = activeFile?.viewType === 'code' || activeFile?.viewType === 'markdown' || activeFile?.viewType === 'html'
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

  // Ctrl+S / Cmd+S save shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditorFindShortcut(e) && findEditorRef.current && !isMonacoKeyboardEvent(e)) {
        e.preventDefault()
        void openEditorFind(findEditorRef.current)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (activeFileId) {
          saveFile(activeFileId)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeFileId, saveFile])

  useEffect(() => {
    findEditorRef.current = null
  }, [activeFileId])

  const handleClose = useCallback(async () => {
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
    closePanel()
  }, [closeFile, closePanel, openFiles, saveFile])

  const handleTabClose = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const file = openFiles.find((f) => f.id === id)
    if (file?.isDirty && file.viewType !== 'image' && file.viewType !== 'binary') {
      const result = await window.electron.dialog.showMessageBox({
        message: `Save changes to ${file.name}?`,
        detail: 'You have unsaved changes that will be lost.',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
      })
      if (result.response === 2) return
      if (result.response === 0) await saveFile(id)
    }
    closeFile(id)
  }, [closeFile, openFiles, saveFile])

  const detachEditor = useCallback(async () => {
    if (!activeFile || !activeWorkspacePath) return
    if (activeFile.isDirty && canSave) await saveFile(activeFile.id)
    const result = await window.electron.window.openEditor({
      filePath: activeFile.absolutePath,
      workspacePath: activeWorkspacePath,
    })
    if (result.success) {
      setEmbedded(false)
      hidePanel()
    }
  }, [activeFile, activeWorkspacePath, canSave, hidePanel, saveFile, setEmbedded])

  if (!isVisible || openFiles.length === 0) return null

  const title = activeFile ? activeFile.name : t('editor:fileEditor.title')

  return (
    <FloatingPanel
      visible={isVisible}
      title={title}
      onClose={handleClose}
      initialWidth={980}
      initialHeight={680}
      minWidth={720}
      minHeight={460}
      embedded={isEmbedded}
      titlebarContent={
        <div className="flex min-w-0 items-end overflow-x-auto no-scrollbar">
          {openFiles.map((file) => (
            <TabItem
              key={file.id}
              file={file}
              isActive={file.id === activeFileId}
              onSelect={() => setActiveFile(file.id)}
              onClose={(e) => handleTabClose(file.id, e)}
              onReload={() => void reloadOpenFile(file.absolutePath)}
            />
          ))}
        </div>
      }
      titlebarActions={
        <div className="flex items-center gap-2">
          {canFind && (
            <button
              type="button"
              aria-label={t('editor:fileEditor.find')}
              title={t('editor:fileEditor.findTitle')}
              onClick={() => void openEditorFind(findEditorRef.current)}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#888] transition-colors hover:border-white/[0.14] hover:text-white"
            >
              <Search size={14} strokeWidth={1.8} />
            </button>
          )}
          {!isEmbedded && (
            <button
              type="button"
              aria-label={t('editor:fileEditor.embedToWorkspace')}
              title={t('editor:fileEditor.embedToWorkspace')}
              onClick={() => setEmbedded(true)}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#999] transition-colors hover:border-white/[0.14] hover:text-white"
            >
              <PanelRightOpen size={14} strokeWidth={1.8} />
            </button>
          )}
          {isEmbedded && (
            <button
              type="button"
              aria-label={t('editor:fileEditor.detachToFloat')}
              title={t('editor:fileEditor.detachToFloat')}
              onClick={() => void detachEditor()}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#999] transition-colors hover:border-white/[0.14] hover:text-white"
            >
              <PanelRightClose size={14} strokeWidth={1.8} />
            </button>
          )}
          {canSave && (
            <button
              type="button"
              aria-label={t('editor:fileEditor.save')}
              title={t('editor:fileEditor.save')}
              onClick={() => activeFileId && void saveFile(activeFileId)}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors"
              style={{
                background: activeFile?.isDirty ? 'rgba(255, 120, 48, 0.14)' : 'rgba(255, 255, 255, 0.04)',
                border: activeFile?.isDirty ? '1px solid rgba(255, 120, 48, 0.24)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: activeFile?.isDirty ? '#ffb084' : '#777',
              }}
            >
              <Save size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>
      }
    >
      {/* Viewer area */}
      <div className="flex-1 overflow-hidden" style={{ background: '#151517', height: '100%', position: 'relative' }}>
        {activeFile && <ViewerContent key={`${activeFile.id}:${activeFile.absolutePath}`} file={activeFile} workspacePath={activeWorkspacePath} onEditorMount={handleEditorMount} />}
      </div>
    </FloatingPanel>
  )
}
