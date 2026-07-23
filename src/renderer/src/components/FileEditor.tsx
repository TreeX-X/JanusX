import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/stores/editor'
import { FloatingPanel } from '@/components/FloatingPanel'
import { FileViewerContent } from '@/components/FileViewerContent'
import { useWorkspaceStore } from '@/stores/workspace'
import type { OpenFile } from '@/types'
import { PanelRightClose, Save } from 'lucide-react'

function ViewerContent({ file }: { file: OpenFile }) {
  const updateContent = useEditorStore((s) => s.updateContent)
  return <FileViewerContent file={file} onContentChange={(content) => updateContent(file.id, content)} />
}

function TabItem({
  file,
  isActive,
  onSelect,
  onClose,
}: {
  file: OpenFile
  isActive: boolean
  onSelect: () => void
  onClose: (e: React.MouseEvent) => void
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
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFileId = useEditorStore((s) => s.activeFileId)
  const isVisible = useEditorStore((s) => s.isVisible)
  const setActiveFile = useEditorStore((s) => s.setActiveFile)
  const closeFile = useEditorStore((s) => s.closeFile)
  const closePanel = useEditorStore((s) => s.closePanel)
  const hidePanel = useEditorStore((s) => s.hidePanel)
  const saveFile = useEditorStore((s) => s.saveFile)
  const isEmbedded = useEditorStore((s) => s.isEmbedded)
  const setEmbedded = useEditorStore((s) => s.setEmbedded)
  const activeWorkspacePath = useWorkspaceStore((s) =>
    s.workspaces.find((workspace) => workspace.id === s.activeWorkspaceId)?.path ?? null,
  )

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null
  const canSave = activeFile && activeFile.viewType !== 'image' && activeFile.viewType !== 'binary'

  // Ctrl+S / Cmd+S save shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

  const handleClose = useCallback(() => {
    closePanel()
  }, [closePanel])

  const handleTabClose = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    closeFile(id)
  }, [closeFile])

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

  const title = activeFile ? activeFile.name : 'Editor'

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
            />
          ))}
        </div>
      }
      titlebarActions={
        <div className="flex items-center gap-2">
          {isEmbedded && (
            <button
              type="button"
              aria-label={'\u8fd4\u56de\u72ec\u7acb\u6d6e\u7a97'}
              title={'\u8fd4\u56de\u72ec\u7acb\u6d6e\u7a97'}
              onClick={() => void detachEditor()}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#999] transition-colors hover:border-white/[0.14] hover:text-white"
            >
              <PanelRightClose size={14} strokeWidth={1.8} />
            </button>
          )}
          {canSave && (
            <button
              type="button"
              aria-label={'\u4fdd\u5b58'}
              title={'\u4fdd\u5b58'}
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
      <div className="flex-1 overflow-hidden" style={{ background: '#0a0a0a', height: '100%', position: 'relative' }}>
        {activeFile && <ViewerContent file={activeFile} />}
      </div>
    </FloatingPanel>
  )
}
