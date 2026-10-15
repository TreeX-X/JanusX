// Note: the note pane routes toolbar edits through execCommand so the browser keeps undo history — see .agents/notes/workbench/note-drawer-markdown-toolbar.md
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { getDraftsByScope, useDraftCardStore } from '@/stores/draft-card'
import { useI18n } from '@/i18n/useI18n'
import { ThemedTooltip } from '../ui/ThemedTooltip'
import styles from './QuickNote.module.css'
import tabs from '../ui/TabStrip.module.css'
import { exportDraftCard, type QuickNoteExportFormat } from './quick-note-export'
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
import { MarkdownIcon } from '../ui/MarkdownIcon'

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

// Below this width the card list would leave the editor narrower than the toolbar, so the list folds
// into a rail on its own. The fold is only the default — the rail carries an expand control, and a
// manual fold/expand sticks until the pane crosses this threshold again.
const COMPACT_WIDTH = 520
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Markdown 编辑器。草稿按 `scopeId`（工作区，或无项目时的全局作用域）归属，
 * 因此面板可以放在任意 pane、分屏或合并后继续编辑同一正文；
 * `onPasteToTerminal` 只为可选的"粘贴到终端"动作服务，没有终端时留空即可正常写作。
 */
export function QuickNote({
  scopeId,
  sourceTerminalId,
  onPasteToTerminal,
}: {
  scopeId: string
  sourceTerminalId?: string
  onPasteToTerminal?: (text: string) => void
}) {
  const { t } = useI18n('terminal')
  const drafts = useDraftCardStore((state) => getDraftsByScope(state, scopeId))
  const activeId = useDraftCardStore((state) => state.activeDraftIdByScope[scopeId] ?? null)
  const addDraft = useDraftCardStore((state) => state.addDraft)
  const removeDraft = useDraftCardStore((state) => state.removeDraft)
  const updateDraft = useDraftCardStore((state) => state.updateDraft)
  const setActiveDraft = useDraftCardStore((state) => state.setActiveDraft)
  const [mode, setMode] = useState<NoteMode>('edit')
  const [compact, setCompact] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const active = drafts.find((draft) => draft.id === activeId) ?? null
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

  // 宽度跨过阈值时重新听自动折叠：用户手动展开/折叠是显式选择，但只在本侧宽区间内有效，
  // 拖宽或拖窄回到另一侧时仍按该侧的默认来。只依赖 compact（仅跨阈值时变化），因此不会
  // 每次手动切换都把用户的选择冲掉。
  useEffect(() => {
    setCollapsed(compact)
  }, [compact])

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
    updateDraft(scopeId, active.id, { content: expected })
  }, [active, scopeId, updateDraft])

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

  const selectDraft = (draftId: string) => {
    setExportOpen(false)
    setActiveDraft(scopeId, draftId)
  }

  const createDraft = () => {
    setMode('edit')
    setExportOpen(false)
    addDraft(scopeId, sourceTerminalId)
  }

  const exportDraft = (format: QuickNoteExportFormat) => {
    setExportOpen(false)
    setExportError('')
    void exportDraftCard(active!, format).catch((error) => setExportError(error instanceof Error ? error.message : 'Export failed'))
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
    <div ref={rootRef} className={styles.root} data-compact={compact} data-collapsed={collapsed}>
      <aside className={styles.sidebar} aria-label={t('terminal:note.listAria')}>
        <div className={styles.sidebarHead}>
          <span className={styles.sidebarTitle}>
            {t('terminal:note.listTitle')}
            <span className={styles.sidebarCount}>{drafts.length}</span>
          </span>
          <div className={styles.sidebarHeadActions}>
            <button type="button" className={styles.tool} onClick={createDraft} title={t('terminal:note.newNote')} aria-label={t('terminal:note.newNote')}>
              <Plus strokeWidth={1.75} aria-hidden="true" />
            </button>
            {/* 折叠与工作区侧栏同构：主体给 PanelLeftClose，aria 指向真正被折叠的列表 */}
            <ThemedTooltip label={t('terminal:note.collapseList')}>
              <button
                type="button"
                className={styles.tool}
                onClick={() => setCollapsed(true)}
                aria-expanded={false}
                aria-controls={listId}
                aria-label={t('terminal:note.collapseList')}
              >
                <PanelLeftClose size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </ThemedTooltip>
          </div>
        </div>
        <div className={styles.list} id={listId}>
          {drafts.length === 0 && <div className={styles.listEmpty}>{t('terminal:note.listEmpty')}</div>}
          {drafts.map((draft) => {
            const title = draft.title || t('terminal:note.untitled')
            return (
              <div key={draft.id} className={`${styles.card} ${draft.id === activeId ? styles.active : ''}`}>
                <button type="button" className={styles.selectCard} aria-current={draft.id === activeId ? 'true' : undefined} onClick={() => selectDraft(draft.id)}>
                  <span className={styles.cardTitle}>{title}</span>
                  <span className={styles.cardMeta}>
                    <span className={styles.cardExcerpt}>{noteExcerpt(draft.content) || t('terminal:note.emptyExcerpt')}</span>
                    <time dateTime={new Date(draft.updatedAt).toISOString()}>{formatNoteAge(draft.updatedAt)}</time>
                  </span>
                </button>
                <button type="button" className={styles.deleteCard} aria-label={t('terminal:note.deleteNote', { title })} title={t('terminal:note.deleteNote', { title })} onClick={() => removeDraft(scopeId, draft.id)}>
                  <Trash2 size={12} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
        {/* 折叠态导轨：窄 pane 里列表让位给编辑器，但新建与展开仍在一击之内 */}
        <div className={styles.rail}>
          <ThemedTooltip label={t('terminal:note.expandList')}>
            <button
              type="button"
              className={styles.railButton}
              onClick={() => setCollapsed(false)}
              aria-expanded
              aria-controls={listId}
              aria-label={t('terminal:note.expandList')}
            >
              <PanelLeftOpen size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </ThemedTooltip>
          <button type="button" className={styles.railButton} onClick={createDraft} title={t('terminal:note.newNote')} aria-label={t('terminal:note.newNote')}>
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span className={styles.railCount}>{drafts.length}</span>
        </div>
      </aside>
      <section className={styles.editor} aria-label={t('terminal:note.editorAria')}>
        {!active ? (
          <div className={styles.empty}>
            <MarkdownIcon className={styles.emptyIcon} strokeWidth={1.4} aria-hidden="true" />
            <span>{t('terminal:note.empty')}</span>
            <div className={styles.actions}>
              <button type="button" onClick={createDraft}>
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
                onChange={(event) => updateDraft(scopeId, active.id, { title: event.target.value })}
              />
              <div className={tabs.strip} role="group" aria-label={t('terminal:note.modeAria')}>
                {MODES.map(({ mode: item, icon: Icon, labelKey }) => (
                  <button
                    key={item}
                    type="button"
                    className={tabs.tab}
                    aria-pressed={mode === item}
                    title={t(labelKey)}
                    onClick={() => setMode(item)}
                  >
                    <Icon className={tabs.icon} strokeWidth={1.75} aria-hidden="true" />
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
                  onChange={(event) => updateDraft(scopeId, active.id, { content: event.target.value })}
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
                        <button key={format} type="button" role="menuitem" onClick={() => exportDraft(format)}>{label}</button>
                      ))}
                    </div>
                  )}
                </div>
                {onPasteToTerminal && (
                  <button type="button" className={styles.paste} onClick={() => onPasteToTerminal(active.content)}>
                    <ClipboardPaste strokeWidth={1.75} aria-hidden="true" />
                    {t('terminal:note.pasteToTerminal')}
                  </button>
                )}
              </div>
            </div>
            {exportError && <div role="alert" className={styles.error}>{exportError}</div>}
          </>
        )}
      </section>
    </div>
  )
}
