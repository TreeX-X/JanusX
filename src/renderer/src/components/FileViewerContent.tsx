import { MonacoViewer, MarkdownViewer, HtmlViewer, ImageViewer, BinaryInfo } from '@/components/viewers'
import { getMonacoLanguage } from '@/lib/file-utils'
import type { OpenFile } from '@/types'

interface FileViewerContentProps {
  file: OpenFile
  onContentChange: (content: string) => void
}

export function FileViewerContent({ file, onContentChange }: FileViewerContentProps) {
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
          onChange={onContentChange}
        />
      )
    case 'markdown':
      return (
        <MarkdownViewer
          content={file.content}
          onChange={onContentChange}
        />
      )
    case 'html':
      return (
        <HtmlViewer
          content={file.content}
          onChange={onContentChange}
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
          size={file.size}
        />
      )
    default:
      return null
  }
}
