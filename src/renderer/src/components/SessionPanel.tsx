import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSessionStore, type AgentSessionDetail, type AgentSessionSummary } from '@/stores/session'
import { useCheckpointStore, type ChangedFileRecord, type CheckpointSummary, type ConflictInfo } from '@/stores/checkpoint'
import { useWorkspaceStore } from '@/stores/workspace'
import { EMPTY_WORKTREE_LIST, useWorktreeStore } from '@/stores/worktree'
import { useI18n } from '@/i18n/useI18n'
import { ModalCloseButton } from './ModalCloseButton'
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
  // Note: expanded id subscribes to uiByPath so checkpoint toggles re-render — see .agents/notes/implemented/bug-fix/2026-09-22-session-checkpoint-expand.md
  const expandedId = useWorktreeStore((s) =>
    scopePath ? (s.uiByPath[scopePath]?.expandedSessionId ?? null) : null,
  )
  const [scope, setScope] = useState<Scope>('workspace')
  const [continueTarget, setContinueTarget] = useState<AgentSessionSummary | null>(null)

  useEffect(() => {
    setContinueTarget(null)
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

  const visible = scope === 'archived' ? sessions.filter((s) => s.archived) : sessions.filter((s) => !s.archived)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="px-3 pt-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div style={{ fontSize: 13, fontWeight: 650, color: '#eee' }}>
          {t('terminal:agentSession.title')}
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
          <div className="flex items-center justify-center h-full text-xs" style={{ color: '#555' }}>
            {t('terminal:agentSession.empty')}
          </div>
        )}
        {visible.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            expanded={expandedId === session.id}
            onToggle={() => handleToggle(session.id)}
            onContinue={() => setContinueTarget(session)}
          />
        ))}
      </div>

      {continueTarget && (
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
            <div
              className="flex justify-between items-center"
              style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="font-semibold" style={{ fontSize: 13, color: '#fff' }}>
                {t('terminal:agentSession.continueTitle')}
              </div>
              <ModalCloseButton onClose={() => setContinueTarget(null)} />
            </div>
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
        </div>
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

// Note: session-owned checkpoints with review-gated restore and expandable
// detail absorb the retired standalone checkpoints tool — see
// .agents/notes/implemented/feature/2026-09-21-session-checkpoint-migration.md

function SessionCard({
  session,
  expanded,
  onToggle,
  onContinue,
}: {
  session: AgentSessionSummary
  expanded: boolean
  onToggle: () => void
  onContinue: () => void
}) {
  const { t } = useI18n('terminal')
  const restoreCheckpoint = useCheckpointStore((s) => s.restoreCheckpoint)
  const fetchAllDiffs = useCheckpointStore((s) => s.fetchAllDiffs)
  const diffs = useCheckpointStore((s) => s.diffs)
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([])
  const [records, setRecords] = useState<Record<string, ChangedFileRecord[]>>({})
  const [detail, setDetail] = useState<AgentSessionDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [diffOpenId, setDiffOpenId] = useState<string | null>(null)
  const [conflictFor, setConflictFor] = useState<string | null>(null)
  const [restoreConflicts, setRestoreConflicts] = useState<ConflictInfo[]>([])

  const loadRecords = useCallback(async (checkpointId: string, cwd: string) => {
    const key = `${checkpointId}:records`
    const fresh = await window.electron.checkpoint.records(checkpointId, cwd).catch(() => [])
    setRecords((state) => (state[key] ? state : { ...state, [key]: fresh }))
  }, [])

  useEffect(() => {
    if (!expanded || session.archived) return
    let alive = true
    window.electron.checkpoint
      .list({ sessionId: session.id, cwd: session.cwd })
      .then((cps) => {
        if (!alive) return
        setCheckpoints(cps)
        // Per-checkpoint lazy change records; diffs stay on demand per file.
        void Promise.all(cps.map((cp) => loadRecords(cp.id, session.cwd)))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [expanded, session.id, session.archived, session.cwd, loadRecords])

  const handleRestore = async (checkpointId: string) => {
    setReviewId(null)
    await restoreCheckpoint(checkpointId, session.cwd, { sessionId: session.id })
    setRestoreConflicts(useCheckpointStore.getState().conflicts)
    setConflictFor(checkpointId)
    const cps = await window.electron.checkpoint
      .list({ sessionId: session.id, cwd: session.cwd })
      .catch(() => [])
    setCheckpoints(cps)
  }

  const toggleDiff = (checkpoint: CheckpointSummary) => {
    const next = diffOpenId === checkpoint.id ? null : checkpoint.id
    setDiffOpenId(next)
    if (next) void fetchAllDiffs(checkpoint.id, session.cwd)
  }

  const toggleDetail = useCallback(async () => {
    const next = !detailOpen
    setDetailOpen(next)
    if (!next || detail) return
    setDetailLoading(true)
    try {
      const [fetched, cps] = await Promise.all([
        window.electron.session.get(session.id).catch(() => null),
        checkpoints.length > 0
          ? Promise.resolve(checkpoints)
          : window.electron.checkpoint.list({ sessionId: session.id, cwd: session.cwd }).catch(() => []),
      ])
      if (fetched) setDetail(fetched)
      setCheckpoints(cps)
    } finally {
      setDetailLoading(false)
    }
  }, [detailOpen, detail, session.id, session.cwd, checkpoints])

  const checkpointById = useMemo(() => new Map(checkpoints.map((cp) => [cp.id, cp])), [checkpoints])

  const icon = ENGINE_ICONS[session.engine] ?? terminalIcon

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
        onClick={() => void toggleDetail()}
      >
        <img src={icon} alt={session.engine} style={{ width: 14, height: 14, objectFit: 'contain' }} />
        <span style={{ fontSize: 11, color: '#a8a8a8' }}>{session.engine}</span>
        <span
          className="flex-1 min-w-0 overflow-hidden overflow-ellipsis whitespace-nowrap"
          style={{ fontSize: 12, color: '#d4d4d4', fontWeight: 500 }}
        >
          {session.firstPrompt || session.engine}
        </span>
        <span style={{ fontSize: 10, color: '#666', fontFamily: "'SF Mono', monospace" }}>
          {session.archived ? t('terminal:agentSession.archived') : statusLabel(session.status, t)}
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>{detailOpen ? '▴' : '▾'}</span>
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
        {t('terminal:agentSession.checkpoints', { count: session.checkpointCount })} · {formatDate(session.updatedAt, t)}
      </div>
      <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#555', marginTop: 2 }}>
        {session.cwd}{session.branch ? ` · ${session.branch}` : ''}
      </div>

      {detailOpen && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {!detail ? (
            <div style={{ fontSize: 11, color: '#555' }}>{detailLoading ? t('terminal:agentSession.loading') : t('terminal:agentSession.empty')}</div>
          ) : (
            <>
              <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#8f8f96', lineHeight: 1.8 }}>
                <div>…/{baseNameOf(detail.cwd)}{detail.branch ? ` · ${detail.branch}` : ''}</div>
                {detail.transcriptPath && (
                  <div>transcript …/{baseNameOf(detail.transcriptPath)}（只读）· {formatDate(detail.createdAt, t)}</div>
                )}
              </div>
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 10px' }}>
                {detail.turns.map((turn, index) => {
                  const linked = turn.checkpointId ? checkpointById.get(turn.checkpointId) : undefined
                  return (
                    <div key={turn.id} style={{ padding: '8px 0', borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
                      {linked?.prompt && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777', marginBottom: 4 }}>
                            turn {index + 1} · {formatDate(turn.startedAt, t)}
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#d4d4d4', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                            {linked.prompt}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center" style={{ gap: 6, fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777' }}>
                        <span>{session.engine}</span>
                        <span style={{ color: turn.kind === 'done' ? '#999' : '#e06c75', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, padding: '0 5px' }}>
                          {turnKindLabel(turn.kind, t)}
                        </span>
                        {linked && <span style={{ color: '#8ab4ff' }}>#{linked.conversationIndex}</span>}
                        {!linked?.prompt && <span>turn {index + 1} · {formatDate(turn.startedAt, t)}</span>}
                      </div>
                    </div>
                  )
                })}
                {detail.turns.length === 0 && (
                  <div style={{ fontSize: 11, color: '#555', padding: '6px 0' }}>{t('terminal:agentSession.empty')}</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {session.archived && (
        <div
          style={{
            fontSize: 10.5,
            color: '#666',
            marginTop: 8,
            padding: '7px 9px',
            border: '1px dashed rgba(255,255,255,0.1)',
            borderRadius: 4,
            lineHeight: 1.6,
          }}
        >
          {t('terminal:agentSession.archivedHint')}
        </div>
      )}

      <div className="flex" style={{ gap: 6, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8, marginTop: 8 }}>
        {!session.archived && (
          <button
            onClick={onToggle}
            className="flex-1 rounded cursor-pointer"
            style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)' }}
          >
            {t('terminal:agentSession.checkpoints', { count: session.checkpointCount })} {expanded ? '▴' : '▾'}
          </button>
        )}
        <button
          onClick={onContinue}
          className="flex-1 rounded cursor-pointer"
          style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)' }}
        >
          {t('terminal:agentSession.continue')}
        </button>
      </div>

      {expanded && !session.archived && (
        <div style={{ marginTop: 4 }}>
          {checkpoints.map((cp) => {
            const recs = records[`${cp.id}:records`]
            const recordsLoading = recs === undefined
            const canDiff = !!recs && !recs.some((record) => record.status === 'binary' || record.status === 'oversized')
            const diffKey = `${cp.id}:`
            const fullDiff = diffs[diffKey]
            const pruneCount = checkpoints.filter((other) => other.conversationIndex > cp.conversationIndex).length
            return (
              <div key={cp.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div
                  className="flex items-center"
                  style={{ gap: 7, fontSize: 11, color: '#c9c9c9', cursor: canDiff ? 'pointer' : 'default' }}
                  title={canDiff ? t('terminal:checkpoint.diff') : undefined}
                  onClick={() => {
                    if (canDiff) toggleDiff(cp)
                  }}
                >
                  <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#666' }}>
                    #{cp.conversationIndex}
                  </span>
                  <span>{cp.changedFileCount} files</span>
                  <span style={{ marginLeft: 'auto', fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#555' }}>
                    {formatDate(cp.createdAt, t)}
                  </span>
                </div>
                <CheckpointFiles records={recs} />
                <div className="flex" style={{ gap: 6, marginTop: 6 }}>
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
                        onClick={() => toggleDiff(cp)}
                        className="flex-1 rounded cursor-pointer"
                        style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)' }}
                      >
                        {t('terminal:checkpoint.diff')} {diffOpenId === cp.id ? '▴' : '▾'}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => {
                      setConflictFor(null)
                      setRestoreConflicts([])
                      setReviewId(reviewId === cp.id ? null : cp.id)
                    }}
                    className="flex-1 rounded cursor-pointer"
                    style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)' }}
                  >
                    {t('terminal:agentSession.restoreTo', { index: cp.conversationIndex })}
                  </button>
                </div>
                {diffOpenId === cp.id && (
                  <div style={{ marginTop: 6, background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, padding: 8, fontFamily: "'SF Mono', monospace", fontSize: 10, lineHeight: 1.6 }}>
                    {fullDiff ? (
                      fullDiff.split('\n').map((line, i) => (
                        <div key={i} style={{ color: line.startsWith('-') ? '#e06c75' : line.startsWith('+') ? '#4ec9b0' : '#888' }}>
                          {line}
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#555' }}>{t('terminal:checkpoint.diffLoading')}</div>
                    )}
                  </div>
                )}
                {reviewId === cp.id && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                    {pruneCount > 0 && (
                      <div style={{ padding: '8px 10px', background: 'rgba(255,120,48,0.03)', border: '1px solid rgba(255,120,48,0.18)', borderRadius: 6, fontSize: 11, color: '#999', marginBottom: 8, lineHeight: 1.6 }}>
                        {t('terminal:checkpoint.pruneWarn', { count: pruneCount })}
                      </div>
                    )}
                    <CheckpointFiles records={recs} />
                    <div className="flex" style={{ gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => void handleRestore(cp.id)}
                        className="flex-1 rounded cursor-pointer"
                        style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)' }}
                      >
                        {t('terminal:agentSession.restoreConfirm')}
                      </button>
                      <button
                        onClick={() => setReviewId(null)}
                        className="flex-1 rounded cursor-pointer"
                        style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)' }}
                      >
                        {t('common:action.cancel')}
                      </button>
                    </div>
                  </div>
                )}
                {conflictFor === cp.id && restoreConflicts.length > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(224,108,117,0.02)', border: '1px solid rgba(224,108,117,0.3)', borderRadius: 6, fontSize: 11, color: '#999', lineHeight: 1.6 }}>
                    <div>{t('terminal:checkpoint.conflictFiles', { count: restoreConflicts.length })} · {t('terminal:checkpoint.conflictBadge')}</div>
                    {restoreConflicts.map((conflict) => (
                      <div key={conflict.filePath} style={{ fontFamily: "'SF Mono', monospace", marginTop: 4 }}>
                        {conflict.filePath}
                      </div>
                    ))}
                    <div style={{ marginTop: 4 }}>{t('terminal:checkpoint.conflictHint')}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CheckpointFiles({ records }: { records: ChangedFileRecord[] | undefined }) {
  if (!records) {
    return <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#555', marginTop: 5 }}>…</div>
  }
  if (records.length === 0) return null
  return (
    <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#777', marginTop: 5, lineHeight: 1.8 }}>
      {records.map((record) => (
        <div key={record.path}>
          {record.path} <FileCounts record={record} />
        </div>
      ))}
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
