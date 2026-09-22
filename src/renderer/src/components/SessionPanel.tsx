import { useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useSessionStore, type AgentSessionDetail, type AgentSessionSummary } from '@/stores/session'
import { useCheckpointStore, type ChangedFileRecord, type CheckpointSummary, type ConflictInfo } from '@/stores/checkpoint'
import { useWorkspaceStore } from '@/stores/workspace'
import { EMPTY_WORKTREE_LIST, useWorktreeStore } from '@/stores/worktree'
import { useI18n } from '@/i18n/useI18n'
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
  // Note: single card expand subscribes to uiByPath so timeline toggles re-render — see .agents/notes/implemented/bug-fix/2026-09-22-session-checkpoint-expand.md
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

function DiffModal({
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.64)', zIndex: 1000 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label={t('terminal:checkpoint.diffPreview')}
        className="overflow-hidden flex flex-col"
        style={{
          width: 780,
          maxWidth: 'calc(100vw - 80px)',
          height: 600,
          maxHeight: 'calc(100vh - 80px)',
          background: 'var(--shell-chrome)',
          border: '1px solid var(--shell-border)',
          borderRadius: 8,
          boxShadow: '0 24px 60px rgba(0,0,0,0.72)',
        }}
      >
        <TrafficBar
          title={`#${cp.conversationIndex} · ${t('terminal:checkpoint.diffPreview')}`}
          onClose={onClose}
        />
        <div
          className="flex items-center"
          style={{ gap: 10, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#777', flexShrink: 0 }}
        >
          <span>…/{baseNameOf(cwd)} · {formatDate(cp.createdAt, t)}</span>
          <span style={{ marginLeft: 'auto' }}>
            {pruneCount > 0
              ? t('terminal:checkpoint.pruneWarn', { count: pruneCount })
              : t('terminal:checkpoint.pruneOk')}
          </span>
        </div>
        <div className="flex" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: 6 }}>
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
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '10px 12px', fontFamily: "'SF Mono', monospace", fontSize: 10.5, lineHeight: 1.65, background: 'rgba(0,0,0,0.35)' }}>
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
        </div>
        <div
          className="flex items-center"
          style={{ gap: 8, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
        >
          <span style={{ fontSize: 11, color: pruneCount > 0 ? '#c98a5e' : '#999', flex: 1 }}>
            {pruneCount > 0
              ? t('terminal:checkpoint.pruneWarn', { count: pruneCount })
              : t('terminal:checkpoint.pruneOk')}
            {hasBinary && ` · ${t('terminal:checkpoint.binaryNoDiff')}`}
          </span>
          <button
            onClick={onClose}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#888', flexShrink: 0 }}
          >
            {t('common:action.close')}
          </button>
          <button
            onClick={onRestore}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)', flexShrink: 0 }}
          >
            {t('terminal:agentSession.restoreTo', { index: cp.conversationIndex })}
          </button>
        </div>
      </div>
    </div>
  )
}

// Note: single-expand timeline — the card header owns detail plus bound
// checkpoint strips; the retired split checkpoint section is gone.

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

  const loadRecords = useCallback(async (checkpointId: string, cwd: string) => {
    const key = `${checkpointId}:records`
    const fresh = await window.electron.checkpoint.records(checkpointId, cwd).catch(() => [])
    setRecords((state) => (state[key] ? state : { ...state, [key]: fresh }))
  }, [])

  useEffect(() => {
    if (!expanded) return
    let alive = true
    if (!detail) {
      setDetailLoading(true)
      window.electron.session
        .get(session.id)
        .catch(() => null)
        .then((fetched) => {
          if (!alive) return
          if (fetched) setDetail(fetched)
          setDetailLoading(false)
        })
    }
    if (!session.archived && !cpLoaded) {
      setCpError(null)
      window.electron.checkpoint
        .list({ sessionId: session.id, cwd: session.cwd })
        .then((cps) => {
          if (!alive) return
          setCheckpoints(cps)
          setCpLoaded(true)
          // Per-checkpoint lazy change records; diffs stay on demand in the modal.
          void Promise.all(cps.map((cp) => loadRecords(cp.id, session.cwd)))
        })
        .catch((err) => {
          if (!alive) return
          setCpLoaded(true)
          setCpError(err instanceof Error ? err.message : String(err))
        })
    }
    if (session.archived) setCpLoaded(true)
    return () => {
      alive = false
    }
  }, [expanded, session.id, session.archived, session.cwd, detail, cpLoaded, loadRecords])

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
  // the turns so the timeline never hides restorable state.
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
        onViewDiff={() => setDiffCp(checkpoint)}
      />
    )
  }

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
        onClick={onToggle}
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
        {t('terminal:agentSession.checkpoints', { count: session.checkpointCount })} · {formatDate(session.updatedAt, t)}
      </div>
      <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#555', marginTop: 2 }}>
        {session.cwd}{session.branch ? ` · ${session.branch}` : ''}
      </div>

      {expanded && (
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
                  // Turn-owned prompt survives checkpoint prune; linked prompt stays as fallback.
                  const question = turn.prompt ?? linked?.prompt
                  return (
                    <div key={turn.id} style={{ padding: '8px 0', borderTop: index === 0 && orphans.length === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
                      {question && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#777', marginBottom: 4 }}>
                            turn {index + 1} · {formatDate(turn.startedAt, t)}
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#d4d4d4', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
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
                        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: '#c9c9c9', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                          {turn.excerpt}
                        </div>
                      )}
                      {linked && renderStrip(linked)}
                      {!linked && !turn.checkpointId && cpLoaded && (
                        <div
                          style={{
                            marginTop: 8,
                            border: '1px dashed rgba(255,255,255,0.07)',
                            borderRadius: 6,
                            padding: '8px 10px',
                            opacity: 0.75,
                          }}
                        >
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
                {detail.turns.length === 0 && orphans.length === 0 && (
                  <div style={{ fontSize: 11, color: '#555', padding: '6px 0' }}>{t('terminal:agentSession.empty')}</div>
                )}
                {cpError && checkpoints.length === 0 && (
                  <div style={{ fontSize: 11, color: '#e06c75', padding: '6px 0' }}>{cpError}</div>
                )}
                {orphans.map((cp) => (
                  <div key={cp.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {cp.prompt && (
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: '#d4d4d4', wordBreak: 'break-all', whiteSpace: 'pre-wrap', marginBottom: 4 }}>
                        {cp.prompt}
                      </div>
                    )}
                    {renderStrip(cp)}
                  </div>
                ))}
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
        {session.archived && (
          <button
            disabled
            className="flex-1 rounded"
            style={{ height: 22, fontSize: 10, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)', opacity: 0.6 }}
          >
            {t('terminal:agentSession.restoreUnavailable')}
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

      {diffCp && (
        <DiffModal
          cp={diffCp}
          cwd={session.cwd}
          records={records[`${diffCp.id}:records`]}
          pruneCount={pruneCountFor(diffCp)}
          onClose={() => setDiffCp(null)}
          onRestore={() => {
            const cp = diffCp
            setDiffCp(null)
            openReview(cp)
          }}
        />
      )}
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
