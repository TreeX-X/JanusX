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
 * Turn-change island: one persistent vertical overlay per terminal pane,
 * identical for all engines. It stays docked to the right edge even before
 * the first turn lands (empty state); single click expands the latest turn
 * (compact), double click expands per-turn history (larger). Shell morphs
 * with a Dynamic-Island overshoot curve, content follows with a delayed
 * fade-scale. File rows reuse the embedded editor preview; the session
 * panel holds the audit record.
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
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // TTL: collapse back to the dock, paused on hover/focus, cleared on pin.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!expanded || pinned || hovering || focusWithin) return
    timerRef.current = setTimeout(() => {
      setExpanded(false)
      setPinned(false)
      timerRef.current = null
    }, COLLAPSE_TTL_MS)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [expanded, pinned, hovering, focusWithin, turnKey, view])

  // Esc and click-away collapse the island to the persistent vertical block.
  // Manual expand (pinned) no longer blocks dismissal: no X button, click
  // elsewhere is the single return path.
  useEffect(() => {
    if (!expanded || !change) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setExpanded(false)
      setPinned(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setExpanded(false)
      setPinned(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, change])

  // Single/double click share one button: delay the single-click path so a
  // double-click never flashes the latest view before history mounts.
  useEffect(() => () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
  }, [])
  const hasChange = !!change

  // History cleared (terminal kill / zero-exit): fall back to the empty dock.
  useEffect(() => {
    if (!hasChange) {
      setExpanded(false)
      setPinned(false)
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
    }
  }, [hasChange])

  const summary = change
    ? `${t('terminal:turnChanges.files', { count: change.fileCount })} · +${change.additions} −${change.deletions}`
    : t('terminal:turnChanges.empty')
  const visibleFiles = change?.files.slice(0, MAX_VISIBLE_FILES) ?? []
  const hiddenCount = (change?.fileCount ?? 0) - visibleFiles.length

  // 灵动岛式两档展开：latest 窄、history 宽高更大，靠宽高差驱动壳形变过渡。
  const expandedWidth = view === 'history' ? 'min(368px, 68%)' : 'min(300px, 55%)'
  const expandedMaxHeight = view === 'history' ? '80%' : '60%'

  const openPreview = (relPath: string, status: string) => {
    if (!cwd || status === 'deleted') return
    void openFile(`${cwd}/${relPath}`.replace(/\\/g, '/'), cwd)
  }

  const expandLatest = () => {
    if (narrow || !hasChange) return
    setView('latest')
    setExpanded(true)
    setPinned(true)
  }

  const expandHistory = () => {
    if (narrow || !hasChange) return
    setView('history')
    setExpanded(true)
    setPinned(true)
  }

  const handleDockClick = () => {
    if (narrow || !hasChange) return
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    // Wait out the dblclick window: without this, a double-click flashes
    // latest for one frame before history replaces it.
    clickTimerRef.current = setTimeout(() => {
      expandLatest()
      clickTimerRef.current = null
    }, 220)
  }

  const handleDockDoubleClick = () => {
    if (narrow || !hasChange) return
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    expandHistory()
  }

  return (
    <div
      ref={rootRef}
      data-turn-island=""
      data-stage={expanded ? 'expanded' : 'collapsed'}
      data-view={expanded ? view : undefined}
      data-empty={!hasChange ? 'true' : undefined}
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
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        width: expanded ? expandedWidth : 26,
        maxHeight: expanded ? expandedMaxHeight : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#000',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRight: 'none',
        borderRadius: '12px 0 0 12px',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
      }}
    >
      {!expanded ? (
        hasChange ? (
          <button
            type="button"
            title={t('terminal:turnChanges.hint')}
            aria-label={summary}
            onClick={handleDockClick}
            onDoubleClick={handleDockDoubleClick}
            onMouseDown={(event) => event.stopPropagation()}
            className="cursor-pointer turn-island-dock"
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              minHeight: 72,
              justifyContent: 'center',
              fontFamily: "'SF Mono', monospace",
              lineHeight: 1.2,
            }}
          >
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{change!.fileCount}</span>
            {(change!.additions > 0 || change!.deletions > 0) && (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, fontSize: 9 }}>
                {change!.additions > 0 && <span style={{ color: '#4ec9b0' }}>+{change!.additions}</span>}
                {change!.deletions > 0 && <span style={{ color: '#e06c75' }}>−{change!.deletions}</span>}
              </span>
            )}
            {history.length > 1 && (
              <span style={{ color: '#737373', fontSize: 9 }}>×{history.length}</span>
            )}
          </button>
        ) : (
          <div
            title={t('terminal:turnChanges.empty')}
            aria-label={t('terminal:turnChanges.empty')}
            style={{
              padding: '12px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              minHeight: 64,
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#555', fontSize: 10, fontFamily: "'SF Mono', monospace" }}>0</span>
          </div>
        )
      ) : (
        <div key={view} className="turn-island-content" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="flex items-center" style={{ gap: 8, padding: '8px 10px 6px' }}>
            <button
              type="button"
              onClick={() => setView('latest')}
              onMouseDown={(event) => event.stopPropagation()}
              className="cursor-pointer turn-island-viewtab"
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
              className="cursor-pointer turn-island-viewtab"
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
    <div
      style={{
        background: '#141417',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        padding: '7px 9px 6px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
        <span style={{ fontWeight: 700, fontSize: 10.5, color: '#a1a1a1' }}>#{index}</span>
        <span style={{ fontSize: 10.5, color: '#737373' }}>{turn.kind}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#737373', whiteSpace: 'nowrap' }}>
          {turn.fileCount} · <span style={{ color: '#4ec9b0' }}>+{turn.additions}</span>{' '}
          <span style={{ color: '#e06c75' }}>−{turn.deletions}</span>
        </span>
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
