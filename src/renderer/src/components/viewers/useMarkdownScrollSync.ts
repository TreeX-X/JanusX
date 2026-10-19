import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { mapMarkdownScroll } from '@/lib/markdown-scroll'

export function useMarkdownScrollSync(containerRef: RefObject<HTMLDivElement>, editor: MonacoEditor.IStandaloneCodeEditor | null, enabled: boolean, content: string) {
  useEffect(() => {
    const container = containerRef.current
    const viewport = container?.querySelector<HTMLElement>('.preview-scroll-viewport')
    const preview = viewport?.querySelector<HTMLElement>('.markdown-preview')
    if (!editor || !viewport || !preview || !enabled) return
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = viewport.getBoundingClientRect()
        const model = editor.getModel()
        if (!model) return
        const blocks = [...preview.querySelectorAll<HTMLElement>('[data-source-line]')].map(block => ({
          source: editor.getTopForLineNumber(Math.min(model.getLineCount(), Number(block.dataset.sourceLine))),
          target: block.getBoundingClientRect().top - rect.top + viewport.scrollTop,
        }))
        viewport.scrollTop = mapMarkdownScroll(
          editor.getScrollTop(), editor.getScrollHeight() - editor.getLayoutInfo().height,
          viewport.scrollHeight - viewport.clientHeight, blocks,
        )
      })
    }
    const subscriptions = [editor.onDidScrollChange(sync), editor.onDidLayoutChange(sync), editor.onDidContentSizeChange(sync)]
    const observer = new ResizeObserver(sync)
    observer.observe(viewport)
    observer.observe(preview)
    sync()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      subscriptions.forEach(subscription => subscription.dispose())
    }
  }, [containerRef, editor, enabled, content])
}
