import { useState, useCallback, useRef, useEffect } from 'react'
import { PreviewModeToggle, type PreviewMode } from './PreviewModeToggle'
import { MonacoViewer } from './MonacoViewer'
import type { FindableEditor } from '@/lib/editor-find'
import { useI18n } from '@/i18n/useI18n'

interface HtmlViewerProps {
  content: string
  originalContent?: string
  onChange: (value: string) => void
  onEditorMount?: (editor: FindableEditor | null) => void
}

export function HtmlViewer({ content, originalContent, onChange, onEditorMount }: HtmlViewerProps) {
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

  const sandboxValue = scriptsEnabled
    ? 'allow-same-origin allow-scripts allow-forms allow-modals allow-popups'
    : 'allow-same-origin'
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
          {t('editor:htmlViewer.htmlLabel')}
        </span>
        <div className="flex items-center gap-2">
          {showPreview && (
            <button
              onClick={toggleScripts}
              className="h-6 rounded px-2.5 text-[10px] transition-colors"
              style={{
                background: 'rgba(255, 120, 48, 0.06)',
                border: '1px solid rgba(255, 120, 48, 0.15)',
                color: '#ff7830',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 120, 48, 0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 120, 48, 0.06)'
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
                color: '#555',
                background: 'rgba(6, 6, 6, 0.95)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {t('editor:htmlViewer.editorLabel')}
            </div>
            <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
              <MonacoViewer
                content={content}
                language="html"
                originalContent={originalContent}
                onChange={onChange}
                onEditorMount={onEditorMount}
              />
            </div>
          </div>
        )}

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

        {showPreview && (
          <div className="flex flex-col overflow-hidden" style={{ width: isSplit ? `${100 - splitRatio}%` : '100%', height: '100%' }}>
            <div
              className="shrink-0 flex items-center select-none"
              style={{
                padding: '6px 12px',
                background: 'rgba(6, 6, 6, 0.95)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                gap: 10,
              }}
            >
              <span className="uppercase tracking-wider" style={{ fontSize: 10, color: '#555' }}>
                {t('editor:htmlViewer.previewLabel')}
              </span>
            </div>
            <div className="flex-1 overflow-hidden" style={{ height: '100%', position: 'relative' }}>
              <iframe
                key={scriptsEnabled ? 'scripts-on' : 'scripts-off'}
                srcDoc={`${previewContent}<style>::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:rgba(0,0,0,0.03)}::-webkit-scrollbar-thumb{background:rgba(255,120,48,0.4);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:rgba(255,120,48,0.65)}</style>`}
                sandbox={sandboxValue}
                className="border-0"
                style={{ background: '#ffffff', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                title={t('editor:htmlViewer.iframeTitle')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
