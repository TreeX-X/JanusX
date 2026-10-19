import { useEffect, useRef, useState } from 'react'
import type { HtmlPreviewLease } from '../../../../shared/ipc/workspace'

export function useHtmlPreviewDocument(content: string, workspacePath?: string, documentPath?: string) {
  const contentRef = useRef(content)
  contentRef.current = content
  const [lease, setLease] = useState<(HtmlPreviewLease & { content: string }) | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLease(null)
    setError(false)
    if (!workspacePath || !documentPath) return
    let cancelled = false
    let opened: HtmlPreviewLease | null = null
    const initialContent = contentRef.current
    const api = window.electron.file
    void api.openHtmlPreview({ workspacePath, documentPath, content: initialContent }).then(result => {
      opened = result
      if (cancelled) { void api.closeHtmlPreview(result.id).catch(() => {}); return }
      setLease({ ...result, content: initialContent })
    }).catch(() => { if (!cancelled) setError(true) })
    return () => {
      cancelled = true
      if (opened) void api.closeHtmlPreview(opened.id).catch(() => {})
    }
  }, [workspacePath, documentPath])

  useEffect(() => {
    if (!lease || lease.content === content) return
    let cancelled = false
    void window.electron.file.updateHtmlPreview(lease.id, content).then(() => {
      if (cancelled) return
      setLease(current => current?.id === lease.id ? { ...current, content } : current)
      setRevision(value => value + 1)
      setError(false)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [content, lease])

  return { url: lease ? `${lease.url}?janusxRevision=${revision}` : undefined, error, pending: Boolean(workspacePath && documentPath && !lease && !error) }
}
