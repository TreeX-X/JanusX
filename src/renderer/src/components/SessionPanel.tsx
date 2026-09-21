import { useState, useEffect, useCallback } from 'react'
import { useSessionStore, type AgentSessionSummary } from '@/stores/session'
import { useCheckpointStore, type ChangedFileRecord, type CheckpointSummary } from '@/stores/checkpoint'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreeStore } from '@/stores/worktree'
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

type Scope = 'workspace' | 'project' | 'all'

const SCOPE_KEYS = {
  workspace: 'terminal:agentSession.scopeWorkspace',
  project: 'terminal:agentSession.scopeProject',
  all: 'terminal:agentSession.scopeAll',
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
  const worktrees = useWorktreeStore((s) => (activeWorkspaceId ? (s.worktreesByWorkspace[activeWorkspaceId] ?? []) : []))
  const activeWorktreePath = useWorktreeStore((s) => (activeWorkspaceId ? (s.activePaths[activeWorkspaceId] ?? null) : null))
  const scopePath = activeWorktreePath ?? activeWorkspace?.path ?? null
  const activeWorktree = worktrees.find((w) => w.path === scopePath) ?? null
  const uiForPath = useWorktreeStore((s) => s.uiForPath)
  const setUiForPath = useWorktreeStore((s) => s.setUiForPath)
  const expandedId = scopePath ? (uiForPath(scopePath).expandedSessionId ?? null) : null
  const [scope, setScope] = useState<Scope>('workspace')
  const [continueTarget, setContinueTarget] = useState<AgentSessionSummary | null>(null)

  useEffect(() => {
    setContinueTarget(null)
    if (scope === 'all') {
      void fetchSessions({})
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
    const current = uiForPath(scopePath).expandedSessionId ?? null
    setUiForPath(scopePath, { expandedSessionId: current === sessionId ? null : sessionId })
  }, [scopePath, uiForPath, setUiForPath])

  useEffect(() => subscribeToEvents(), [subscribeToEvents])

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
        {!loading && sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: '#555' }}>
            {t('terminal:agentSession.empty')}
          </div>
        )}
        {sessions.map((session) => (
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
  const [records, setRecords] = useState<Record<string, ChangedFileRecord[]>>({})
  const [armingId, setArmingId] = useState<string | null>(null)

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
    if (armingId !== checkpointId) {
      setArmingId(checkpointId)
      window.setTimeout(() => {
        setArmingId((current) => (current === checkpointId ? null : current))
      }, 5000)
      return
    }
    setArmingId(null)
    await restoreCheckpoint(checkpointId, session.cwd, { sessionId: session.id })
    const cps = await window.electron.checkpoint
      .list({ sessionId: session.id, cwd: session.cwd })
      .catch(() => [])
    setCheckpoints(cps)
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
      <div className="flex items-center" style={{ gap: 7 }}>
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
          {checkpoints.map((cp) => (
            <div key={cp.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center" style={{ gap: 7, fontSize: 11, color: '#c9c9c9' }}>
                <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: '#666' }}>
                  #{cp.conversationIndex}
                </span>
                <span>{cp.changedFileCount} files</span>
                <span style={{ marginLeft: 'auto', fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: '#555' }}>
                  {formatDate(cp.createdAt, t)}
                </span>
              </div>
              <CheckpointFiles records={records[`${cp.id}:records`]} />
              <button
                onClick={() => handleRestore(cp.id)}
                className="rounded cursor-pointer"
                style={{ marginTop: 6, height: 22, fontSize: 10, padding: '0 12px', border: '1px solid var(--control-border)', background: 'transparent', color: armingId === cp.id ? '#e06c75' : 'var(--shell-muted)' }}
              >
                {armingId === cp.id
                  ? t('terminal:agentSession.restoreConfirm')
                  : t('terminal:agentSession.restoreTo', { index: cp.conversationIndex })}
              </button>
            </div>
          ))}
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
