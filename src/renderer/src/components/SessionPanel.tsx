import { useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSessionStore, type AgentSessionDetail, type AgentSessionSummary } from '@/stores/session'
import { useCheckpointStore, type ChangedFileRecord, type CheckpointSummary, type ConflictInfo } from '@/stores/checkpoint'
import { useWorkspaceStore } from '@/stores/workspace'
import { EMPTY_WORKTREE_LIST, useWorktreeStore } from '@/stores/worktree'
import { useI18n } from '@/i18n/useI18n'
import { buildProviderResumeCommand, type TranscriptDetail } from '../../../shared/ipc/session'
import terminalIcon from '@/assets/icons/terminal.svg'
import claudeIcon from '@/assets/icons/claude.svg'
import codexIcon from '@/assets/icons/codex.svg'
import opencodeIcon from '@/assets/icons/opencode.svg'
import janusIcon from '@/assets/icons/janus.svg'
import piIcon from '@/assets/icons/pi.svg'

const ENGINE_ICONS: Record<string, string> = {
  shell: terminalIcon,
  claude: claudeIcon,
  codex: codexIcon,
  opencode: opencodeIcon,
  janus: janusIcon,
  'pi': piIcon,
}

type Scope = 'workspace' | 'project' | 'all' | 'archived'

const SCOPE_KEYS = {
  workspace: 'terminal:agentSession.scopeWorkspace',
  project: 'terminal:agentSession.scopeProject',
  all: 'terminal:agentSession.scopeAll',
  archived: 'terminal:agentSession.scopeArchived',
} as const

function formatDate(iso: string, t: (k: string, opt?: Record<string, unknown>) => string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 1) return t('terminal:time.justNow')
  if (diffMin < 60) return t('terminal:time.minutesAgo', { count: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('terminal:time.hoursAgo', { count: diffHour })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function recordCounts(record: ChangedFileRecord): string {
  if (record.status === 'binary') return `binary · ${formatSize(record.size)}`
  if (record.status === 'oversized') return `oversized · ${formatSize(record.size)}`
  const parts: string[] = []
  if (record.additions !== null && record.additions > 0) parts.push(`+${record.additions}`)
  if (record.deletions !== null && record.deletions > 0) parts.push(`−${record.deletions}`)
  return parts.join(' ') || '±0'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// Note: windowed session reading with orca-aligned preview layers — internal
// turns keep scoped checkpoints with inline diff, external rows stay
// transcript-only — see
// .agents/notes/implemented/feature/2026-09-22-session-windowed-reading.md

/** Provider resume command for external rows (orca parity); null when the engine has no known resume shape. */
function buildResumeCommand(session: AgentSessionSummary): string | null {
  return buildProviderResumeCommand(session.engine, session.providerSessionId)
}

function CopyButton({ text, label, grow }: { text: string; label?: string; grow?: boolean }) {
  const { t } = useI18n('terminal')
  const [copied, setCopied] = useState(false)
  const timer = useMemo(() => ({ id: null as ReturnType<typeof setTimeout> | null }), [])
  useEffect(() => () => {
    if (timer.id) clearTimeout(timer.id)
  }, [timer])
  return (
    <button
      onClick={(event) => {
        event.stopPropagation()
        void navigator.clipboard?.writeText(text).catch(() => undefined).then(() => {
          setCopied(true)
          if (timer.id) clearTimeout(timer.id)
          timer.id = setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="rounded cursor-pointer"
      style={{ height: grow ? 24 : 20, padding: '0 8px', fontSize: grow ? 10.5 : 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8a8a8e', fontFamily: "'SF Mono', monospace", flexShrink: 0, flex: grow ? 1 : undefined }}
    >
      {copied ? t('terminal:agentSession.copied') : (label ?? t('terminal:agentSession.copy'))}
    </button>
  )
}

export function SessionPanel() {
  const { t } = useI18n('terminal')
  const sessions = useSessionStore((s) => s.sessions)
  const loading = useSessionStore((s) => s.loading)
  const error = useSessionStore((s) => s.error)
  const fetchSessions = useSessionStore((s) => s.fetchSessions)
  const continueSession = useSessionStore((s) => s.continueSession)
  const subscribeToEvents = useSessionStore((s) => s.subscribeToEvents)
  const clearWorkspaceScope = useSessionStore((s) => s.clearWorkspaceScope)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  // AC-10: card scope follows the active worktree path, not the workspace root.
  const worktrees = useWorktreeStore((s) => (activeWorkspaceId ? (s.worktreesByWorkspace[activeWorkspaceId] ?? EMPTY_WORKTREE_LIST) : EMPTY_WORKTREE_LIST))
  const activeWorktreePath = useWorktreeStore((s) => (activeWorkspaceId ? (s.activePaths[activeWorkspaceId] ?? null) : null))
  const scopePath = activeWorktreePath ?? activeWorkspace?.path ?? null
  const activeWorktree = worktrees.find((w) => w.path === scopePath) ?? null
  const setUiForPath = useWorktreeStore((s) => s.setUiForPath)
  // Note: single card expand subscribes to uiByPath so timeline toggles re-render — see .agents/notes/implemented/bug-fix/2026-09-22-session-checkpoint-expand.md
  const expandedId = useWorktreeStore((s) =>
    scopePath ? (s.uiByPath[scopePath]?.expandedSessionId ?? null) : null,
  )
  const [scope, setScope] = useState<Scope>('workspace')
  const [continueTarget, setContinueTarget] = useState<AgentSessionSummary | null>(null)
  const [detailTarget, setDetailTarget] = useState<AgentSessionSummary | null>(null)
  const [query, setQuery] = useState('')
  const [allCounts, setAllCounts] = useState<{ all: number; archived: number } | null>(null)
  // Note: open-card live refresh follows the same session:event — debounced
  // so submit/checkpoint/turn bursts reload the timeline once — see
  // .agents/notes/implemented/feature/2026-09-22-session-timeline-live.md
  const [timelineTick, setTimelineTick] = useState(0)

  useEffect(() => {
    setContinueTarget(null)
    // Pull-mode backfill: provider transcripts written outside JanusX have no
    // hook traffic, so each panel open triggers one bounded rescan; the
    // registry notifies on import and the event subscription refreshes cards.
    void window.electron.session.scanExternal().catch(() => undefined)
    if (scope === 'all') {
      void fetchSessions({})
      return
    }
    if (scope === 'archived') {
      void fetchSessions({ includeArchived: true })
      return
    }
    if (!activeWorkspaceId && !scopePath) {
      clearWorkspaceScope()
      return
    }
    // Project scope follows the workspace until the project model lands (P2).
    void fetchSessions(scopePath ? { cwd: scopePath } : { workspaceId: activeWorkspaceId ?? undefined })
  }, [fetchSessions, clearWorkspaceScope, activeWorkspaceId, scopePath, scope])

  const handleToggle = useCallback((sessionId: string) => {
    if (!scopePath) return
    const current = useWorktreeStore.getState().uiByPath[scopePath]?.expandedSessionId ?? null
    setUiForPath(scopePath, { expandedSessionId: current === sessionId ? null : sessionId })
  }, [scopePath, setUiForPath])

  useEffect(() => subscribeToEvents(), [subscribeToEvents])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = window.electron.session.onEvent(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setTimelineTick((tick) => tick + 1), 600)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  const visible = useMemo(() => {
    const scoped = scope === 'archived' ? sessions.filter((s) => s.archived) : sessions.filter((s) => !s.archived)
    const q = query.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((s) =>
      (s.firstPrompt ?? '').toLowerCase().includes(q)
      || s.engine.toLowerCase().includes(q)
      || s.cwd.toLowerCase().includes(q)
      || (s.branch ?? '').toLowerCase().includes(q),
    )
  }, [sessions, scope, query])

  // An empty scope tab is ambiguous with no data at all: one unfiltered fetch
  // reports the totals so the empty state names the other scopes. Runs only
  // while the visible list stays empty.
  useEffect(() => {
    if (loading || visible.length > 0) return
    let alive = true
    window.electron.session
      .list({ includeArchived: true })
      .catch(() => [])
      .then((rows) => {
        if (!alive) return
        setAllCounts({
          all: rows.filter((row) => !row.archived).length,
          archived: rows.filter((row) => row.archived).length,
        })
      })
    return () => {
      alive = false
    }
  }, [loading, visible.length])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="px-3 pt-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div style={{ fontSize: 13, fontWeight: 650, color: '#eee' }}>
          {t('terminal:agentSession.title')}
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('terminal:agentSession.searchPlaceholder')}
            aria-label={t('terminal:agentSession.searchPlaceholder')}
            style={{
              width: '100%', height: 26, fontSize: 11.5, color: '#d4d4d4',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6, padding: '0 9px', outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
        <div className="flex" style={{ gap: 16, marginTop: 8, alignItems: 'flex-end' }}>
          {(Object.keys(SCOPE_KEYS) as Scope[]).map((key) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              style={{
                fontSize: 11.5,
                color: scope === key ? '#ddd' : '#777',
                background: 'none',
                border: 'none',
                borderBottom: scope === key ? '1px solid #888' : '1px solid transparent',
                marginBottom: -1,
                padding: '7px 2px',
                cursor: 'pointer',
              }}
            >
              {t(SCOPE_KEYS[key])}
            </button>
          ))}
          {scope !== 'all' && activeWorktree && (
            <span
              style={{
                marginLeft: 'auto',
                marginBottom: 6,
                fontFamily: "'SF Mono', monospace",
                fontSize: 10,
                color: '#777',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              {activeWorktree.branch ?? activeWorktree.path}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col" style={{ gap: 10, padding: 12, overflowY: 'auto' }}>
        {loading && (
          <div className="text-xs" style={{ color: '#555' }}>{t('terminal:agentSession.loading')}</div>
        )}
        {error && (
          <div className="text-xs" style={{ color: '#e06c75' }}>{error}</div>
        )}
        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-xs" style={{ color: '#555', gap: 6 }}>
            <span>{t('terminal:agentSession.empty')}</span>
            {allCounts && (allCounts.all > 0 || allCounts.archived > 0) && (
              <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10 }}>
                {t('terminal:agentSession.scopeEmptyCounts', { all: allCounts.all, archived: allCounts.archived })}
              </span>
            )}
          </div>
        )}
        {visible.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            expanded={expandedId === session.id}
            timelineTick={timelineTick}
            onToggle={() => handleToggle(session.id)}
            onContinue={() => setContinueTarget(session)}
            onDetail={() => setDetailTarget(session)}
          />
        ))}
      </div>

      {detailTarget && createPortal(
        <SessionDetailWindow
          session={detailTarget}
          timelineTick={timelineTick}
          onClose={() => setDetailTarget(null)}
          onContinue={() => {
            // External rows resume through the provider CLI in a fresh
            // terminal; failures surface on the panel error line.
            if (detailTarget.external === true) {
              const id = detailTarget.id
              setDetailTarget(null)
              void continueSession(id)
              return
            }
            setDetailTarget(null)
            setContinueTarget(detailTarget)
          }}
        />,
        document.body,
      )}

      {continueTarget && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.64)', zIndex: 1000 }}
        >
            <div
              className="overflow-hidden"
              style={{
                width: 460,
                background: 'var(--shell-chrome)',
                border: '1px solid var(--shell-border)',
                borderRadius: 8,
                boxShadow: '0 24px 60px rgba(0,0,0,0.72)',
              }}
            >
              <TrafficBar
                title={t('terminal:agentSession.continueTitle')}
                onClose={() => setContinueTarget(null)}
              />
            <div style={{ padding: 16, fontSize: 12, color: '#999', lineHeight: 1.6 }}>
              {t('terminal:agentSession.continueBody')}
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  color: '#d4d4d4',
                  whiteSpace: 'pre-wrap',
                }}
              >
                &ldquo;{continueTarget.firstPrompt || continueTarget.engine}&rdquo;
              </div>
            </div>
            <div
              className="flex justify-end"
              style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', gap: 8 }}
            >
              <button
                onClick={() => setContinueTarget(null)}
                className="rounded cursor-pointer"
                style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#888' }}
              >
                {t('common:action.cancel')}
              </button>
              <button
                onClick={async () => {
                  await continueSession(continueTarget.id)
                  setContinueTarget(null)
                }}
                className="rounded cursor-pointer"
                style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)' }}
              >
                {t('terminal:agentSession.continueStart')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function statusLabel(status: AgentSessionSummary['status'], t: (k: string) => string): string {
  if (status === 'active') return t('terminal:agentSession.statusActive')
  if (status === 'done') return t('terminal:agentSession.statusDone')
  if (status === 'failed') return t('terminal:agentSession.statusFailed')
  return t('terminal:agentSession.statusInterrupted')
}

function turnKindLabel(kind: string, t: (k: string) => string): string {
  if (kind === 'done') return t('terminal:agentSession.statusDone')
  if (kind === 'failed') return t('terminal:agentSession.statusFailed')
  return t('terminal:agentSession.statusInterrupted')
}

function baseNameOf(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path
}

// Note: session-owned checkpoints with review-gated restore absorb the retired
// standalone checkpoints tool — see
// .agents/notes/implemented/feature/2026-09-21-session-checkpoint-migration.md

// Note: unified turn timeline follows HiFi v5 — one expand owns Q/A plus the
// bound checkpoint strip, file lists stay collapsed, diff opens in a
// traffic-bar modal — see
// .agents/notes/implemented/feature/2026-09-23-session-timeline-v5.md

/**
 * Traffic-light title bar shared by the session modals. Matches the
 * StandaloneFileEditor / StandaloneBrowser spec: 38px bar on
 * rgba(6,6,6,0.96), three 12px lights on the left, mono centered title.
 * Only the red light acts (close); yellow/green hold the layout so the
 * title stays centered like a real window.
 */
function TrafficBar({ title, onClose }: { title: ReactNode; onClose: () => void }) {
  const { t } = useI18n('common')
  const light = (background: string): CSSProperties => ({
    width: 12,
    height: 12,
    border: 0,
    borderRadius: '50%',
    padding: 0,
    background,
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.15)',
  })
  return (
    <div
      className="flex items-center"
      style={{
        gap: 12,
        height: 38,
        flexShrink: 0,
        padding: '0 12px',
        userSelect: 'none',
        background: 'rgba(6, 6, 6, 0.96)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex" style={{ gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          aria-label={t('common:trafficLight.close')}
          title={t('common:trafficLight.close')}
          onClick={onClose}
          className="cursor-pointer"
          style={light('#ff5f57')}
        />
        <button
          type="button"
          aria-label={t('common:trafficLight.minimize')}
          title={t('common:trafficLight.minimize')}
          disabled
          style={{ ...light('#ffbd2e'), opacity: 0.5, cursor: 'default' }}
        />
        <button
          type="button"
          aria-label={t('common:trafficLight.maximize')}
          title={t('common:trafficLight.maximize')}
          disabled
          style={{ ...light('#28c840'), opacity: 0.5, cursor: 'default' }}
        />
      </div>
      <div
        className="flex-1 min-w-0 overflow-hidden overflow-ellipsis whitespace-nowrap"
        style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, color: '#999', textAlign: 'center' }}
      >
        {title}
      </div>
      <div style={{ width: 52, flexShrink: 0 }} />
    </div>
  )
}

const VISIBLE_FILE_CAP = 5

function CheckpointStrip({
  cp,
  records,
  recordsLoading,
  turnKind,
  pruneCount,
  filesOpen,
  onToggleFiles,
  reviewOpen,
  onToggleReview,
  onConfirmRestore,
  restoreDonePruned,
  showRestoreDone,
  conflicts,
  onViewDiff,
}: {
  cp: CheckpointSummary
  records: ChangedFileRecord[] | undefined
  recordsLoading: boolean
  turnKind: string | undefined
  pruneCount: number
  filesOpen: boolean
  onToggleFiles: () => void
  reviewOpen: boolean
  onToggleReview: (open: boolean) => void
  onConfirmRestore: () => void
  restoreDonePruned: string | null
  showRestoreDone: boolean
  conflicts: ConflictInfo[] | null
  onViewDiff: () => void
}) {
  const { t } = useI18n('terminal')
  const recs = records ?? []
  const canDiff = !recordsLoading && recs.length > 0
  const addTotal = recs.reduce((sum, record) => sum + (record.additions ?? 0), 0)
  const delTotal = recs.reduce((sum, record) => sum + (record.deletions ?? 0), 0)
  const visibleRecs = recs.slice(0, VISIBLE_FILE_CAP)
  const hiddenCount = recs.length - visibleRecs.length
  return (
    <div
      data-cp-strip={cp.id}
      style={{
        marginTop: 8,
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.02)',
        padding: '8px 10px',
      }}
    >
      <div
        className="flex items-center"
        style={{ gap: 7, fontSize: 11, color: '#c9c9c9', cursor: 'pointer', userSelect: 'none' }}
        title={filesOpen ? t('terminal:checkpoint.collapse') : t('terminal:checkpoint.expand')}
        onClick={onToggleFiles}
      >
        <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#8ab4ff' }}>
          #{cp.conversationIndex}
        </span>
        <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#8a8a8e', whiteSpace: 'nowrap' }}>
          {cp.changedFileCount} files
          {(addTotal > 0 || delTotal > 0) && (
            <>
              {' · '}
              {addTotal > 0 && <span style={{ color: '#4ec9b0' }}>+{addTotal}</span>}
              {addTotal > 0 && delTotal > 0 && ' '}
              {delTotal > 0 && <span style={{ color: '#e06c75' }}>−{delTotal}</span>}
            </>
          )}
          {' '}{filesOpen ? '▴' : '▾'}
        </span>
        {turnKind && (
          <span style={{ fontSize: 9.5, color: turnKind === 'done' ? '#999' : '#e06c75', border: turnKind === 'done' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(224,108,117,0.25)', borderRadius: 3, padding: '0 5px' }}>
            {turnKindLabel(turnKind, t)}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#555' }}>
          {formatDate(cp.createdAt, t)}
        </span>
      </div>
      {filesOpen && (
        <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#777', marginTop: 6, lineHeight: 1.8, maxHeight: 132, overflowY: 'auto' }}>
          {recordsLoading && <div style={{ color: '#555' }}>…</div>}
          {!recordsLoading && visibleRecs.map((record) => (
            <div key={record.path}>
              {record.path} <FileCounts record={record} />
            </div>
          ))}
          {!recordsLoading && hiddenCount > 0 && (
            <div style={{ fontSize: 9.5, color: '#5a5a60' }}>
              {t('terminal:checkpoint.remainingFiles', { count: hiddenCount })}
            </div>
          )}
        </div>
      )}
      <div className="flex" style={{ gap: 6, marginTop: 7 }}>
        {recordsLoading ? (
          <button
            disabled
            className="flex-1 rounded"
            style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)', opacity: 0.6 }}
          >
            {t('terminal:checkpoint.diffLoading')}
          </button>
        ) : (
          canDiff && (
            <button
              onClick={onViewDiff}
              className="flex-1 rounded cursor-pointer"
              style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)' }}
            >
              {t('terminal:checkpoint.viewDiff')}
            </button>
          )
        )}
        <button
          onClick={() => onToggleReview(!reviewOpen)}
          className="flex-1 rounded cursor-pointer"
          style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)' }}
        >
          {t('terminal:agentSession.restoreTo', { index: cp.conversationIndex })}
        </button>
      </div>
      {reviewOpen && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
          {pruneCount > 0 ? (
            <div style={{ padding: '8px 10px', background: 'rgba(255,120,48,0.03)', border: '1px solid rgba(255,120,48,0.18)', borderRadius: 6, fontSize: 11, color: '#999', marginBottom: 8, lineHeight: 1.6 }}>
              {t('terminal:checkpoint.pruneWarn', { count: pruneCount })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#6bd89b', marginBottom: 8, lineHeight: 1.6 }}>
              {t('terminal:checkpoint.pruneOk')}
            </div>
          )}
          <div className="flex" style={{ gap: 6, marginTop: 8 }}>
            <button
              onClick={onConfirmRestore}
              className="flex-1 rounded cursor-pointer"
              style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)' }}
            >
              {t('terminal:agentSession.restoreConfirm')}
            </button>
            <button
              onClick={() => onToggleReview(false)}
              className="flex-1 rounded cursor-pointer"
              style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)' }}
            >
              {t('common:action.cancel')}
            </button>
          </div>
        </div>
      )}
      {showRestoreDone && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#6bd89b', lineHeight: 1.6 }}>
          {restoreDonePruned
            ? t('terminal:checkpoint.restoreDonePruned', { index: cp.conversationIndex, pruned: restoreDonePruned })
            : t('terminal:checkpoint.restoreDone', { index: cp.conversationIndex })}
        </div>
      )}
      {conflicts && conflicts.length > 0 && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(224,108,117,0.02)', border: '1px solid rgba(224,108,117,0.3)', borderRadius: 6, fontSize: 11, color: '#999', lineHeight: 1.6 }}>
          <div>{t('terminal:checkpoint.conflictFiles', { count: conflicts.length })} · {t('terminal:checkpoint.conflictBadge')}</div>
          {conflicts.map((conflict) => (
            <div key={conflict.filePath} style={{ fontFamily: "'SF Mono', monospace", marginTop: 4 }}>
              {conflict.filePath}
            </div>
          ))}
          <div style={{ marginTop: 4 }}>{t('terminal:checkpoint.conflictHint')}</div>
        </div>
      )}
    </div>
  )
}

// Note: right-side diff panel inside SessionDetailWindow — the dialog widens
// rightward when it mounts, so file-heavy diffs never stretch the timeline.

function DiffSidePanel({
  cp,
  cwd,
  records,
  pruneCount,
  onClose,
  onRestore,
}: {
  cp: CheckpointSummary
  cwd: string
  records: ChangedFileRecord[] | undefined
  pruneCount: number
  onClose: () => void
  onRestore: () => void
}) {
  const { t } = useI18n('terminal')
  const fetchAllDiffs = useCheckpointStore((s) => s.fetchAllDiffs)
  const fullDiff = useCheckpointStore((s) => s.diffs[`${cp.id}:`])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({})
  const [fileError, setFileError] = useState<string | null>(null)

  useEffect(() => {
    void fetchAllDiffs(cp.id, cwd)
  }, [cp.id, cwd, fetchAllDiffs])

  const recs = records ?? []
  const hasBinary = recs.some((record) => record.status === 'binary' || record.status === 'oversized')

  const openFile = (path: string | null) => {
    setActivePath((current) => (current === path ? null : path))
    setFileError(null)
    if (path && fileDiffs[path] === undefined) {
      window.electron.checkpoint
        .diff(cp.id, path, cwd)
        .then((diff) => setFileDiffs((state) => ({ ...state, [path]: diff })))
        .catch((err) => setFileError(err instanceof Error ? err.message : String(err)))
    }
  }

  const shown = activePath ? (fileDiffs[activePath] ?? null) : fullDiff
  const renderLines = (text: string) =>
    text.split('\n').map((line, i) => (
      <div key={i} style={{ color: line.startsWith('-') ? '#e06c75' : line.startsWith('+') ? '#4ec9b0' : '#888' }}>
        {line}
      </div>
    ))

  return (
    <div
      className="flex flex-col"
      style={{ width: 520, maxWidth: '45%', flexShrink: 0, minHeight: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.25)' }}
      aria-label={t('terminal:checkpoint.diffPreview')}
    >
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 11, color: '#ddd' }}>
            #{cp.conversationIndex} · {t('terminal:checkpoint.diffPreview')}
          </span>
          <button
            onClick={onClose}
            className="rounded cursor-pointer"
            style={{ marginLeft: 'auto', height: 22, padding: '0 10px', fontSize: 10, fontFamily: "'SF Mono', monospace", border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8a8a8e', flexShrink: 0 }}
          >
            {t('terminal:agentSession.diffCollapse')} ⟶
          </button>
        </div>
        <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#666', marginTop: 3 }}>
          …/{baseNameOf(cwd)} · {formatDate(cp.createdAt, t)}
        </div>
      </div>
      <div style={{ maxHeight: 150, overflowY: 'auto', padding: 6, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        {recs.length === 0 && (
          <div style={{ fontSize: 11, color: '#555', padding: '7px 9px' }}>{t('terminal:checkpoint.diffEmpty')}</div>
        )}
        {recs.map((record) => {
          const isText = record.status !== 'binary' && record.status !== 'oversized'
          const active = activePath === record.path
          return (
            <div
              key={record.path}
              onClick={() => {
                if (isText) openFile(record.path)
              }}
              title={isText ? undefined : t('terminal:checkpoint.binaryNoDiff')}
              style={{
                padding: '7px 9px',
                borderRadius: 4,
                cursor: isText ? 'pointer' : 'default',
                opacity: isText ? 1 : 0.55,
                background: active ? 'rgba(138,180,255,0.08)' : 'transparent',
                color: active ? '#d4d4d4' : '#9d9da3',
                fontFamily: "'SF Mono', monospace",
                fontSize: 10.5,
                lineHeight: 1.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {record.path}
              <div style={{ fontSize: 9.5, color: '#666' }}>
                <FileCounts record={record} />
                {!isText && ` · ${t('terminal:checkpoint.binaryNoDiff')}`}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px', fontFamily: "'SF Mono', monospace", fontSize: 10.5, lineHeight: 1.65, background: 'rgba(0,0,0,0.35)' }}>
        {activePath && (
          <div style={{ position: 'sticky', top: -10, background: '#1a1a1d', color: '#888', padding: '6px 8px', margin: '0 -12px 6px', paddingLeft: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {activePath}
          </div>
        )}
        {fileError && <div style={{ color: '#e06c75' }}>{fileError}</div>}
        {!fileError && shown !== undefined && shown !== null && shown !== '' && renderLines(shown)}
        {!fileError && (shown === undefined || shown === null) && (
          <div style={{ color: '#555' }}>{t('terminal:checkpoint.diffLoading')}</div>
        )}
        {!fileError && shown === '' && (
          <div style={{ color: '#555' }}>{t('terminal:checkpoint.diffEmpty')}</div>
        )}
      </div>
      <div
        className="flex items-center"
        style={{ gap: 8, padding: '9px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
      >
        <span style={{ fontSize: 10, fontFamily: "'SF Mono', monospace", color: pruneCount > 0 ? '#c98a5e' : '#999', flex: 1 }}>
          {pruneCount > 0
            ? t('terminal:checkpoint.pruneWarn', { count: pruneCount })
            : t('terminal:checkpoint.pruneOk')}
          {hasBinary && ` · ${t('terminal:checkpoint.binaryNoDiff')}`}
        </span>
        <button
          onClick={onRestore}
          className="rounded cursor-pointer"
          style={{ height: 26, padding: '0 12px', fontSize: 10.5, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)', flexShrink: 0 }}
        >
          {t('terminal:agentSession.restoreTo', { index: cp.conversationIndex })}
        </button>
      </div>
    </div>
  )
}

// Note: single-expand timeline — the card header owns detail plus bound
// checkpoint strips; the retired split checkpoint section is gone.

function SessionCard({
  session,
  expanded,
  timelineTick,
  onToggle,
  onContinue,
  onDetail,
}: {
  session: AgentSessionSummary
  expanded: boolean
  timelineTick: number
  onToggle: () => void
  onContinue: () => void
  onDetail: () => void
}) {
  const { t } = useI18n('terminal')
  const [detail, setDetail] = useState<AgentSessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [resuming, setResuming] = useState(false)
  const runContinue = useSessionStore((s) => s.continueSession)

  useEffect(() => {
    if (!expanded) return
    let alive = true
    // L2 previews reload on every debounced session:event so the first prompt
    // and recent turns arrive mid-conversation. Checkpoint and diff work lives
    // in SessionDetailWindow; the dock never fetches it.
    setDetailLoading(true)
    window.electron.session
      .get(session.id)
      .catch(() => null)
      .then((fetched) => {
        if (!alive) return
        if (fetched) setDetail(fetched)
        setDetailLoading(false)
      })
    return () => {
      alive = false
    }
  }, [expanded, session.id, timelineTick])

  const recentTurns = useMemo(() => (detail?.turns ?? []).slice(-2), [detail])
  const resumeCommand = useMemo(() => buildResumeCommand(session), [session])
  const icon = ENGINE_ICONS[session.engine] ?? terminalIcon

  // Checkpoint strips, diffs, reviews, and restore state live in
  // SessionDetailWindow below; the dock keeps only the L2 preview.

  return (
    <div
      className="transition-colors"
      style={{
        background: 'var(--shell-card)',
        border: '1px solid var(--shell-border)',
        borderRadius: 6,
        padding: 10,
        opacity: session.archived ? 0.62 : 1,
      }}
    >
      <div
        className="flex items-center"
        style={{ gap: 7, cursor: 'pointer' }}
        title={t('terminal:checkpoint.expand')}
        onClick={onToggle}
      >
        <img src={icon} alt={session.engine} style={{ width: 14, height: 14, objectFit: 'contain' }} />
        <span style={{ fontSize: 11, color: '#a8a8a8' }}>{session.engine}</span>
        {session.external === true && (
          <span
            style={{
              fontSize: 9.5,
              color: '#8ab4ff',
              border: '1px solid rgba(138,180,255,0.3)',
              borderRadius: 3,
              padding: '0 5px',
              whiteSpace: 'nowrap',
            }}
          >
            {t('terminal:agentSession.external')}
          </span>
        )}
        <span
          className="flex-1 min-w-0 overflow-hidden overflow-ellipsis whitespace-nowrap"
          style={{ fontSize: 12, color: '#d4d4d4', fontWeight: 500 }}
        >
          {session.firstPrompt || session.engine}
        </span>
        <span style={{ fontSize: 10, color: '#666', fontFamily: "'SF Mono', monospace" }}>
          {session.archived ? t('terminal:agentSession.archived') : statusLabel(session.status, t)}
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>{expanded ? '▴' : '▾'}</span>
      </div>

      {session.firstPrompt && (
        <div
          style={{
            fontSize: 12,
            color: '#d4d4d4',
            lineHeight: 1.5,
            marginTop: 6,
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
          }}
        >
          {session.firstPrompt}
        </div>
      )}
      <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#666', marginTop: 5 }}>
        {t('terminal:agentSession.turns', { count: session.turnCount })} ·{' '}
        {session.external === true
          ? <span style={{ color: '#5a5a60' }}>{t('terminal:agentSession.noCheckpointExternal')}</span>
          : t('terminal:agentSession.checkpoints', { count: session.checkpointCount })}{' '}
        · {formatDate(session.updatedAt, t)}
      </div>
      <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#555', marginTop: 2 }}>
        {session.cwd}{session.branch ? ` · ${session.branch}` : ''}
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#8f8f96', lineHeight: 1.8 }}>
            <div>…/{baseNameOf(session.cwd)}{session.branch ? ` · ${session.branch}` : ''}</div>
            {(detail?.transcriptPath ?? session.transcriptPath) && (
              <div>transcript …/{baseNameOf((detail?.transcriptPath ?? session.transcriptPath) as string)}（{t('terminal:agentSession.readOnly')}）</div>
            )}
          </div>
          {session.firstPrompt && (
            <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '9px 10px' }}>
              <div className="flex items-center" style={{ gap: 8, fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777', marginBottom: 6 }}>
                <span>{t('terminal:agentSession.firstPrompt')}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <CopyButton text={session.firstPrompt} />
                </span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: '#d4d4d4', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                {session.firstPrompt}
              </div>
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 10px' }}>
            <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777', padding: '8px 0 0' }}>
              {t('terminal:agentSession.recentTurns')}
            </div>
            {!detail ? (
              <div style={{ fontSize: 11, color: '#555', padding: '6px 0' }}>{detailLoading ? t('terminal:agentSession.loading') : t('terminal:agentSession.empty')}</div>
            ) : recentTurns.length === 0 ? (
              <div style={{ fontSize: 11, color: '#555', padding: '6px 0' }}>{t('terminal:agentSession.empty')}</div>
            ) : (
              recentTurns.map((turn) => {
                const question = turn.prompt
                return (
                  <div key={turn.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center" style={{ gap: 6, fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777', marginBottom: 4 }}>
                      <span>turn · {formatDate(turn.startedAt, t)}</span>
                      <span style={{ color: turn.kind === 'done' ? '#999' : '#e06c75', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, padding: '0 5px' }}>
                        {turnKindLabel(turn.kind, t)}
                      </span>
                    </div>
                    {question && (
                      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: '#c9c9c9', wordBreak: 'break-all', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {question}
                      </div>
                    )}
                    {turn.excerpt && (
                      <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.6, color: '#9d9da3', wordBreak: 'break-all', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {turn.excerpt}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <div className="flex" style={{ gap: 6, marginTop: 9 }}>
            <button
              onClick={onDetail}
              className="flex-1 rounded cursor-pointer"
              style={{ height: 24, fontSize: 10.5, border: '1px solid rgba(244,125,67,0.4)', background: 'rgba(244,125,67,0.08)', color: '#e8e8e8' }}
            >
              {t('terminal:agentSession.viewDetail')}
            </button>
            {session.archived ? null : session.external === true ? (
              resumeCommand ? (
                <button
                  onClick={() => {
                    if (resuming) return
                    setResuming(true)
                    void runContinue(session.id).finally(() => setResuming(false))
                  }}
                  disabled={resuming}
                  className="flex-1 rounded cursor-pointer"
                  style={{ height: 24, fontSize: 10.5, border: '1px solid rgba(244,125,67,0.4)', background: 'rgba(244,125,67,0.08)', color: '#e8e8e8', opacity: resuming ? 0.6 : 1 }}
                >
                  {t('terminal:agentSession.resume')}
                </button>
              ) : (
                <button
                  disabled
                  title={t('terminal:agentSession.resumeUnavailable')}
                  className="flex-1 rounded"
                  style={{ height: 24, fontSize: 10.5, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)', opacity: 0.6 }}
                >
                  {t('terminal:agentSession.resumeCopy')}
                </button>
              )
            ) : (
              <button
                onClick={onContinue}
                className="flex-1 rounded cursor-pointer"
                style={{ height: 24, fontSize: 10.5, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)' }}
              >
                {t('terminal:agentSession.continue')}
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#5a5a60', marginTop: 7, lineHeight: 1.6 }}>
            {t('terminal:agentSession.detailHint', { count: session.turnCount })}
          </div>
          {session.archived && (
            <div
              style={{
                fontSize: 10.5, color: '#666', marginTop: 8, padding: '7px 9px',
                border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 4, lineHeight: 1.6,
              }}
            >
              {t('terminal:agentSession.archivedHint')}
            </div>
          )}
          {session.external === true && !session.archived && (
            <div style={{ fontSize: 10, color: '#555', marginTop: 6, lineHeight: 1.6 }}>
              {t('terminal:agentSession.externalHint')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SessionDetailWindow({
  session,
  timelineTick,
  onClose,
  onContinue,
}: {
  session: AgentSessionSummary
  timelineTick: number
  onClose: () => void
  onContinue: () => void
}) {
  const { t } = useI18n('terminal')
  const restoreCheckpoint = useCheckpointStore((s) => s.restoreCheckpoint)
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([])
  const [cpLoaded, setCpLoaded] = useState(false)
  const [cpError, setCpError] = useState<string | null>(null)
  const [records, setRecords] = useState<Record<string, ChangedFileRecord[]>>({})
  const [detail, setDetail] = useState<AgentSessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [filesOpenIds, setFilesOpenIds] = useState<Set<string>>(new Set())
  const [diffCp, setDiffCp] = useState<CheckpointSummary | null>(null)
  const [conflictFor, setConflictFor] = useState<string | null>(null)
  const [restoreConflicts, setRestoreConflicts] = useState<ConflictInfo[]>([])
  const [restoreDone, setRestoreDone] = useState<{ id: string; pruned: string } | null>(null)
  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null)
  const resumeCommand = useMemo(() => buildResumeCommand(session), [session])
  // External and archived rows carry no restorable state: the window reads the
  // transcript ledger only and never fetches checkpoints.
  const readableOnly = session.external === true || session.archived

  const loadRecords = useCallback(async (checkpointId: string, cwd: string) => {
    const key = `${checkpointId}:records`
    const fresh = await window.electron.checkpoint.records(checkpointId, cwd).catch(() => [])
    setRecords((state) => (state[key] ? state : { ...state, [key]: fresh }))
  }, [])

  useEffect(() => {
    let alive = true
    // The open window reloads on every debounced session:event so questions,
    // excerpts, and checkpoint strips arrive mid-conversation. Review, file,
    // and restore states stay keyed by checkpoint id and survive the reload.
    setDetailLoading(true)
    window.electron.session
      .get(session.id)
      .catch(() => null)
      .then((fetched) => {
        if (!alive) return
        if (fetched) setDetail(fetched)
        setDetailLoading(false)
      })
    if (readableOnly) {
      setCpLoaded(true)
      return () => {
        alive = false
      }
    }
    setCpError(null)
    window.electron.checkpoint
      .list({ sessionId: session.id, cwd: session.cwd })
      .then((cps) => {
        if (!alive) return
        setCheckpoints(cps)
        setCpLoaded(true)
        // Drop records of pruned checkpoints; the rest reload lazily.
        setRecords((state) => {
          const keep = new Set(cps.map((cp) => `${cp.id}:records`))
          const next: Record<string, ChangedFileRecord[]> = {}
          let dropped = false
          for (const [key, value] of Object.entries(state)) {
            if (keep.has(key)) next[key] = value
            else dropped = true
          }
          return dropped ? next : state
        })
        // Per-checkpoint lazy change records; diffs stay on demand in the side panel.
        void Promise.all(cps.map((cp) => loadRecords(cp.id, session.cwd)))
      })
      .catch((err) => {
        if (!alive) return
        setCpLoaded(true)
        setCpError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [session.id, session.cwd, readableOnly, timelineTick, loadRecords])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Bounded full-prose transcript read, fetched once per window open. Registry
  // excerpts stay the live source; transcript pairs only backfill missing
  // prose or replace the single seeded turn on external rows.
  useEffect(() => {
    let alive = true
    setTranscript(null)
    window.electron.session
      .getTranscript(session.id)
      .catch(() => null)
      .then((fetched) => {
        if (!alive) return
        if (fetched) setTranscript(fetched)
      })
    return () => {
      alive = false
    }
  }, [session.id])

  const displayTurns = useMemo(() => {
    const base = detail?.turns ?? []
    if (!transcript || transcript.turns.length === 0) return base
    if (transcript.turns.length > base.length) {
      return transcript.turns.map((turn, index) => ({
        id: `transcript-${index}`,
        kind: 'done' as const,
        checkpointId: undefined as string | undefined,
        startedAt: detail?.createdAt ?? session.createdAt,
        endedAt: detail?.updatedAt ?? session.updatedAt,
        prompt: turn.prompt,
        excerpt: turn.excerpt,
      }))
    }
    return base.map((turn, index) => {
      const extra = transcript.turns[index]
      if (!extra) return turn
      return { ...turn, prompt: turn.prompt ?? extra.prompt, excerpt: turn.excerpt ?? extra.excerpt }
    })
  }, [detail, transcript, session.createdAt, session.updatedAt])

  const handleRestore = async (checkpoint: CheckpointSummary) => {
    const pruned = checkpoints
      .filter((other) => other.conversationIndex > checkpoint.conversationIndex)
      .map((other) => `#${other.conversationIndex}`)
      .join(' · ')
    setReviewId(null)
    setRestoreDone(null)
    await restoreCheckpoint(checkpoint.id, session.cwd, { sessionId: session.id })
    const state = useCheckpointStore.getState()
    setRestoreConflicts(state.conflicts)
    setConflictFor(checkpoint.id)
    if (!state.error) {
      setRestoreDone({ id: checkpoint.id, pruned })
    }
    const cps = await window.electron.checkpoint
      .list({ sessionId: session.id, cwd: session.cwd })
      .catch(() => [])
    setCheckpoints(cps)
  }

  const toggleFiles = useCallback((checkpointId: string) => {
    setFilesOpenIds((state) => {
      const next = new Set(state)
      if (next.has(checkpointId)) next.delete(checkpointId)
      else next.add(checkpointId)
      return next
    })
  }, [])

  const openReview = useCallback((checkpoint: CheckpointSummary) => {
    setConflictFor(null)
    setRestoreConflicts([])
    setRestoreDone(null)
    // Review expands the file list so the confirm step sees the files.
    setFilesOpenIds((state) => new Set(state).add(checkpoint.id))
    setReviewId(checkpoint.id)
  }, [])

  const checkpointById = useMemo(() => new Map(checkpoints.map((cp) => [cp.id, cp])), [checkpoints])

  const turnKindByCheckpointId = useMemo(() => {
    const map = new Map<string, string>()
    for (const turn of detail?.turns ?? []) {
      if (turn.checkpointId) map.set(turn.checkpointId, turn.kind)
    }
    return map
  }, [detail])

  const referencedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const turn of detail?.turns ?? []) {
      if (turn.checkpointId) ids.add(turn.checkpointId)
    }
    return ids
  }, [detail])

  // Checkpoints no turn points at (running turn, legacy data): appended after
  // the turns so the window never hides restorable state.
  const orphans = useMemo(
    () => checkpoints.filter((cp) => !referencedIds.has(cp.id)),
    [checkpoints, referencedIds],
  )

  const pruneCountFor = useCallback(
    (checkpoint: CheckpointSummary) =>
      checkpoints.filter((other) => other.conversationIndex > checkpoint.conversationIndex).length,
    [checkpoints],
  )

  const renderStrip = (checkpoint: CheckpointSummary) => {
    const key = `${checkpoint.id}:records`
    const recs = records[key]
    return (
      <CheckpointStrip
        key={checkpoint.id}
        cp={checkpoint}
        records={recs}
        recordsLoading={recs === undefined}
        turnKind={turnKindByCheckpointId.get(checkpoint.id)}
        pruneCount={pruneCountFor(checkpoint)}
        filesOpen={filesOpenIds.has(checkpoint.id)}
        onToggleFiles={() => toggleFiles(checkpoint.id)}
        reviewOpen={reviewId === checkpoint.id}
        onToggleReview={(open) => {
          if (open) openReview(checkpoint)
          else setReviewId(null)
        }}
        onConfirmRestore={() => void handleRestore(checkpoint)}
        restoreDonePruned={restoreDone?.id === checkpoint.id ? restoreDone.pruned : null}
        showRestoreDone={restoreDone?.id === checkpoint.id}
        conflicts={conflictFor === checkpoint.id ? restoreConflicts : null}
        onViewDiff={() => setDiffCp((current) => (current?.id === checkpoint.id ? null : checkpoint))}
      />
    )
  }

  const icon = ENGINE_ICONS[session.engine] ?? terminalIcon

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.64)', zIndex: 1000 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label={session.firstPrompt || session.engine}
        className="overflow-hidden flex flex-col"
        style={{
          width: diffCp ? 1240 : 880,
          maxWidth: 'calc(100vw - 40px)',
          height: 660,
          maxHeight: 'calc(100vh - 60px)',
          background: 'var(--shell-chrome)',
          border: '1px solid var(--shell-border)',
          borderRadius: 8,
          boxShadow: '0 24px 60px rgba(0,0,0,0.72)',
          transition: 'width 0.25s ease',
        }}
      >
        <TrafficBar
          title={
            <>
              <img src={icon} alt={session.engine} style={{ width: 12, height: 12, objectFit: 'contain', display: 'inline-block', verticalAlign: -1, marginRight: 6 }} />
              {session.firstPrompt || session.engine}
            </>
          }
          onClose={onClose}
        />
        <div style={{ padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10.5, color: '#8f8f96', lineHeight: 1.7 }}>
            …/{baseNameOf(session.cwd)}{session.branch ? ` · ${session.branch}` : ''} · {session.engine} ·{' '}
            {t('terminal:agentSession.turns', { count: session.turnCount })}
            {session.external !== true && !session.archived && (
              <> · {t('terminal:agentSession.checkpoints', { count: session.checkpointCount })}</>
            )}
          </div>
          <div className="flex" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {session.firstPrompt && <CopyButton text={session.firstPrompt} label={t('terminal:agentSession.firstPrompt')} />}
            {(detail?.transcriptPath ?? session.transcriptPath) && (
              <CopyButton text={(detail?.transcriptPath ?? session.transcriptPath) as string} label={t('terminal:agentSession.copyLogPath')} />
            )}
            {(detail?.providerSessionId ?? session.providerSessionId) && (
              <CopyButton text={(detail?.providerSessionId ?? session.providerSessionId) as string} label={t('terminal:agentSession.copySessionId')} />
            )}
            {session.external === true && resumeCommand && (
              <CopyButton text={resumeCommand} label={t('terminal:agentSession.resumeCopy')} />
            )}
          </div>
        </div>
        {session.external === true && !session.archived && (
          <div style={{ margin: '10px 16px 0', padding: '8px 11px', border: '1px dashed rgba(138,180,255,0.35)', borderRadius: 6, fontSize: 11, color: '#8ab4ff', lineHeight: 1.6, flexShrink: 0 }}>
            {t('terminal:agentSession.detailExternalBanner')}
          </div>
        )}
        {session.archived && (
          <div style={{ margin: '10px 16px 0', padding: '8px 11px', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 6, fontSize: 11, color: '#8b8b91', lineHeight: 1.6, flexShrink: 0 }}>
            {t('terminal:agentSession.archivedHint')}
          </div>
        )}
        <div className="flex" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '12px 16px' }}>
            {!detail ? (
              <div style={{ fontSize: 11, color: '#555' }}>{detailLoading ? t('terminal:agentSession.loading') : t('terminal:agentSession.empty')}</div>
            ) : (
              <>
                {transcript?.truncated && (
                  <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#5a5a60', padding: '2px 0 8px' }}>
                    {t('terminal:agentSession.transcriptTruncated', { total: transcript.totalTurns, shown: transcript.turns.length })}
                  </div>
                )}
                {displayTurns.map((turn, index) => {
                  const linked = !readableOnly && turn.checkpointId ? checkpointById.get(turn.checkpointId) : undefined
                  // Turn-owned prompt survives checkpoint prune; linked prompt stays as fallback.
                  const question = turn.prompt ?? linked?.prompt
                  return (
                    <div key={turn.id} style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '11px 12px', marginBottom: 10 }}>
                      {question && (
                        <div style={{ marginBottom: 9 }}>
                          <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777', marginBottom: 5 }}>
                            turn {index + 1} · {formatDate(turn.startedAt, t)}
                          </div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#d4d4d4', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                            {question}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center" style={{ gap: 6, fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777' }}>
                        <span>{session.engine}</span>
                        <span style={{ color: turn.kind === 'done' ? '#999' : '#e06c75', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, padding: '0 5px' }}>
                          {turnKindLabel(turn.kind, t)}
                        </span>
                        {linked && <span style={{ color: '#8ab4ff' }}>#{linked.conversationIndex}</span>}
                        {!question && <span>turn {index + 1} · {formatDate(turn.startedAt, t)}</span>}
                      </div>
                      {turn.excerpt && (
                        <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.65, color: '#c4c4c5', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                          {turn.excerpt}
                        </div>
                      )}
                      {linked && renderStrip(linked)}
                      {!readableOnly && !linked && !turn.checkpointId && cpLoaded && (
                        <div style={{ marginTop: 8, border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 10px', opacity: 0.75 }}>
                          <div className="flex items-center" style={{ gap: 7, fontSize: 11, color: '#c9c9c9' }}>
                            <span>{t('terminal:checkpoint.noCheckpoint')}</span>
                            <span style={{ marginLeft: 'auto', fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#7a7a80' }}>
                              {t('terminal:checkpoint.readOnlyHint')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {displayTurns.length === 0 && orphans.length === 0 && (
                  <div style={{ fontSize: 11, color: '#555', padding: '6px 0' }}>{t('terminal:agentSession.empty')}</div>
                )}
                {cpError && checkpoints.length === 0 && (
                  <div style={{ fontSize: 11, color: '#e06c75', padding: '6px 0' }}>{cpError}</div>
                )}
                {orphans.map((cp) => (
                  <div key={cp.id} style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '11px 12px', marginBottom: 10 }}>
                    {cp.prompt && (
                      <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#d4d4d4', wordBreak: 'break-all', whiteSpace: 'pre-wrap', marginBottom: 4 }}>
                        {cp.prompt}
                      </div>
                    )}
                    {renderStrip(cp)}
                  </div>
                ))}
              </>
            )}
          </div>
          {diffCp && (
            <DiffSidePanel
              cp={diffCp}
              cwd={session.cwd}
              records={records[`${diffCp.id}:records`]}
              pruneCount={pruneCountFor(diffCp)}
              onClose={() => setDiffCp(null)}
              onRestore={() => {
                const cp = diffCp
                setDiffCp(null)
                openReview(cp)
                // Review renders in the left pane; keep it in view.
                requestAnimationFrame(() => {
                  document.querySelector(`[data-cp-strip="${cp.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                })
              }}
            />
          )}
        </div>
        <div
          className="flex items-center"
          style={{ gap: 8, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
        >
          <span style={{ fontSize: 11, color: '#999', flex: 1 }}>
            {readableOnly
              ? t('terminal:agentSession.externalHint')
              : t('terminal:checkpoint.pruneOk')}
          </span>
          <button
            onClick={onClose}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#888', flexShrink: 0 }}
          >
            {t('common:action.close')}
          </button>
          {session.archived ? null : session.external === true ? (
            resumeCommand ? (
              <button
                onClick={onContinue}
                className="rounded cursor-pointer"
                style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid rgba(244,125,67,0.4)', background: 'rgba(244,125,67,0.08)', color: '#e8e8e8', flexShrink: 0 }}
              >
                {t('terminal:agentSession.resume')}
              </button>
            ) : (
              <button
                disabled
                title={t('terminal:agentSession.resumeUnavailable')}
                className="rounded"
                style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)', opacity: 0.6, flexShrink: 0 }}
              >
                {t('terminal:agentSession.resumeCopy')}
              </button>
            )
          ) : (
            <button
              onClick={onContinue}
              className="rounded cursor-pointer"
              style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)', flexShrink: 0 }}
            >
              {t('terminal:agentSession.continue')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FileCounts({ record }: { record: ChangedFileRecord }) {
  if (record.status === 'binary' || record.status === 'oversized') {
    return <span style={{ color: '#8ab4ff' }}>{recordCounts(record)}</span>
  }
  return (
    <span>
      {(record.additions ?? 0) > 0 && <span style={{ color: '#4ec9b0' }}>+{record.additions} </span>}
      {(record.deletions ?? 0) > 0 && <span style={{ color: '#e06c75' }}>−{record.deletions}</span>}
    </span>
  )
}
