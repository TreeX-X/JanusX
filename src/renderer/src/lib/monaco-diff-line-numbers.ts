import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'

/** Compact inline hides Monaco's original gutter, including deleted line numbers.
 * Fill only its native deletion margins; content, wrapping and editing stay native.
 * DOM integration is covered by editor-preview e2e and must be checked on upgrades.
 */
export function numberInlineDeletions(editor: MonacoEditor.IStandaloneDiffEditor, monaco: Monaco): IDisposable {
  const original = editor.getOriginalEditor()
  const modified = editor.getModifiedEditor()
  let frame = 0
  const render = () => {
    frame = 0
    const root = modified.getDomNode()
    if (!root) return
    const margins = [...root.querySelectorAll<HTMLElement>('.inline-deleted-margin-view-zone')]
      .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
    const changes = (editor.getLineChanges() ?? []).filter(change => change.originalEndLineNumber > 0)
    const layout = modified.getLayoutInfo()
    const lineHeight = modified.getOption(monaco.editor.EditorOption.lineHeight)
    for (const [index, margin] of margins.entries()) {
      margin.querySelectorAll('.diff-deleted-line-number').forEach(node => node.remove())
      const change = changes[index]
      if (!change) continue
      const firstTop = original.getTopForLineNumber(change.originalStartLineNumber)
      for (let line = change.originalStartLineNumber; line <= change.originalEndLineNumber; line++) {
        const number = document.createElement('span')
        number.className = 'diff-deleted-line-number'
        number.textContent = String(line)
        number.title = `HEAD: ${line}`
        Object.assign(number.style, {
          position: 'absolute',
          top: `${original.getTopForLineNumber(line) - firstTop}px`,
          left: `${layout.lineNumbersLeft}px`,
          width: `${layout.lineNumbersWidth}px`,
          height: `${lineHeight}px`,
          lineHeight: `${lineHeight}px`,
          textAlign: 'right',
          color: 'var(--shell-diff-del)',
          pointerEvents: 'none',
        })
        margin.append(number)
      }
    }
  }
  const schedule = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(render)
  }
  const subscriptions = [
    editor.onDidUpdateDiff(schedule),
    modified.onDidLayoutChange(schedule),
    modified.onDidContentSizeChange(schedule),
  ]
  schedule()
  return { dispose: () => {
    if (frame) cancelAnimationFrame(frame)
    subscriptions.forEach(subscription => subscription.dispose())
    modified.getDomNode()?.querySelectorAll('.diff-deleted-line-number').forEach(node => node.remove())
  } }
}
