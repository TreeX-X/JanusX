import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { dirnameOfAbsolutePath } from '@/lib/local-asset-resolver'
import { useResolvedHtmlSrcDoc } from './local-asset'
import { useHtmlPreviewDocument } from './useHtmlPreviewDocument'

interface HtmlPreviewFrameProps {
  content: string
  workspacePath?: string
  documentPath?: string
  scriptsEnabled?: boolean
  title?: string
}

export function HtmlPreviewFrame({ content, workspacePath, documentPath, scriptsEnabled = true, title }: HtmlPreviewFrameProps) {
  const { t } = useI18n('editor')
  const [viewport, setViewport] = useState('1280x800')
  const [zoom, setZoom] = useState('fit')
  const [reload, setReload] = useState(0)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const { url, error, pending } = useHtmlPreviewDocument(content, workspacePath, documentPath)
  const fallback = useResolvedHtmlSrcDoc(url || pending ? '' : content, { workspacePath, documentDir: dirnameOfAbsolutePath(documentPath) })
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    return () => observer.disconnect()
  }, [])
  const responsive = viewport === 'responsive'
  const [width, height] = viewport.split('x').map(Number)
  const scale = responsive ? 1 : zoom === 'fit'
    ? Math.max(0.01, Math.min(1, (size.width - 24) / width, (size.height - 24) / height))
    : Number(zoom) / 100
  const frame = <iframe
    key={`${scriptsEnabled}:${reload}`}
    src={url}
    srcDoc={url ? undefined : fallback}
    sandbox={[url ? 'allow-same-origin' : '', scriptsEnabled ? 'allow-scripts allow-forms allow-modals allow-popups' : ''].filter(Boolean).join(' ')}
    referrerPolicy="same-origin"
    title={title ?? t('editor:htmlViewer.iframeTitle')}
    className="border-0"
    style={responsive
      ? { display: 'block', background: 'var(--preview-paper)', width: '100%', height: '100%' }
      : { position: 'absolute', left: 0, top: 0, width, height, transform: `scale(${scale})`, transformOrigin: 'top left', background: 'var(--preview-paper)' }}
  />
  const control = { background: 'var(--shell-canvas)', color: 'var(--shell-text)', border: '1px solid var(--control-border)', borderRadius: 4, padding: '3px 5px', maxWidth: '100%' }
  return <div className="flex h-full min-h-0 min-w-0 flex-col" data-html-preview>
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 py-1.5 text-[11px]" style={{ background: 'var(--shell-chrome)', borderBottom: '1px solid var(--shell-border)' }}>
      <select aria-label={t('editor:htmlViewer.viewport')} value={viewport} onChange={event => setViewport(event.target.value)} style={control}>
        <option value="responsive">{t('editor:htmlViewer.responsive')}</option>
        <option value="1280x800">1280 × 800</option>
        <option value="1440x900">1440 × 900</option>
        <option value="1920x1080">1920 × 1080</option>
        <option value="390x844">390 × 844</option>
      </select>
      <select aria-label={t('editor:htmlViewer.zoom')} value={zoom} disabled={responsive} onChange={event => setZoom(event.target.value)} style={control}>
        <option value="fit">{t('editor:htmlViewer.fitWindow')} ({Math.round(scale * 100)}%)</option>
        {[50, 75, 100, 125, 150].map(value => <option key={value} value={value}>{value}%</option>)}
      </select>
      <button type="button" aria-label={t('editor:htmlViewer.reload')} title={t('editor:htmlViewer.reload')} onClick={() => setReload(value => value + 1)} style={control}>
        <RefreshCw size={12} />
      </button>
    </div>
    {error && <div role="status" className="px-2 py-1 text-xs" style={{ color: 'var(--shell-muted)' }}>{t('editor:htmlViewer.resourcesUnavailable')}</div>}
    <div ref={viewportRef} data-html-viewport className="min-h-0 min-w-0 flex-1" style={{ overflow: responsive ? 'hidden' : 'auto', background: 'var(--shell-void)' }}>
      {pending ? <div role="status" className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--shell-muted)' }}>{t('editor:product.startingPreview')}</div> : responsive ? frame : <div style={{ width: Math.max(size.width, Math.ceil(width * scale) + 24), height: Math.max(size.height, Math.ceil(height * scale) + 24), display: 'grid', placeItems: 'center' }}>
        <div style={{ width: Math.ceil(width * scale), height: Math.ceil(height * scale), position: 'relative', overflow: 'hidden', boxShadow: '0 1px 8px var(--preview-shadow)' }}>{frame}</div>
      </div>}
    </div>
  </div>
}
