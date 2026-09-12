import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ProductKind } from '../../../../shared/product'
import { MARKDOWN_COMPONENTS } from '../viewers/markdown-components'
import { PreviewScrollArea } from '../viewers/PreviewScrollArea'
import { useI18n } from '@/i18n/useI18n'

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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    setContent(null)
    setError(null)
    void window.electron.file.read(joinWorkspacePath(workspacePath, relPath)).then((result) => {
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
  }, [workspacePath, relPath, revision])

  if (error) {
    return <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[#aaa]">
      <div>{error}</div>
    </div>
  }
  if (content === null) {
    return <div className="flex h-full items-center justify-center text-xs text-[#777]">{t('editor:product.startingPreview')}</div>
  }
  if (kind === 'markdown') {
    return <PreviewScrollArea>
      <div className="flex-1" style={{ padding: 16, background: '#0a0a0a', color: '#d4d4d4', height: '100%' }}>
        <div className="markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{content}</ReactMarkdown>
        </div>
      </div>
    </PreviewScrollArea>
  }
  return <iframe
    title={t('editor:product.iframeTitle')}
    srcDoc={content}
    sandbox="allow-scripts allow-same-origin"
    referrerPolicy="no-referrer"
    className="h-full w-full border-0 bg-white"
  />
}
