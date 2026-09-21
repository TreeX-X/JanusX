import { useEffect, useRef, useState } from 'react'
import { useTurnChangesStore } from '@/stores/turn-changes'
import { useI18n } from '@/i18n/useI18n'

const COLLAPSE_TTL_MS = 6000
const NARROW_PANE_PX = 360
const MAX_VISIBLE_FILES = 10

/**
 * Turn-change island: one overlay per terminal pane, identical for all
 * engines. Transient signal only — the session panel holds the record.
 */
export function TurnChangeIsland({ terminalId, focused }: { terminalId: string; focused: boolean }) {
  const { t } = useI18n('terminal')
  const change = useTurnChangesStore((s) => s.changesByTerminal[terminalId])
  const dismiss = useTurnChangesStore((s) => s.dismiss)
  const subscribeToEvents = useTurnChangesStore((s) => s.subscribeToEvents)
  const [expanded, setExpanded] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  useEffect(() => subscribeToEvents(), [subscribeToEvents])

  // New turn-end arrives: expand only when this pane is focused.
  useEffect(() => {
    if (!change) return
    setExpanded(focusedRef.current && !narrow)
    setPinned(false)
  }, [change, narrow])

  // Pane width decides whether the expanded form fits at all.
  useEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setNarrow(width > 0 && width < NARROW_PANE_PX)
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  // TTL: collapse back to the pill, paused on hover/focus, cleared on pin.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!expanded || pinned || hovering || focusWithin) return
    timerRef.current = setTimeout(() => {
      setExpanded(false)
      timerRef.current = null
    }, COLLAPSE_TTL_MS)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [expanded, pinned, hovering, focusWithin, change?.endedAt])

  // Esc and click-away dismiss the island until the next turn.
  useEffect(() => {
    if (!expanded || !change) return
    const onPointerDown = (event: PointerEvent) => {
      if (pinned) return
      if (rootRef.current?.contains(event.target as Node)) return
      dismiss(terminalId)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      dismiss(terminalId)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, pinned, change, dismiss, terminalId])
  if (!change) return null

  const summary = `${t('terminal:turnChanges.files', { count: change.fileCount })} · +${change.additions} −${change.deletions}`
  const visibleFiles = change.files.slice(0, MAX_VISIBLE_FILES)
  const hiddenCount = change.fileCount - visibleFiles.length

  return (
    <div
      ref={rootRef}
      data-turn-island=""
      data-stage={expanded ? 'expanded' : 'collapsed'}
      onMouseDown={(event) => {
        // The chrome never steals xterm focus; only controls focus themselves.
        event.preventDefault()
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={() => setFocusWithin(false)}
      className="absolute z-20"
      style={{
        right: 8,
        // Heuristic composer clearance: the CLI prompt band lives at the
        // bottom of the TUI and reports no geometry to the shell.
        bottom: 72,
        width: expanded ? 'min(300px, 52%)' : 'auto',
        maxHeight: expanded ? 'min(46%, 320px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--shell-chrome)',
        border: '1px solid var(--shell-border)',
        borderRadius: expanded ? 8 : 999,
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1), height 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => {
            if (narrow) return
            setExpanded(true)
            setPinned(true)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className="cursor-pointer whitespace-nowrap"
          style={{
            background: 'none',
            border: 'none',
            color: '#cfcfcf',
            fontFamily: "'SF Mono', monospace",
            fontSize: 10.5,
            padding: '5px 12px',
            lineHeight: 1.4,
          }}
        >
          {summary}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="flex items-center" style={{ gap: 8, padding: '8px 10px 6px' }}>
            <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10.5, color: '#d4d4d4' }}>
              {summary}
            </span>
            <button
              type="button"
              aria-label="close"
              onClick={() => dismiss(terminalId)}
              onMouseDown={(event) => event.stopPropagation()}
              className="cursor-pointer"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#666', fontSize: 12, padding: '0 2px' }}
            >
              ×
            </button>
          </div>
          <div style={{ overflowY: 'auto', padding: '0 10px 8px', fontFamily: "'SF Mono', monospace", fontSize: 10.5, lineHeight: 1.9 }}>
            {visibleFiles.map((file) => (
              <div key={file.path} className="flex" style={{ gap: 8 }}>
                <span className="flex-1 min-w-0 overflow-hidden overflow-ellipsis whitespace-nowrap" style={{ color: '#999' }}>
                  {file.path}
                </span>
                <FileCounts
                  additions={file.additions}
                  deletions={file.deletions}
                  status={file.status}
                  size={file.size}
                />
              </div>
            ))}
            {hiddenCount > 0 && (
              <div style={{ color: '#555', fontSize: 10 }}>
                {t('terminal:turnChanges.more', { count: hiddenCount })}
              </div>
            )}
            {visibleFiles.length === 0 && (
              <div style={{ color: '#555', fontSize: 10 }}>{t('terminal:turnChanges.empty')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FileCounts({
  additions,
  deletions,
  status,
  size,
}: {
  additions: number | null
  deletions: number | null
  status: string
  size: number
}) {
  if (status === 'binary' || status === 'oversized') {
    const kb = size < 1024 ? `${size}B` : `${Math.round(size / 1024)}KB`
    return (
      <span style={{ color: '#8ab4ff', flexShrink: 0 }}>
        {status} · {kb}
      </span>
    )
  }
  return (
    <span style={{ flexShrink: 0 }}>
      {(additions ?? 0) > 0 && <span style={{ color: '#4ec9b0' }}>+{additions} </span>}
      {(deletions ?? 0) > 0 && <span style={{ color: '#e06c75' }}>−{deletions}</span>}
    </span>
  )
}
