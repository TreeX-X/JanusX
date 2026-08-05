import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PreviewModeToggle, type PreviewMode } from './PreviewModeToggle'
import { MARKDOWN_COMPONENTS } from './markdown-components'
import { MonacoViewer } from './MonacoViewer'
import type { FindableEditor } from '@/lib/editor-find'

interface MarkdownViewerProps {
  content: string
  originalContent?: string
  onChange: (value: string) => void
  onEditorMount?: (editor: FindableEditor | null) => void
}

export function MarkdownViewer({ content, originalContent, onChange, onEditorMount }: MarkdownViewerProps) {
  const [splitRatio, setSplitRatio] = useState(50)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
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
    <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden" style={{ background: '#0a0a0a', height: '100%' }}>
      <div
        className="shrink-0 flex items-center justify-between select-none"
        style={{
          padding: '6px 10px',
          background: 'rgba(6, 6, 6, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <span className="uppercase tracking-wider" style={{ fontSize: 10, color: '#555' }}>
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
            color: '#555',
            background: 'rgba(6, 6, 6, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          EDITOR
        </div>
        <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
          <MonacoViewer
            content={content}
            language="markdown"
            originalContent={originalContent}
            onChange={onChange}
            onEditorMount={onEditorMount}
          />
        </div>
      </div>
      )}

      {/* Divider */}
      {isSplit && (
      <div
        className="shrink-0 h-full transition-colors"
        style={{
          width: 3,
          cursor: 'col-resize',
          background: 'rgba(255, 255, 255, 0.06)',
        }}
        onMouseDown={handleDividerMouseDown}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#ff7830'
        }}
        onMouseLeave={(e) => {
          if (!isDragging.current) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
          }
        }}
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
            color: '#555',
            background: 'rgba(6, 6, 6, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          PREVIEW
        </div>
        <div
          className="flex-1 overflow-auto"
          style={{
            padding: 16,
            background: '#0a0a0a',
            color: '#d4d4d4',
            height: '100%',
          }}
        >
          <div className="markdown-preview">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
      )}
      </div>
    </div>
  )
}
