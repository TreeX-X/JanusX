import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ProductKind } from '../../../../shared/product'
import { MARKDOWN_COMPONENTS } from '../viewers/markdown-components'
import { MarkdownAssetContext, useResolvedHtmlSrcDoc } from '../viewers/local-asset'
import { dirnameOfAbsolutePath } from '@/lib/local-asset-resolver'
import { PreviewScrollArea } from '../viewers/PreviewScrollArea'
import { ImageViewer } from '../viewers/ImageViewer'
import { useI18n } from '@/i18n/useI18n'

export const PRODUCT_TEXT_PREVIEW_LIMIT = 512 * 1024

function joinWorkspacePath(workspacePath: string, relPath: string): string {
  const trimmed = workspacePath.replace(/[/\\]+$/, '')
  const separator = trimmed.includes('\\') ? '\\' : '/'
  return `${trimmed}${separator}${relPath.split('/').join(separator)}`
}

export function LocalFileStage({ workspacePath, relPath, kind, revision }: {
  workspacePath: string
  relPath: string
  kind: Exclude<ProductKind, 'office' | 'unsupported'>
  revision?: number
}) {
  const { t } = useI18n('editor')
  const [content, setContent] = useState<string | null>(null)
  const [image, setImage] = useState<{ base64: string; mimeType: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const absolutePath = useMemo(
    () => joinWorkspacePath(workspacePath, relPath),
    [workspacePath, relPath],
  )
  const documentDir = useMemo(() => dirnameOfAbsolutePath(absolutePath), [absolutePath])
  const assetScope = useMemo(
    () => ({ workspacePath, documentDir }),
    [workspacePath, documentDir],
  )
  const resolvedHtml = useResolvedHtmlSrcDoc(content ?? '', assetScope)

  useEffect(() => {
    let disposed = false
    setContent(null)
    setImage(null)
    setError(null)
    const absolutePath = joinWorkspacePath(workspacePath, relPath)
    if (kind === 'image') {
      void window.electron.file.readBinary(absolutePath).then((result) => {
        if (disposed) return
        if (result && typeof result === 'object' && 'error' in result && typeof (result as { error?: unknown }).error === 'string') {
          setError((result as { error: string }).error)
          return
        }
        const binary = result as { base64?: string; mimeType?: string }
        if (!binary.base64) {
          setError('Failed to load file')
          return
        }
        setImage({ base64: binary.base64, mimeType: binary.mimeType ?? 'application/octet-stream' })
      }).catch((loadError: unknown) => {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : 'Failed to load file')
      })
      return () => { disposed = true }
    }
    void window.electron.file.read(absolutePath).then((result) => {
      if (disposed) return
      if (result && typeof result === 'object' && 'error' in result && typeof (result as { error?: unknown }).error === 'string') {
        setError((result as { error: string }).error)
        return
      }
      setContent((result as { content?: string }).content ?? '')
    }).catch((loadError: unknown) => {
      if (!disposed) setError(loadError instanceof Error ? loadError.message : 'Failed to load file')
    })
    return () => { disposed = true }
  }, [workspacePath, relPath, kind, revision])

  if (error) {
    return <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[#aaa]">
      <div>{error}</div>
    </div>
  }
  if (kind === 'image') {
    if (image === null) {
      return <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-[#777]">
        <span className="product-spinner" aria-hidden="true" />
        <span>{t('editor:product.startingPreview')}</span>
      </div>
    }
    return <ImageViewer base64={image.base64} mimeType={image.mimeType} fileName={relPath.split('/').pop() ?? relPath} />
  }
  if (content === null) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-[#777]">
      <span className="product-spinner" aria-hidden="true" />
      <span>{t('editor:product.startingPreview')}</span>
    </div>
  }
  if (kind === 'markdown') {
    return <PreviewScrollArea>
      <div className="flex-1" style={{ padding: 16, background: '#0a0a0a', color: '#d4d4d4', minHeight: '100%' }}>
        <div className="markdown-preview">
          <MarkdownAssetContext.Provider value={assetScope}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{content}</ReactMarkdown>
          </MarkdownAssetContext.Provider>
        </div>
      </div>
    </PreviewScrollArea>
  }
  if (kind === 'text') {
    const truncated = content.length > PRODUCT_TEXT_PREVIEW_LIMIT
    const visible = truncated ? content.slice(0, PRODUCT_TEXT_PREVIEW_LIMIT) : content
    return <PreviewScrollArea>
      <div className="flex-1" style={{ padding: 16, background: '#0a0a0a', color: '#d4d4d4', minHeight: '100%' }}>
        {truncated && <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{t('editor:product.truncatedPreview')}</div>}
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{visible}</pre>
      </div>
    </PreviewScrollArea>
  }
  return <iframe
    title={t('editor:product.iframeTitle')}
    srcDoc={resolvedHtml}
    // allow-forms/modals/popups：生成的 HTML 页面内可点击、可交互；
    // 仍不授 allow-top-navigation，预览不能劫持主窗口。
    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
    referrerPolicy="no-referrer"
    className="h-full w-full border-0 bg-white"
  />
}
