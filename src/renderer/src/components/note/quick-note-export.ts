import type { NoteCard } from '@/stores/note'

export type QuickNoteExportFormat = 'md' | 'txt' | 'html'

export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\t ]*[-*+]\s+/gm, '')
    .replace(/^[\t ]*\d+\.\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildHtmlDocument(markdown: string): string {
  const body = markdown.split(/\n{2,}/).map((block) => {
    const escaped = escapeHtml(block.trim())
    const heading = escaped.match(/^(#{1,6})\s+([\s\S]*)$/)
    if (heading) return `<h${heading[1]!.length}>${heading[2]}</h${heading[1]!.length}>`
    if (/^```/.test(block.trim())) return `<pre><code>${escaped.replace(/^```[^\n]*\n?|```$/g, '')}</code></pre>`
    if (block.split('\n').every((line) => /^\s*[-*+]\s+/.test(line))) return `<ul>${block.split('\n').map((line) => `<li>${escapeHtml(line.replace(/^\s*[-*+]\s+/, ''))}</li>`).join('')}</ul>`
    return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
  }).join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui;color:#222}pre{overflow:auto;background:#f4f4f4;padding:12px}</style></head><body>${body}</body></html>`
}

export function mdToPayload(markdown: string, format: QuickNoteExportFormat): string {
  if (format === 'md') return markdown
  return format === 'txt' ? stripMarkdown(markdown) : buildHtmlDocument(markdown)
}

export async function exportNoteCard(card: NoteCard, format: QuickNoteExportFormat): Promise<'saved' | 'canceled'> {
  const base = (card.title.trim() || `Note-${card.id.slice(0, 8)}`).replace(/[\\/:"*?<>|]/g, '-').trim()
  const dialog = await window.electron.invoke('dialog:saveFile', { defaultName: `${base}.${format}`, extension: format }) as { canceled: boolean; filePath?: string }
  if (dialog.canceled || !dialog.filePath) return 'canceled'
  const result = await window.electron.file.save(dialog.filePath, mdToPayload(card.content, format))
  if (result?.error) throw new Error(result.error)
  return 'saved'
}
