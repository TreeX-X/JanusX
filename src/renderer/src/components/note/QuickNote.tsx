import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getCardsByTerminal, useNoteStore } from '@/stores/note'
import styles from './QuickNote.module.css'
import { exportNoteCard, type QuickNoteExportFormat } from './quick-note-export'
import { formatNoteAge } from './quick-note-behavior'

const EXPORT_OPTIONS: { format: QuickNoteExportFormat; label: string }[] = [
  { format: 'md', label: 'Markdown (.md)' },
  { format: 'txt', label: 'Plain text (.txt)' },
  { format: 'html', label: 'HTML (.html)' },
]

export function QuickNote({ terminalId, onPasteToTerminal }: { terminalId: string; onPasteToTerminal: (text: string) => void }) {
  const cards = useNoteStore((state) => getCardsByTerminal(state, terminalId))
  const activeId = useNoteStore((state) => state.activeCardIdByTerminal[terminalId] ?? null)
  const addCard = useNoteStore((state) => state.addCard)
  const removeCard = useNoteStore((state) => state.removeCard)
  const updateCard = useNoteStore((state) => state.updateCard)
  const setActiveCard = useNoteStore((state) => state.setActiveCard)
  const [preview, setPreview] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const active = cards.find((card) => card.id === activeId) ?? null

  useEffect(() => {
    if (!preview) editorRef.current?.focus()
  }, [active?.id, preview])

  const selectCard = (cardId: string) => {
    setPreview(false)
    setExportOpen(false)
    setActiveCard(terminalId, cardId)
  }

  const createCard = () => {
    setPreview(false)
    setExportOpen(false)
    addCard(terminalId)
  }

  const exportCard = (format: QuickNoteExportFormat) => {
    setExportOpen(false)
    setExportError('')
    void exportNoteCard(active!, format).catch((error) => setExportError(error instanceof Error ? error.message : 'Export failed'))
  }

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar} aria-label="Notes for active terminal">
        <div className={styles.list}>
          {cards.length === 0 && <div className={styles.listEmpty}>No notes yet</div>}
          {cards.map((card) => (
            <div key={card.id} className={`${styles.card} ${card.id === activeId ? styles.active : ''}`}>
              <button type="button" className={styles.selectCard} onClick={() => selectCard(card.id)}>
                <span>{card.title || 'Untitled'}</span>
                <time dateTime={new Date(card.updatedAt).toISOString()}>{formatNoteAge(card.updatedAt)}</time>
              </button>
              <button type="button" className={styles.deleteCard} aria-label={`Delete ${card.title || 'Untitled'}`} onClick={() => removeCard(terminalId, card.id)}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className={styles.add} onClick={createCard}>+ New note</button>
      </aside>
      <section className={styles.editor} aria-label="Note editor">
        {!active ? (
          <div className={styles.empty}>Create a note for this terminal.</div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <input value={active.title} aria-label="Note title" onChange={(event) => updateCard(terminalId, active.id, { title: event.target.value })} />
              <div>
                <button type="button" onClick={() => setPreview(false)} aria-pressed={!preview}>Edit</button>
                <button type="button" onClick={() => setPreview(true)} aria-pressed={preview}>Preview</button>
              </div>
            </div>
            {preview ? (
              <div className={styles.preview}><ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown></div>
            ) : (
              <textarea ref={editorRef} aria-label="Note content" value={active.content} onChange={(event) => updateCard(terminalId, active.id, { content: event.target.value })} />
            )}
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
                >Export</button>
                {exportOpen && (
                  <div className={styles.exportMenu} role="menu" aria-label="Export format">
                    {EXPORT_OPTIONS.map(({ format, label }) => (
                      <button key={format} type="button" role="menuitem" onClick={() => exportCard(format)}>{label}</button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className={styles.paste} onClick={() => onPasteToTerminal(active.content)}>Paste to terminal</button>
            </div>
            {exportError && <div role="alert" className={styles.error}>{exportError}</div>}
          </>
        )}
      </section>
    </div>
  )
}
