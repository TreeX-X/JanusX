import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PreviewModeToggle, type PreviewMode } from './PreviewModeToggle'
import { MARKDOWN_COMPONENTS } from './markdown-components'
import { MarkdownAssetContext } from './local-asset'
import { dirnameOfAbsolutePath } from '@/lib/local-asset-resolver'
import { MonacoViewer } from './MonacoViewer'
import { PreviewScrollArea } from './PreviewScrollArea'
import type { FindableEditor } from '@/lib/editor-find'

interface MarkdownViewerProps {
  content: string
  originalContent?: string
  onChange: (value: string) => void
  onEditorMount?: (editor: FindableEditor | null) => void
  modelPath?: string
  workspacePath?: string
  documentPath?: string
}

export function MarkdownViewer({ content, originalContent, onChange, onEditorMount, modelPath, workspacePath, documentPath }: MarkdownViewerProps) {
  const [splitRatio, setSplitRatio] = useState(50)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
  const documentDir = useMemo(
    () => dirnameOfAbsolutePath(documentPath ?? modelPath),
    [documentPath, modelPath],
  )
  const assetScope = useMemo(
    () => ({ workspacePath, documentDir }),
    [workspacePath, documentDir],
  )
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const pct = (x / rect.width) * 100
      setSplitRatio(Math.max(20, Math.min(80, pct)))
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const showEditor = previewMode !== 'preview'
  const showPreview = previewMode !== 'editor'
  const isSplit = previewMode === 'split'

  return (
    <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--shell-void)', height: '100%' }}>
      <div
        className="shrink-0 flex items-center justify-between select-none"
        style={{
          padding: '6px 10px',
          background: 'var(--shell-chrome)',
          borderBottom: '1px solid var(--shell-border)',
        }}
      >
        <span className="uppercase tracking-wider" style={{ fontSize: 10, color: 'var(--shell-dim)' }}>
          MARKDOWN
        </span>
        <PreviewModeToggle value={previewMode} onChange={setPreviewMode} />
      </div>
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      {/* Left: Editor */}
      {showEditor && (
      <div className="flex flex-col overflow-hidden" style={{ width: isSplit ? `${splitRatio}%` : '100%', height: '100%' }}>
        <div
          className="shrink-0 uppercase tracking-wider select-none"
          style={{
            padding: '6px 12px',
            fontSize: 10,
            color: 'var(--shell-dim)',
            background: 'var(--shell-chrome)',
            borderBottom: '1px solid var(--shell-border)',
          }}
        >
          EDITOR
        </div>
        <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
          <MonacoViewer
            content={content}
            language="markdown"
            originalContent={originalContent}
            modelPath={modelPath}
            onChange={onChange}
            onEditorMount={onEditorMount}
          />
        </div>
      </div>
      )}

      {/* Divider */}
      {isSplit && (
      <div
        className="viewer-divider shrink-0 h-full transition-colors"
        style={{
          width: 3,
          cursor: 'col-resize',
          background: 'rgba(255, 255, 255, 0.06)',
        }}
        onMouseDown={handleDividerMouseDown}
      />
      )}

      {/* Right: Preview */}
      {showPreview && (
      <div className="flex flex-col overflow-hidden" style={{ width: isSplit ? `${100 - splitRatio}%` : '100%', height: '100%' }}>
        <div
          className="shrink-0 uppercase tracking-wider select-none"
          style={{
            padding: '6px 12px',
            fontSize: 10,
            color: 'var(--shell-dim)',
            background: 'var(--shell-chrome)',
            borderBottom: '1px solid var(--shell-border)',
          }}
        >
          PREVIEW
        </div>
        <PreviewScrollArea>
        <div
          className="flex-1"
          style={{
            padding: 16,
            background: 'var(--shell-void)',
            color: 'var(--shell-text)',
            height: '100%',
          }}
        >
          <div className="markdown-preview">
            <MarkdownAssetContext.Provider value={assetScope}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={MARKDOWN_COMPONENTS}
              >
                {content}
              </ReactMarkdown>
            </MarkdownAssetContext.Provider>
          </div>
        </div>
        </PreviewScrollArea>
      </div>
      )}
      </div>
    </div>
  )
}
