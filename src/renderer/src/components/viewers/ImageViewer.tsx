interface ImageViewerProps {
  base64: string
  mimeType: string
  fileName: string
}

export function ImageViewer({ base64, mimeType, fileName }: ImageViewerProps) {
  const src = `data:${mimeType};base64,${base64}`

  return (
    <div
      className="flex flex-col items-center justify-center flex-1 overflow-auto"
      style={{ background: '#0a0a0a', minHeight: 0 }}
    >
      <div className="flex items-center justify-center flex-1 p-4 w-full">
        <img
          src={src}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
          style={{ display: 'block' }}
        />
      </div>
      <div
        className="shrink-0 flex items-center justify-center gap-2"
        style={{ padding: '10px 16px' }}
      >
        <span style={{ color: '#555', fontSize: 11 }}>{fileName}</span>
        <span style={{ color: '#444', fontSize: 11 }}>/</span>
        <span style={{ color: '#555', fontSize: 11 }}>{mimeType}</span>
      </div>
    </div>
  )
}
