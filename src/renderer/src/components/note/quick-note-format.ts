/**
 * Pure Markdown editing primitives for the note pane. Every action resolves to a splice (`start`/`end`/`text`)
 * plus the selection the editor should end up with, so the view can apply it through execCommand and keep native undo.
 */
import { stripMarkdown } from './quick-note-export'

export interface NoteEdit {
  /** Start of the replaced range in the current value. */
  start: number
  /** End of the replaced range in the current value. */
  end: number
  /** Text that replaces the range. */
  text: string
  /** Selection inside the resulting value. */
  selectionStart: number
  selectionEnd: number
}

export type InlineMark = 'bold' | 'italic' | 'strike' | 'code'
export type LineMark = 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'ordered' | 'task'
export type BlockKind = 'codeBlock' | 'table' | 'hr'
export type NoteFormatAction = InlineMark | LineMark | BlockKind | 'link'

export interface ShortcutKey {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const INLINE_MARKERS: Record<InlineMark, string> = { bold: '**', italic: '_', strike: '~~', code: '`' }
const HEADING_LEVEL: Record<'h1' | 'h2' | 'h3', number> = { h1: 1, h2: 2, h3: 3 }
const HEADING_RE = /^(#{1,6})[ \t]+/
const QUOTE_RE = /^>[ \t]?/
const TASK_RE = /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/
const BULLET_RE = /^[ \t]*[-*+][ \t]+(?!\[[ xX]\][ \t])/
const ORDERED_RE = /^[ \t]*\d+[.)][ \t]+/
const ANY_LIST_RE = /^([ \t]*)(?:[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)/
const LIST_ITEM_RE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/
const LEADING_SPACE_RE = /^[ \t]*/
const WORD_CHAR_RE = /[A-Za-z0-9_]/
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const WORD_RE = /[\p{L}\p{N}_'’]+/gu
const INDENT = '  '

export const FORMAT_SHORTCUTS: Partial<Record<NoteFormatAction, string>> = {
  bold: 'Mod+B',
  italic: 'Mod+I',
  strike: 'Mod+Shift+X',
  code: 'Mod+E',
  link: 'Mod+K',
}

export function applyEdit(value: string, edit: NoteEdit): string {
  return value.slice(0, edit.start) + edit.text + value.slice(edit.end)
}

function lineStartAt(value: string, index: number): number {
  return index === 0 ? 0 : value.lastIndexOf('\n', index - 1) + 1
}

function lineEndAt(value: string, index: number): number {
  const next = value.indexOf('\n', index)
  return next === -1 ? value.length : next
}

// A selection that ends right after a line break does not pull the next line into the range.
function selectedLineRange(value: string, start: number, end: number): { from: number; to: number } {
  const anchoredEnd = end > start && value[end - 1] === '\n' ? end - 1 : end
  return { from: lineStartAt(value, start), to: lineEndAt(value, anchoredEnd) }
}

function lineEdit(start: number, end: number, from: number, to: number, lines: string[], next: string[]): NoteEdit {
  const text = next.join('\n')
  if (start === end) {
    const caret = Math.max(from, start + (next[0]!.length - lines[0]!.length))
    return { start: from, end: to, text, selectionStart: caret, selectionEnd: caret }
  }
  return { start: from, end: to, text, selectionStart: from, selectionEnd: from + text.length }
}

export function toggleInlineMark(value: string, start: number, end: number, mark: InlineMark): NoteEdit {
  const marker = INLINE_MARKERS[mark]
  const width = marker.length
  if (start === end) {
    while (start > 0 && WORD_CHAR_RE.test(value[start - 1]!)) start -= 1
    while (end < value.length && WORD_CHAR_RE.test(value[end]!)) end += 1
  }
  const selected = value.slice(start, end)
  if (selected.length >= width * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(width, selected.length - width)
    return { start, end, text: inner, selectionStart: start, selectionEnd: start + inner.length }
  }
  if (start >= width && value.slice(start - width, start) === marker && value.slice(end, end + width) === marker) {
    return { start: start - width, end: end + width, text: selected, selectionStart: start - width, selectionEnd: start - width + selected.length }
  }
  return { start, end, text: marker + selected + marker, selectionStart: start + width, selectionEnd: start + width + selected.length }
}

function hasLineMark(line: string, mark: LineMark): boolean {
  switch (mark) {
    case 'h1':
    case 'h2':
    case 'h3': {
      const match = HEADING_RE.exec(line)
      return match !== null && match[1]!.length === HEADING_LEVEL[mark]
    }
    case 'quote':
      return QUOTE_RE.test(line)
    case 'bullet':
      return BULLET_RE.test(line)
    case 'ordered':
      return ORDERED_RE.test(line)
    case 'task':
      return TASK_RE.test(line)
  }
}

function stripLineMark(line: string, mark: LineMark): string {
  if (mark === 'quote') return line.replace(QUOTE_RE, '')
  if (mark === 'h1' || mark === 'h2' || mark === 'h3') return line.replace(HEADING_RE, '')
  return line.replace(ANY_LIST_RE, '$1')
}

function addLineMark(line: string, mark: LineMark, ordinal: number): string {
  if (mark === 'quote') return `> ${line}`
  if (mark === 'h1' || mark === 'h2' || mark === 'h3') return `${'#'.repeat(HEADING_LEVEL[mark])} ${line.replace(HEADING_RE, '')}`
  const stripped = line.replace(ANY_LIST_RE, '$1')
  const indent = LEADING_SPACE_RE.exec(stripped)![0]
  const marker = mark === 'bullet' ? '- ' : mark === 'task' ? '- [ ] ' : `${ordinal}. `
  return `${indent}${marker}${stripped.slice(indent.length)}`
}

export function toggleLineMark(value: string, start: number, end: number, mark: LineMark): NoteEdit {
  const { from, to } = selectedLineRange(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const skipBlank = lines.length > 1
  const targets = skipBlank ? lines.filter((line) => line.trim().length > 0) : lines
  const marked = targets.length > 0 && targets.every((line) => hasLineMark(line, mark))
  let ordinal = 0
  const next = lines.map((line) => {
    if (skipBlank && line.trim().length === 0) return line
    ordinal += 1
    return marked ? stripLineMark(line, mark) : addLineMark(line, mark, ordinal)
  })
  return lineEdit(start, end, from, to, lines, next)
}

export function insertLink(value: string, start: number, end: number): NoteEdit {
  const selected = value.slice(start, end)
  if (/^https?:\/\/\S+$/.test(selected)) {
    return { start, end, text: `[text](${selected})`, selectionStart: start + 1, selectionEnd: start + 5 }
  }
  const label = selected || 'text'
  const text = `[${label}](url)`
  if (selected) {
    const urlStart = start + label.length + 3
    return { start, end, text, selectionStart: urlStart, selectionEnd: urlStart + 3 }
  }
  return { start, end, text, selectionStart: start + 1, selectionEnd: start + 1 + label.length }
}

// Blocks always sit between blank lines: a `---` glued to the previous line turns it into a setext heading,
// and a table swallows every following non-blank line as a row.
export function insertBlock(value: string, start: number, end: number, kind: BlockKind): NoteEdit {
  const selected = value.slice(start, end)
  const before = value.slice(0, start)
  const after = value.slice(end)
  const lead = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail = after.length === 0 ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  if (kind === 'hr') {
    const text = `${lead}---${trail}`
    return { start, end, text, selectionStart: start + text.length, selectionEnd: start + text.length }
  }
  if (kind === 'table') {
    const text = `${lead}| Header | Header |\n| --- | --- |\n| Cell | Cell |${trail}`
    const selectionStart = start + lead.length + 2
    return { start, end, text, selectionStart, selectionEnd: selectionStart + 'Header'.length }
  }
  const text = `${lead}\`\`\`\n${selected}\n\`\`\`${trail}`
  const selectionStart = start + lead.length + 4
  return { start, end, text, selectionStart, selectionEnd: selectionStart + selected.length }
}

export function resolveFormatAction(value: string, start: number, end: number, action: NoteFormatAction): NoteEdit {
  switch (action) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      return toggleInlineMark(value, start, end, action)
    case 'h1':
    case 'h2':
    case 'h3':
    case 'quote':
    case 'bullet':
    case 'ordered':
    case 'task':
      return toggleLineMark(value, start, end, action)
    case 'link':
      return insertLink(value, start, end)
    case 'codeBlock':
    case 'table':
    case 'hr':
      return insertBlock(value, start, end, action)
  }
}

/** Enter inside a list item continues the list; Enter on an empty item leaves it. Returns null when the browser should handle Enter. */
export function continueListOnEnter(value: string, start: number, end: number): NoteEdit | null {
  if (start !== end) return null
  const from = lineStartAt(value, start)
  const to = lineEndAt(value, start)
  const match = LIST_ITEM_RE.exec(value.slice(from, to))
  if (!match) return null
  const [, indent, bullet, gap, task = '', rest] = match
  if (rest!.length === 0) return { start: from, end: to, text: '', selectionStart: from, selectionEnd: from }
  if (start < from + indent!.length + bullet!.length + gap!.length + task.length) return null
  const ordered = /^\d+/.exec(bullet!)
  const nextBullet = ordered ? `${Number(ordered[0]) + 1}${bullet!.slice(ordered[0].length)}` : bullet!
  const text = `\n${indent}${nextBullet}${gap}${task ? '[ ] ' : ''}`
  return { start, end: start, text, selectionStart: start + text.length, selectionEnd: start + text.length }
}

export function indentLines(value: string, start: number, end: number, outdent: boolean): NoteEdit {
  if (!outdent && start === end) {
    return { start, end, text: INDENT, selectionStart: start + INDENT.length, selectionEnd: start + INDENT.length }
  }
  const { from, to } = selectedLineRange(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const next = lines.map((line) => {
    if (outdent) return line.replace(/^(?: {1,2}|\t)/, '')
    return lines.length > 1 && line.length === 0 ? line : INDENT + line
  })
  return lineEdit(start, end, from, to, lines, next)
}

/** CJK scripts count one character per word; everything else counts runs of letters and digits. */
export function countNoteStats(text: string): { words: number; chars: number } {
  const cjk = text.match(CJK_RE)?.length ?? 0
  const latin = text.replace(CJK_RE, ' ').match(WORD_RE)?.length ?? 0
  return { words: cjk + latin, chars: text.length }
}

export function noteExcerpt(content: string): string {
  const line = content.split('\n').find((candidate) => candidate.trim().length > 0)
  return line ? stripMarkdown(line) : ''
}

export function shortcutFormatAction(event: ShortcutKey): NoteFormatAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  const combo = `Mod+${event.shiftKey ? 'Shift+' : ''}${key}`
  const entry = (Object.entries(FORMAT_SHORTCUTS) as [NoteFormatAction, string][]).find(([, shortcut]) => shortcut === combo)
  return entry ? entry[0] : null
}

export function formatShortcut(shortcut: string, mac: boolean): string {
  return mac ? shortcut.replace('Mod+', '⌘').replace('Shift+', '⇧') : shortcut.replace('Mod+', 'Ctrl+')
}
