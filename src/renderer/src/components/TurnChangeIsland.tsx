import { useEffect, useRef, useState } from 'react'
import { useTurnChangesStore, type TerminalTurnChangesEvent } from '@/stores/turn-changes'
import { useWorkspaceStore } from '@/stores/workspace'
import { useEditorStore } from '@/stores/editor'
import { useI18n } from '@/i18n/useI18n'

const COLLAPSE_TTL_MS = 6000
const NARROW_PANE_PX = 360
const MAX_VISIBLE_FILES = 10
const MAX_HISTORY_FILES_PER_TURN = 5

type IslandView = 'latest' | 'history'

const EMPTY_TURNS: TerminalTurnChangesEvent[] = []

// Note: per-terminal turn file history lives on the pane's right edge — see .agents/notes/2026-09-23-terminal-right-island-turn-history--70beb72a.md
/**
 * Turn-change island: one persistent overlay per terminal pane, identical for
 * all engines. The pill stays on the right edge once the first turn lands;
 * single click expands the latest turn, double click expands per-turn history.
 * File rows reuse the embedded editor preview; the session panel holds the
 * audit record.
 */
export function TurnChangeIsland({ terminalId, focused }: { terminalId: string; focused: boolean }) {
  const { t } = useI18n('terminal')
  const change = useTurnChangesStore((s) => s.changesByTerminal[terminalId])
  const history = useTurnChangesStore((s) => s.historyByTerminal[terminalId] ?? EMPTY_TURNS)
  const subscribeToEvents = useTurnChangesStore((s) => s.subscribeToEvents)
  const cwd = useWorkspaceStore((s) => {
    const active = s.terminals.find((item) => item.id === terminalId)
    if (active) return active.cwd
    for (const snapshot of Object.values(s.terminalSnapshots)) {
      const found = snapshot.terminals.find((item) => item.id === terminalId)
      if (found) return found.cwd
    }
    return null
  })
  const openFile = useEditorStore((s) => s.openFile)
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<IslandView>('latest')
  const [pinned, setPinned] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  useEffect(() => subscribeToEvents(), [subscribeToEvents])

  // New turn-end arrives: expand only when this pane is focused; unfocused
  // and narrow panes keep the pill with the fresh count as the signal.
  const turnKey = change ? `${change.checkpointId ?? ''}:${change.endedAt}` : null
  useEffect(() => {
    if (!turnKey) return
    setExpanded(focusedRef.current && !narrow)
    setView('latest')
    setPinned(false)
  }, [turnKey, narrow])

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
  }, [expanded, pinned, hovering, focusWithin, turnKey, view])

  // Esc and click-away collapse the island to the persistent pill.
  useEffect(() => {
    if (!expanded || !change) return
    const onPointerDown = (event: PointerEvent) => {
      if (pinned) return
      if (rootRef.current?.contains(event.target as Node)) return
      setExpanded(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setExpanded(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, pinned, change])
  if (!change) return null

  const summary = `${t('terminal:turnChanges.files', { count: change.fileCount })} · +${change.additions} −${change.deletions}`
  const visibleFiles = change.files.slice(0, MAX_VISIBLE_FILES)
  const hiddenCount = change.fileCount - visibleFiles.length

  const openPreview = (relPath: string, status: string) => {
    if (!cwd || status === 'deleted') return
    void openFile(`${cwd}/${relPath}`.replace(/\\/g, '/'), cwd)
  }

  const expandLatest = () => {
    if (narrow) return
    setView('latest')
    setExpanded(true)
    setPinned(true)
  }

  const expandHistory = () => {
    if (narrow) return
    setView('history')
    setExpanded(true)
    setPinned(true)
  }

  return (
    <div
      ref={rootRef}
      data-turn-island=""
      data-stage={expanded ? 'expanded' : 'collapsed'}
      data-view={expanded ? view : undefined}
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
        top: '50%',
        transform: 'translateY(-50%)',
        width: expanded ? 'min(320px, 60%)' : 'auto',
        maxHeight: expanded ? '70%' : 'none',
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
          title={t('terminal:turnChanges.hint')}
          onClick={expandLatest}
          onDoubleClick={expandHistory}
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
          {history.length > 1 ? ` · ${t('terminal:turnChanges.turns', { count: history.length })}` : null}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="flex items-center" style={{ gap: 8, padding: '8px 10px 6px' }}>
            <button
              type="button"
              onClick={() => setView('latest')}
              onMouseDown={(event) => event.stopPropagation()}
              className="cursor-pointer"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontFamily: "'SF Mono', monospace",
                fontSize: 10.5,
                color: view === 'latest' ? '#d4d4d4' : '#666',
              }}
            >
              {t('terminal:turnChanges.latest')}
            </button>
            <button
              type="button"
              onClick={() => setView('history')}
              onMouseDown={(event) => event.stopPropagation()}
              className="cursor-pointer"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontFamily: "'SF Mono', monospace",
                fontSize: 10.5,
                color: view === 'history' ? '#d4d4d4' : '#666',
              }}
            >
              {t('terminal:turnChanges.history', { count: history.length })}
            </button>
            <button
              type="button"
              aria-label="close"
              onClick={() => setExpanded(false)}
              onMouseDown={(event) => event.stopPropagation()}
              className="cursor-pointer"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#666', fontSize: 12, padding: '0 2px' }}
            >
              ×
            </button>
          </div>
          {view === 'latest' ? (
            <div style={{ overflowY: 'auto', padding: '0 10px 8px', fontFamily: "'SF Mono', monospace", fontSize: 10.5, lineHeight: 1.9 }}>
              <div style={{ color: '#d4d4d4', marginBottom: 2 }}>{summary}</div>
              {visibleFiles.map((file) => (
                <FileRow
                  key={file.path}
                  path={file.path}
                  status={file.status}
                  additions={file.additions}
                  deletions={file.deletions}
                  size={file.size}
                  disabled={!cwd || file.status === 'deleted'}
                  title={file.status === 'deleted' ? t('terminal:turnChanges.deletedNoPreview') : t('terminal:turnChanges.openFile')}
                  onOpen={() => openPreview(file.path, file.status)}
                />
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
          ) : (
            <div style={{ overflowY: 'auto', padding: '0 10px 8px', fontFamily: "'SF Mono', monospace", fontSize: 10.5, lineHeight: 1.9 }}>
              {[...history].reverse().map((turn, reversedIndex) => (
                <HistoryTurn
                  key={`${turn.checkpointId ?? turn.endedAt}:${turn.endedAt}`}
                  index={history.length - reversedIndex}
                  turn={turn}
                  onOpen={(relPath, status) => openPreview(relPath, status)}
                  openTitle={t('terminal:turnChanges.openFile')}
                  deletedTitle={t('terminal:turnChanges.deletedNoPreview')}
                  canPreview={cwd !== null}
                />
              ))}
              {history.length === 0 && (
                <div style={{ color: '#555', fontSize: 10 }}>{t('terminal:turnChanges.empty')}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FileRow({
  path,
  status,
  additions,
  deletions,
  size,
  disabled,
  title,
  onOpen,
}: {
  path: string
  status: string
  additions: number | null
  deletions: number | null
  size: number
  disabled: boolean
  title: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onOpen}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className="flex w-full text-left"
      style={{
        gap: 8,
        background: 'none',
        border: 'none',
        padding: '1px 0',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span className="flex-1 min-w-0 overflow-hidden overflow-ellipsis whitespace-nowrap" style={{ color: '#999' }}>
        {path}
      </span>
      <FileCounts
        additions={additions}
        deletions={deletions}
        status={status}
        size={size}
      />
    </button>
  )
}

function HistoryTurn({
  index,
  turn,
  onOpen,
  openTitle,
  deletedTitle,
  canPreview,
}: {
  index: number
  turn: TerminalTurnChangesEvent
  onOpen: (relPath: string, status: string) => void
  openTitle: string
  deletedTitle: string
  canPreview: boolean
}) {
  const visible = turn.files.slice(0, MAX_HISTORY_FILES_PER_TURN)
  const hidden = turn.fileCount - visible.length
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: '#d4d4d4', fontSize: 10.5 }}>
        #{index} · {turn.kind} · {turn.fileCount} · +{turn.additions} −{turn.deletions}
      </div>
      {visible.map((file) => (
        <FileRow
          key={file.path}
          path={file.path}
          status={file.status}
          additions={file.additions}
          deletions={file.deletions}
          size={file.size}
          disabled={!canPreview || file.status === 'deleted'}
          title={file.status === 'deleted' ? deletedTitle : openTitle}
          onOpen={() => onOpen(file.path, file.status)}
        />
      ))}
      {hidden > 0 && <div style={{ color: '#555', fontSize: 10 }}>+{hidden}</div>}
      {visible.length === 0 && <div style={{ color: '#555', fontSize: 10 }}>—</div>}
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
