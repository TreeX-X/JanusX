interface ImageViewerProps {
  base64: string
  mimeType: string
  fileName: string
}

export function ImageViewer({ base64, mimeType, fileName }: ImageViewerProps) {
  // Shared fit behavior: .agents/notes/workbench/product-workspace.md
  const src = `data:${mimeType};base64,${base64}`

  return (
    <div
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--shell-void)', minHeight: 0 }}
    >
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <img
          src={src}
          alt={fileName}
          className="absolute inset-0 m-auto object-contain"
          style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' }}
        />
      </div>
      <div
        className="shrink-0 flex items-center justify-center gap-2"
        style={{ padding: '10px 16px' }}
      >
        <span className="min-w-0 truncate" title={fileName} style={{ color: 'var(--shell-dim)', fontSize: 11 }}>{fileName}</span>
        <span style={{ color: 'var(--shell-dim)', fontSize: 11 }}>/</span>
        <span style={{ color: 'var(--shell-dim)', fontSize: 11 }}>{mimeType}</span>
      </div>
    </div>
  )
}
