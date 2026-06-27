import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/stores/editor'
import { FloatingPanel } from '@/components/FloatingPanel'
import { MonacoViewer, MarkdownViewer, HtmlViewer, ImageViewer, BinaryInfo } from '@/components/viewers'
import { getMonacoLanguage } from '@/lib/file-utils'
import type { OpenFile } from '@/types'

function ViewerContent({ file }: { file: OpenFile }) {
  const updateContent = useEditorStore((s) => s.updateContent)

  if (file.isLoading) {
    return (
      <div
        className="flex items-center justify-center flex-1"
        style={{ background: '#0a0a0a', minHeight: 0 }}
      >
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

  if (file.error) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 gap-2"
        style={{ background: '#0a0a0a', minHeight: 0 }}
      >
        <span style={{ color: '#ff5858', fontSize: 13 }}>Error</span>
        <span style={{ color: '#666', fontSize: 11 }}>{file.error}</span>
        <span style={{ color: '#444', fontSize: 10 }}>Try closing and reopening the file</span>
      </div>
    )
  }

  switch (file.viewType) {
    case 'code':
      return (
        <MonacoViewer
          content={file.content}
          language={getMonacoLanguage(file.path)}
          onChange={(c) => updateContent(file.id, c)}
        />
      )
    case 'markdown':
      return (
        <MarkdownViewer
          content={file.content}
          onChange={(c) => updateContent(file.id, c)}
        />
      )
    case 'html':
      return (
        <HtmlViewer
          content={file.content}
          onChange={(c) => updateContent(file.id, c)}
        />
      )
    case 'image':
      return (
        <ImageViewer
          base64={file.base64!}
          mimeType={file.mimeType!}
          fileName={file.name}
        />
      )
    case 'binary':
      return (
        <BinaryInfo
          fileName={file.name}
          filePath={file.absolutePath}
          size={file.size}
        />
      )
    default:
      return null
  }
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
      className="py-1.5 px-3 text-xs cursor-pointer flex items-center gap-1.5 font-mono relative transition-colors select-none"
      style={{
        color: isActive ? '#d4d4d4' : hovered ? '#999' : '#666',
        background: isActive ? 'rgba(10, 10, 10, 0.95)' : 'transparent',
      }}
      onClick={onSelect}
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
  const hidePanel = useEditorStore((s) => s.hidePanel)
  const saveFile = useEditorStore((s) => s.saveFile)

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null

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
    hidePanel()
  }, [hidePanel])

  const handleTabClose = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    closeFile(id)
  }, [closeFile])

  if (!isVisible || openFiles.length === 0) return null

  const title = activeFile ? activeFile.name : 'Editor'

  return (
    <FloatingPanel
      visible={isVisible}
      title={title}
      onClose={handleClose}
      initialWidth={700}
      initialHeight={500}
    >
      {/* Tab bar */}
      <div
        className="flex overflow-x-auto shrink-0"
        style={{
          background: 'rgba(6, 6, 6, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
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

      {/* Viewer area */}
      <div className="flex-1 overflow-hidden" style={{ background: '#0a0a0a', height: '100%', position: 'relative' }}>
        {activeFile && <ViewerContent file={activeFile} />}
      </div>
    </FloatingPanel>
  )
}
