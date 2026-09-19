// Note: the note pane routes toolbar edits through execCommand so the browser keeps undo history — see .agents/notes/implemented/feature/2026-09-19-note-drawer-markdown-toolbar.md
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bold,
  ClipboardPaste,
  Code,
  Columns2,
  Download,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  NotebookPen,
  PencilLine,
  Plus,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { getCardsByTerminal, useNoteStore } from '@/stores/note'
import { useI18n } from '@/i18n/useI18n'
import styles from './QuickNote.module.css'
import segmented from '../ui/SegmentedControl.module.css'
import { exportNoteCard, type QuickNoteExportFormat } from './quick-note-export'
import { formatNoteAge } from './quick-note-behavior'
import {
  applyEdit,
  continueListOnEnter,
  countNoteStats,
  FORMAT_SHORTCUTS,
  formatShortcut,
  indentLines,
  noteExcerpt,
  resolveFormatAction,
  shortcutFormatAction,
  type NoteEdit,
  type NoteFormatAction,
} from './quick-note-format'
import { MARKDOWN_COMPONENTS } from '@/components/viewers/markdown-components'

const EXPORT_OPTIONS: { format: QuickNoteExportFormat; label: string }[] = [
  { format: 'md', label: 'Markdown (.md)' },
  { format: 'txt', label: 'Plain text (.txt)' },
  { format: 'html', label: 'HTML (.html)' },
]

type NoteMode = 'edit' | 'split' | 'preview'

const MODES: { mode: NoteMode; icon: LucideIcon; labelKey: `terminal:note.mode.${NoteMode}` }[] = [
  { mode: 'edit', icon: PencilLine, labelKey: 'terminal:note.mode.edit' },
  { mode: 'split', icon: Columns2, labelKey: 'terminal:note.mode.split' },
  { mode: 'preview', icon: Eye, labelKey: 'terminal:note.mode.preview' },
]

const TOOL_GROUPS: { action: NoteFormatAction; icon: LucideIcon }[][] = [
  [{ action: 'h1', icon: Heading1 }, { action: 'h2', icon: Heading2 }, { action: 'h3', icon: Heading3 }],
  [{ action: 'bold', icon: Bold }, { action: 'italic', icon: Italic }, { action: 'strike', icon: Strikethrough }, { action: 'code', icon: Code }],
  [{ action: 'bullet', icon: List }, { action: 'ordered', icon: ListOrdered }, { action: 'task', icon: ListChecks }, { action: 'quote', icon: Quote }],
  [{ action: 'link', icon: Link }, { action: 'codeBlock', icon: SquareCode }, { action: 'table', icon: Table }, { action: 'hr', icon: Minus }],
]

// Below this width the card list would leave the editor narrower than the toolbar, so the list folds away.
const COMPACT_WIDTH = 520
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function QuickNote({ terminalId, onPasteToTerminal }: { terminalId: string; onPasteToTerminal: (text: string) => void }) {
  const { t } = useI18n('terminal')
  const cards = useNoteStore((state) => getCardsByTerminal(state, terminalId))
  const activeId = useNoteStore((state) => state.activeCardIdByTerminal[terminalId] ?? null)
  const addCard = useNoteStore((state) => state.addCard)
  const removeCard = useNoteStore((state) => state.removeCard)
  const updateCard = useNoteStore((state) => state.updateCard)
  const setActiveCard = useNoteStore((state) => state.setActiveCard)
  const [mode, setMode] = useState<NoteMode>('edit')
  const [compact, setCompact] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const active = cards.find((card) => card.id === activeId) ?? null
  const editing = mode !== 'preview'

  useEffect(() => {
    if (editing) editorRef.current?.focus()
  }, [active?.id, editing])

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCompact(entry.contentRect.width < COMPACT_WIDTH)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // The selection is restored after React commits the new value; setting it before the commit would be overwritten.
  useLayoutEffect(() => {
    const selection = pendingSelectionRef.current
    const editor = editorRef.current
    if (!selection || !editor) return
    pendingSelectionRef.current = null
    editor.setSelectionRange(selection.start, selection.end)
  })

  const previewComponents = useMemo(() => MARKDOWN_COMPONENTS, [])
  const stats = useMemo(() => countNoteStats(active?.content ?? ''), [active?.content])

  const commitEdit = useCallback((edit: NoteEdit) => {
    const editor = editorRef.current
    if (!editor || !active) return
    const expected = applyEdit(active.content, edit)
    if (expected === active.content) return
    editor.focus()
    editor.setSelectionRange(edit.start, edit.end)
    // `insertText` / `delete` keep the edit inside the textarea's native undo stack and fire `input`, which updates the store.
    const inserted = typeof document.execCommand === 'function'
      && (edit.text.length > 0 ? document.execCommand('insertText', false, edit.text) : document.execCommand('delete'))
    if (inserted && editor.value === expected) {
      editor.setSelectionRange(edit.selectionStart, edit.selectionEnd)
      return
    }
    pendingSelectionRef.current = { start: edit.selectionStart, end: edit.selectionEnd }
    updateCard(terminalId, active.id, { content: expected })
  }, [active, terminalId, updateCard])

  const runAction = useCallback((action: NoteFormatAction) => {
    const editor = editorRef.current
    if (!editor || !active) return
    commitEdit(resolveFormatAction(active.content, editor.selectionStart, editor.selectionEnd, action))
  }, [active, commitEdit])

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const editor = event.currentTarget
    if (!active) return
    const action = shortcutFormatAction(event)
    if (action) {
      event.preventDefault()
      runAction(action)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const edit = continueListOnEnter(active.content, editor.selectionStart, editor.selectionEnd)
      if (!edit) return
      event.preventDefault()
      commitEdit(edit)
      return
    }
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      commitEdit(indentLines(active.content, editor.selectionStart, editor.selectionEnd, event.shiftKey))
    }
  }

  const selectCard = (cardId: string) => {
    setExportOpen(false)
    setActiveCard(terminalId, cardId)
  }

  const createCard = () => {
    setMode('edit')
    setExportOpen(false)
    addCard(terminalId)
  }

  const exportCard = (format: QuickNoteExportFormat) => {
    setExportOpen(false)
    setExportError('')
    void exportNoteCard(active!, format).catch((error) => setExportError(error instanceof Error ? error.message : 'Export failed'))
  }

  const toolTitle = (action: NoteFormatAction): string => {
    const label = t(`terminal:note.tool.${action}`)
    const shortcut = FORMAT_SHORTCUTS[action]
    return shortcut ? `${label} (${formatShortcut(shortcut, IS_MAC)})` : label
  }

  const preview = (
    <div className={`${styles.preview} markdown-preview`} aria-label={t('terminal:note.previewAria')}>
      {active && active.content.trim().length > 0
        ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewComponents}>{active.content}</ReactMarkdown>
        : <div className={styles.previewEmpty}>{t('terminal:note.previewEmpty')}</div>}
    </div>
  )

  return (
    <div ref={rootRef} className={styles.root} data-compact={compact}>
      <aside className={styles.sidebar} aria-label={t('terminal:note.listAria')}>
        <div className={styles.sidebarHead}>
          <span className={styles.sidebarTitle}>
            {t('terminal:note.listTitle')}
            <span className={styles.sidebarCount}>{cards.length}</span>
          </span>
          <button type="button" className={styles.tool} onClick={createCard} title={t('terminal:note.newNote')} aria-label={t('terminal:note.newNote')}>
            <Plus strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.list}>
          {cards.length === 0 && <div className={styles.listEmpty}>{t('terminal:note.listEmpty')}</div>}
          {cards.map((card) => {
            const title = card.title || t('terminal:note.untitled')
            return (
              <div key={card.id} className={`${styles.card} ${card.id === activeId ? styles.active : ''}`}>
                <button type="button" className={styles.selectCard} aria-current={card.id === activeId ? 'true' : undefined} onClick={() => selectCard(card.id)}>
                  <span className={styles.cardTitle}>{title}</span>
                  <span className={styles.cardMeta}>
                    <span className={styles.cardExcerpt}>{noteExcerpt(card.content) || t('terminal:note.emptyExcerpt')}</span>
                    <time dateTime={new Date(card.updatedAt).toISOString()}>{formatNoteAge(card.updatedAt)}</time>
                  </span>
                </button>
                <button type="button" className={styles.deleteCard} aria-label={t('terminal:note.deleteNote', { title })} title={t('terminal:note.deleteNote', { title })} onClick={() => removeCard(terminalId, card.id)}>
                  <Trash2 size={12} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      </aside>
      <section className={styles.editor} aria-label={t('terminal:note.editorAria')}>
        {!active ? (
          <div className={styles.empty}>
            <NotebookPen className={styles.emptyIcon} strokeWidth={1.5} aria-hidden="true" />
            <span>{t('terminal:note.empty')}</span>
            <div className={styles.actions}>
              <button type="button" onClick={createCard}>
                <Plus strokeWidth={1.75} aria-hidden="true" />
                {t('terminal:note.newNote')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.head}>
              <input
                className={styles.title}
                value={active.title}
                aria-label={t('terminal:note.titleAria')}
                placeholder={t('terminal:note.untitled')}
                spellCheck={false}
                onChange={(event) => updateCard(terminalId, active.id, { title: event.target.value })}
              />
              <div className={segmented.group} role="group" aria-label={t('terminal:note.modeAria')}>
                {MODES.map(({ mode: item, icon: Icon, labelKey }) => (
                  <button
                    key={item}
                    type="button"
                    className={segmented.item}
                    aria-pressed={mode === item}
                    title={t(labelKey)}
                    onClick={() => setMode(item)}
                  >
                    <Icon className={segmented.icon} strokeWidth={1.75} aria-hidden="true" />
                    {!compact && <span>{t(labelKey)}</span>}
                  </button>
                ))}
              </div>
            </div>
            {editing && (
              <div className={styles.toolbar} role="toolbar" aria-label={t('terminal:note.toolbarAria')}>
                {TOOL_GROUPS.map((group, index) => (
                  <div key={index} className={styles.toolGroup}>
                    {group.map(({ action, icon: Icon }) => (
                      <button
                        key={action}
                        type="button"
                        className={styles.tool}
                        title={toolTitle(action)}
                        aria-label={t(`terminal:note.tool.${action}`)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runAction(action)}
                      >
                        <Icon strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.body} data-mode={mode}>
              {editing && (
                <textarea
                  ref={editorRef}
                  aria-label={t('terminal:note.contentAria')}
                  placeholder={t('terminal:note.placeholder')}
                  spellCheck={false}
                  value={active.content}
                  onChange={(event) => updateCard(terminalId, active.id, { content: event.target.value })}
                  onKeyDown={handleEditorKeyDown}
                />
              )}
              {mode !== 'edit' && preview}
            </div>
            <div className={styles.foot}>
              <div className={styles.stats}>
                <span>{t('terminal:note.stats.words', { value: stats.words })}</span>
                <span>{t('terminal:note.stats.chars', { value: stats.chars })}</span>
              </div>
              <div className={styles.actions}>
                <div
                  className={styles.exportControl}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExportOpen(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') return
                    event.stopPropagation()
                    setExportOpen(false)
                    exportButtonRef.current?.focus()
                  }}
                >
                  <button
                    ref={exportButtonRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={exportOpen}
                    onClick={() => setExportOpen((open) => !open)}
                  >
                    <Download strokeWidth={1.75} aria-hidden="true" />
                    {t('terminal:note.export')}
                  </button>
                  {exportOpen && (
                    <div className={styles.exportMenu} role="menu" aria-label="Export format">
                      {EXPORT_OPTIONS.map(({ format, label }) => (
                        <button key={format} type="button" role="menuitem" onClick={() => exportCard(format)}>{label}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className={styles.paste} onClick={() => onPasteToTerminal(active.content)}>
                  <ClipboardPaste strokeWidth={1.75} aria-hidden="true" />
                  {t('terminal:note.pasteToTerminal')}
                </button>
              </div>
            </div>
            {exportError && <div role="alert" className={styles.error}>{exportError}</div>}
          </>
        )}
      </section>
    </div>
  )
}
