import { useEffect, useRef, useState } from 'react'
import { Files, History, ChevronLeft } from 'lucide-react'
import { useTurnChangesStore, type TerminalTurnChangesEvent } from '@/stores/turn-changes'
import { useWorkspaceStore } from '@/stores/workspace'
import { useEditorStore } from '@/stores/editor'
import { useI18n } from '@/i18n/useI18n'
import './TurnChangeIsland.css'

const EMPTY_TURNS: TerminalTurnChangesEvent[] = []
type FileChange = TerminalTurnChangesEvent['files'][number]
type IslandView = 'latest' | 'history'

// Note: latest clears independently of immutable change history — see .agents/notes/terminal/terminal-right-island-turn-history.md
export function TurnChangeIsland({ terminalId, focused }: { terminalId: string; focused: boolean }) {
  const { t, currentLanguage } = useI18n('terminal')
  const change = useTurnChangesStore(s => s.changesByTerminal[terminalId])
  const lastEvent = useTurnChangesStore(s => s.lastEventByTerminal[terminalId])
  const history = useTurnChangesStore(s => s.historyByTerminal[terminalId] ?? EMPTY_TURNS)
  const subscribe = useTurnChangesStore(s => s.subscribeToEvents)
  const cwd = useWorkspaceStore(s => s.terminals.find(item => item.id === terminalId)?.cwd
    ?? Object.values(s.terminalSnapshots).flatMap(snapshot => snapshot.terminals).find(item => item.id === terminalId)?.cwd)
  const openFile = useEditorStore(s => s.openFile)
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<IslandView>('latest')
  const [pinned, setPinned] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()
  const focusedRef = useRef(focused)
  focusedRef.current = focused
  const turnKey = lastEvent?.turnId ?? lastEvent?.endedAt

  useEffect(() => subscribe(), [subscribe])
  useEffect(() => {
    setExpanded(Boolean(change) && focusedRef.current && !narrow)
    setView('latest')
    setPinned(false)
  }, [turnKey, change, narrow])
  useEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 240))
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!expanded || pinned || hovering || focusWithin) return
    const timer = setTimeout(() => setExpanded(false), 6000)
    return () => clearTimeout(timer)
  }, [expanded, pinned, hovering, focusWithin, turnKey])
  useEffect(() => {
    if (!expanded) return
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [expanded])
  useEffect(() => () => clearTimeout(clickTimer.current), [])

  const emptyText = lastEvent?.available === false ? t('terminal:turnChanges.unavailable')
    : lastEvent ? t('terminal:turnChanges.empty') : t('terminal:turnChanges.waiting')
  const summary = change ? t('terminal:turnChanges.files', { count: change.fileCount }) : emptyText
  const expand = (nextView: IslandView) => {
    if (narrow) return
    setView(nextView)
    setExpanded(true)
    setPinned(true)
  }
  const openPreview = (file: FileChange) => {
    if (cwd && file.status !== 'deleted') void openFile(`${cwd}/${file.path}`.replace(/\\/g, '/'), cwd)
  }
  const formatTime = (value: string) => new Intl.DateTimeFormat(currentLanguage, {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
  const renderFiles = (turn: TerminalTurnChangesEvent) => turn.files.map(file => (
    <FileRow key={file.path} file={file} canPreview={Boolean(cwd)} onOpen={() => openPreview(file)} />
  ))

  return (
    <div ref={rootRef} data-turn-island="" data-terminal-id={terminalId}
      data-stage={expanded ? 'expanded' : 'collapsed'} data-view={expanded ? view : undefined}
      data-has-changes={Boolean(change)} className="turn-change-island"
      style={{ background: 'var(--shell-chrome)', color: 'var(--shell-text)' }}
      onMouseDown={event => event.preventDefault()}
      onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false) }}>
      {!expanded ? (
        <button type="button" className="turn-change-dock" aria-label={summary}
          title={narrow ? t('terminal:turnChanges.narrowHint') : `${summary} · ${t('terminal:turnChanges.hint')}`}
          disabled={narrow}
          onClick={event => {
            clearTimeout(clickTimer.current)
            if (event.detail === 0) expand('latest')
            else clickTimer.current = setTimeout(() => expand('latest'), 220)
          }}
          onDoubleClick={() => { clearTimeout(clickTimer.current); expand('history') }}>
          <Files size={15} strokeWidth={1.5} aria-hidden="true" />
          {change && <span key={change.fileCount} className="turn-change-count" aria-hidden="true">
            {change.fileCount > 99 ? '99+' : change.fileCount}
          </span>}
          {!change && history.length > 0 && <span className="turn-change-history-dot" aria-hidden="true" />}
        </button>
      ) : (
        <div className="turn-change-content">
          <div className="turn-change-header" onMouseDown={event => event.stopPropagation()}>
            <div className="turn-change-tabs" role="group" aria-label={t('terminal:turnChanges.viewLabel')}>
              <button type="button" aria-pressed={view === 'latest'} onClick={() => setView('latest')}>
                {t('terminal:turnChanges.latest')}
              </button>
              <button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}>
                <History size={12} aria-hidden="true" />{t('terminal:turnChanges.historyLabel')}
                {history.length > 0 && <span className="turn-change-history-count">{history.length}</span>}
              </button>
            </div>
            <button type="button" className="turn-change-close" onClick={() => setExpanded(false)}
              aria-label={t('terminal:turnChanges.collapse')} title={t('terminal:turnChanges.dismiss')}>
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="turn-change-body" role="region"
            aria-label={view === 'latest' ? t('terminal:turnChanges.latest') : t('terminal:turnChanges.historyLabel')}>
            {view === 'latest' ? change ? (
              <>
                <div className="turn-change-summary">
                  <div><span className="turn-change-eyebrow">{t('terminal:turnChanges.latestHeading')}</span><strong>{summary}</strong></div>
                  <Counts additions={change.additions} deletions={change.deletions} />
                </div>
                <div className="turn-change-files">{renderFiles(change)}</div>
                {change.fileCount > change.files.length && <div className="turn-change-more">
                  {t('terminal:turnChanges.more', { count: change.fileCount - change.files.length })}
                </div>}
              </>
            ) : (
              <div className="turn-change-empty"><Files size={22} strokeWidth={1.25} aria-hidden="true" /><span>{emptyText}</span></div>
            ) : history.length > 0 ? [...history].reverse().map(turn => (
              <article className="turn-change-history" key={turn.turnId ?? turn.endedAt}>
                <div className="turn-change-history-heading">
                  <time dateTime={turn.endedAt}>{formatTime(turn.endedAt)}</time>
                  <span className="turn-change-kind">{t(`terminal:turnChanges.kind.${turn.kind}`)}</span>
                </div>
                <div className="turn-change-history-summary">
                  <span>{t('terminal:turnChanges.files', { count: turn.fileCount })}</span>
                  <Counts additions={turn.additions} deletions={turn.deletions} />
                </div>
                <div className="turn-change-files">{renderFiles(turn)}</div>
                {turn.fileCount > turn.files.length && <div className="turn-change-more">
                  {t('terminal:turnChanges.more', { count: turn.fileCount - turn.files.length })}
                </div>}
              </article>
            )) : <div className="turn-change-empty"><History size={22} strokeWidth={1.25} aria-hidden="true" /><span>{t('terminal:turnChanges.historyEmpty')}</span></div>}
          </div>
        </div>
      )}
    </div>
  )
}

function Counts({ additions, deletions }: { additions: number; deletions: number }) {
  return <span className="turn-change-line-counts">
    {additions > 0 && <span style={{ color: 'var(--shell-diff-add)' }}>+{additions.toLocaleString()}</span>}
    {deletions > 0 && <span style={{ color: 'var(--shell-diff-del)' }}>−{deletions.toLocaleString()}</span>}
  </span>
}

function FileRow({ file, canPreview, onOpen }: { file: FileChange; canPreview: boolean; onOpen: () => void }) {
  const { t } = useI18n('terminal')
  const slash = file.path.lastIndexOf('/')
  const name = file.path.slice(slash + 1)
  const directory = slash >= 0 ? file.path.slice(0, slash) : ''
  const disabled = !canPreview || file.status === 'deleted'
  const hasCounts = (file.additions ?? 0) + (file.deletions ?? 0) > 0
  return <button type="button" className="turn-change-file" disabled={disabled}
    onClick={onOpen} onMouseDown={event => event.stopPropagation()}
    title={`${file.path} · ${t(file.status === 'deleted' ? 'terminal:turnChanges.deletedNoPreview' : 'terminal:turnChanges.openFile')}`}>
    <span className="turn-change-file-name"><span>{name}</span>{directory && <small>{directory}</small>}</span>
    {hasCounts ? <Counts additions={file.additions ?? 0} deletions={file.deletions ?? 0} />
      : <span className="turn-change-file-status">{t(`terminal:turnChanges.status.${file.status}`)}</span>}
  </button>
}
