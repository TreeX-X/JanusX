import { useState, useCallback, useRef, useEffect } from 'react'
import { PreviewModeToggle, type PreviewMode } from './PreviewModeToggle'
import { MonacoViewer } from './MonacoViewer'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import type { FindableEditor } from '@/lib/editor-find'
import { useI18n } from '@/i18n/useI18n'

interface HtmlViewerProps {
  content: string
  originalContent?: string
  onChange: (value: string) => void
  onEditorMount?: (editor: FindableEditor | null) => void
  modelPath?: string
  workspacePath?: string
  documentPath?: string
}

export function HtmlViewer({ content, originalContent, onChange, onEditorMount, modelPath, workspacePath, documentPath }: HtmlViewerProps) {
  const { t } = useI18n('editor')
  const [splitRatio, setSplitRatio] = useState(50)
  const [scriptsEnabled, setScriptsEnabled] = useState(true)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
  const [previewContent, setPreviewContent] = useState(content)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    debounceTimer.current = setTimeout(() => {
      setPreviewContent(content)
    }, 300)
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [content])

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

  const toggleScripts = useCallback(() => {
    setScriptsEnabled((v) => !v)
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
          {t('editor:htmlViewer.htmlLabel')}
        </span>
        <div className="flex items-center gap-2">
          {showPreview && (
            <button
              onClick={toggleScripts}
              className="h-6 rounded px-2.5 text-[10px] transition-colors tbtn-accent"
              style={{
                background: 'rgba(255, 120, 48, 0.06)',
                border: '1px solid rgba(255, 120, 48, 0.15)',
                color: 'var(--shell-accent)',
              }}
            >
              {scriptsEnabled ? t('editor:htmlViewer.disableScripts') : t('editor:htmlViewer.enableScripts')}
            </button>
          )}
          <PreviewModeToggle value={previewMode} onChange={setPreviewMode} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
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
            {t('editor:htmlViewer.editorLabel')}
          </div>
            <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
              <MonacoViewer
                content={content}
                language="html"
                originalContent={originalContent}
                modelPath={modelPath}
                onChange={onChange}
                onEditorMount={onEditorMount}
              />
            </div>
          </div>
        )}

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

        {showPreview && (
          <div className="flex flex-col overflow-hidden" style={{ width: isSplit ? `${100 - splitRatio}%` : '100%', height: '100%' }}>
          <div
            className="shrink-0 flex items-center select-none"
            style={{
              padding: '6px 12px',
              background: 'var(--shell-chrome)',
              borderBottom: '1px solid var(--shell-border)',
              gap: 10,
            }}
          >
            <span className="uppercase tracking-wider" style={{ fontSize: 10, color: 'var(--shell-dim)' }}>
              {t('editor:htmlViewer.previewLabel')}
            </span>
          </div>
            <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
              <HtmlPreviewFrame
                content={previewContent}
                workspacePath={workspacePath}
                documentPath={documentPath ?? modelPath}
                scriptsEnabled={scriptsEnabled}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
