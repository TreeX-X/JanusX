import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useSessionStore, type AgentSessionDetail, type AgentSessionSummary } from '@/stores/session'
import { useWorkspaceStore } from '@/stores/workspace'
import { useThemeStore } from '@/stores/theme'
import { EMPTY_WORKTREE_LIST, useWorktreeStore } from '@/stores/worktree'
import { useI18n } from '@/i18n/useI18n'
import { ThemedTooltip } from '@/components/ui/ThemedTooltip'
import { buildContinueResumeArgs, buildProviderResumeCommand, canOfferSessionResume, isNativeResumeEngine, type TranscriptDetail } from '../../../shared/ipc/session'
import { TerminalPresetIcon } from './ui/TerminalPresetIcon'
import type { TerminalPreset } from '@/types'
import { mergeTranscriptTurns } from '@/lib/session-turn-merge'
import styles from './SessionPanel.module.css'

/** 会话 engine 与终端 preset 同名；未知 engine 落到 shell 字形（与旧 fallback 一致）。 */
function sessionEnginePreset(engine: string): TerminalPreset {
  return engine === 'claude' || engine === 'codex' || engine === 'opencode' || engine === 'janus' || engine === 'pi' || engine === 'dsh'
    ? engine
    : 'shell'
}

type Scope = 'workspace' | 'project' | 'all' | 'archived'

/** L2 first-prompt cap: longer prompts clamp to this many lines until expanded. */
const PROMPT_CLAMP_LINES = 4
/** Prompts above this budget get the expand-to-full affordance. */
const PROMPT_CLAMP_CHARS = 160
/** Progressive card mount: one commit of every card froze the dock until the
 * whole batch painted (stall, then everything at once). Cards land in chunks
 * so each commit stays small and the list streams in.
 * See .agents/notes/sessions/records/session-open-stall.md */
const CARD_CHUNK = 20
const CARD_CHUNK_DELAY_MS = 40

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

// Note: 会话表面混色档位只服务详情窗（turn 卡）；右栏列表面板的
// 地走 --shell-canvas 令牌、卡/内卡走 A 方案高保真逐值，在 SessionPanel.module.css — 见
// .agents/notes/workbench/session-card-surface.md
//
// 为什么不能直接用 --shell-card / --shell-chrome：planche 的 --shell-void /
// --shell-canvas / --shell-pane / --shell-chrome / --shell-card 全是 #EFE4C5，纸面里
// 没有更深的台阶，拿它们当卡片底色等于和底色同值；写死 rgba(0,0,0,.28) / rgba(255,255,255,.03)
// 落在纸面上分别是冷灰油渍和几乎透明的亮斑，两个主题都只能各对一半。朝文字色混出
// 两档在两主题都能拉出可见台阶：planche 得到偏暖的深纸色，dark 得到
// 逐级浮起的卡片。板面之间的分界交给发丝线，不靠更深的底色。
const SURFACE_CARD = 'color-mix(in srgb, var(--shell-chrome) 94%, var(--shell-text))'
const SURFACE_INSET = 'color-mix(in srgb, var(--shell-chrome) 90%, var(--shell-text))'
const CARD_BORDER = '1px solid var(--shell-border)'
const CARD_BORDER_SOFT = '1px solid var(--shell-border-soft)'

// Note: transcript-only session reading and native continuation — see
// .agents/notes/sessions/records/module.md

/** Provider resume command; null when the record has no native identity. */
function buildResumeCommand(session: AgentSessionSummary): string | null {
  return buildProviderResumeCommand(session.engine, session.providerSessionId, session.transcriptPath)
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
      className={`rounded cursor-pointer ${styles.cardAction}`}
      style={{ height: grow ? 24 : 20, padding: '0 8px', fontSize: grow ? 10.5 : 10, border: '1px solid var(--shell-border)', background: 'transparent', color: 'var(--shell-muted)', fontFamily: "'SF Mono', monospace", flexShrink: 0, flex: grow ? 1 : undefined }}
    >
      {copied ? t('terminal:agentSession.copied') : (label ?? t('terminal:agentSession.copy'))}
    </button>
  )
}

export function SessionPanel({ active = true }: { active?: boolean }) {
  const { t } = useI18n('terminal')
  const sessions = useSessionStore((s) => s.sessions)
  const loading = useSessionStore((s) => s.loading)
  const error = useSessionStore((s) => s.error)
  const scopeKey = useSessionStore((s) => s.scopeKey)
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
  // Single card expansion subscribes to uiByPath so toggles re-render.
  const expandedId = useWorktreeStore((s) =>
    scopePath ? (s.uiByPath[scopePath]?.expandedSessionId ?? null) : null,
  )
  const [scope, setScope] = useState<Scope>('workspace')
  const [continueTarget, setContinueTarget] = useState<AgentSessionSummary | null>(null)
  const [continuing, setContinuing] = useState(false)
  // Hooks can bind identity after the dialog opens. Explain the live record,
  // rather than keeping a stale no-id snapshot while main will resume it.
  const continueSource = continueTarget
    ? sessions.find((session) => session.id === continueTarget.id) ?? continueTarget : null
  const [detailTarget, setDetailTarget] = useState<AgentSessionSummary | null>(null)
  const [query, setQuery] = useState('')
  const [allCounts, setAllCounts] = useState<{ all: number; archived: number } | null>(null)
  // Note: open-card live refresh follows the same session:event — debounced
  // so session update bursts reload the timeline once — see
  // .agents/notes/sessions/records/session-timeline-live.md
  const [timelineTick, setTimelineTick] = useState(0)

  useEffect(() => {
    if (!active) return
    setContinueTarget(null)
    // Pull-mode backfill: provider transcripts written outside JanusX have no
    // hook traffic, so each panel open triggers one bounded rescan; the
    // registry notifies on import and the event subscription refreshes cards.
    // Concurrent scans share one in-flight pass main-side.
    // Let the dock and its cached cards paint before a provider-store scan
    // competes with the first list IPC on the main process.
    const scanTimer = setTimeout(() => {
      void window.electron.session.scanExternal().catch(() => undefined)
    }, 120)
    if (scope === 'all') {
      void fetchSessions({})
      return () => clearTimeout(scanTimer)
    }
    if (scope === 'archived') {
      void fetchSessions({ includeArchived: true })
      return () => clearTimeout(scanTimer)
    }
    if (!activeWorkspaceId && !scopePath) {
      clearWorkspaceScope()
      return () => clearTimeout(scanTimer)
    }
    // Project scope follows the workspace until the project model lands (P2).
    void fetchSessions(scopePath ? { cwd: scopePath } : { workspaceId: activeWorkspaceId ?? undefined })
    return () => clearTimeout(scanTimer)
  }, [active, fetchSessions, clearWorkspaceScope, activeWorkspaceId, scopePath, scope])

  const handleToggle = useCallback((sessionId: string) => {
    if (!scopePath) return
    const current = useWorktreeStore.getState().uiByPath[scopePath]?.expandedSessionId ?? null
    setUiForPath(scopePath, { expandedSessionId: current === sessionId ? null : sessionId })
  }, [scopePath, setUiForPath])

  useEffect(() => active ? subscribeToEvents() : undefined, [active, subscribeToEvents])

  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = window.electron.session.onEvent(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setTimelineTick((tick) => tick + 1), 600)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [active])

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

  // Progressive mount: chunked commits keep panel open off the stall-then-
  // pop-in path. Re-stream on list identity change (scope key) or search;
  // silent same-scope refreshes keep the streamed length as-is.
  // See .agents/notes/sessions/records/session-open-stall.md
  const [shownCount, setShownCount] = useState(CARD_CHUNK)
  useEffect(() => {
    setShownCount(CARD_CHUNK)
  }, [scopeKey, query])
  useEffect(() => {
    if (shownCount >= visible.length) return
    const timer = setTimeout(() => {
      setShownCount((count) => Math.min(count + CARD_CHUNK, visible.length))
    }, CARD_CHUNK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [shownCount, visible.length])
  const shown = useMemo(() => visible.slice(0, shownCount), [visible, shownCount])

  // An empty scope tab is ambiguous with no data at all: one unfiltered fetch
  // reports the totals so the empty state names the other scopes. Runs only
  // while the visible list stays empty.
  useEffect(() => {
    if (!active || loading || visible.length > 0) return
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
  }, [active, loading, visible.length])

  return (
    <div className={`flex flex-col h-full overflow-hidden ${styles.panelGround}`}>
      <div
        className="px-3 pt-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--shell-text)' }}>
          {t('terminal:agentSession.title')}
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('terminal:agentSession.searchPlaceholder')}
            aria-label={t('terminal:agentSession.searchPlaceholder')}
            style={{
              width: '100%', height: 26, fontSize: 11.5, color: 'var(--shell-text)',
              background: SURFACE_INSET, border: '1px solid var(--shell-border)',
              borderRadius: 6, padding: '0 9px', outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
        <div className="flex" style={{ gap: 16, marginTop: 8, alignItems: 'flex-end' }}>
          {(Object.keys(SCOPE_KEYS) as Scope[]).map((key) => (
            <button
              key={key}
              className={styles.scopeTab}
              aria-current={scope === key ? 'page' : undefined}
              onClick={() => setScope(key)}
              style={{
                fontSize: 11.5,
                color: scope === key ? 'var(--shell-text)' : 'var(--shell-dim)',
                background: 'none',
                border: 'none',
                borderBottom: scope === key ? '1px solid var(--shell-dim)' : '1px solid transparent',
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
                color: 'var(--shell-dim)',
                border: '1px solid var(--shell-border)',
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
        {/* Loading banner only on a truly empty list: background refreshes
            keep stale cards (stale-while-revalidate), so a banner above the
            list would shift every card per session:event. */}
        {loading && sessions.length === 0 && (
          <div className="text-xs" style={{ color: 'var(--shell-dim)' }}>{t('terminal:agentSession.loading')}</div>
        )}
        {error && (
          <div className="text-xs" style={{ color: 'var(--shell-diff-del)' }}>{error}</div>
        )}
        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-xs" style={{ color: 'var(--shell-dim)', gap: 6 }}>
            <span>{t('terminal:agentSession.empty')}</span>
            {allCounts && (allCounts.all > 0 || allCounts.archived > 0) && (
              <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10 }}>
                {t('terminal:agentSession.scopeEmptyCounts', { all: allCounts.all, archived: allCounts.archived })}
              </span>
            )}
          </div>
        )}
        {shown.map((session) => (
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
          session={sessions.find((session) => session.id === detailTarget.id) ?? detailTarget}
          timelineTick={timelineTick}
          onClose={() => setDetailTarget(null)}
          onResume={() => {
            // Re-enter the provider's own session id in a fresh terminal;
            // failures surface on the panel error line.
            const id = detailTarget.id
            setDetailTarget(null)
            void continueSession(id, undefined, 'resume')
          }}
          onContinue={() => {
            setDetailTarget(null)
            setContinueTarget(detailTarget)
          }}
        />,
        document.body,
      )}

      {continueSource && createPortal(
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
                heading={t('terminal:agentSession.continueTitle')}
                onClose={() => setContinueTarget(null)}
              />
            <div style={{ padding: 16, fontSize: 12, color: 'var(--shell-muted)', lineHeight: 1.6 }}>
              {isNativeResumeEngine(continueSource.engine)
                ? t(buildContinueResumeArgs(continueSource)
                  ? 'terminal:agentSession.continueResumeBody'
                  : 'terminal:agentSession.continueHandoffBody')
                : t('terminal:agentSession.continueBody')}
              {!buildContinueResumeArgs(continueSource) && <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  background: SURFACE_INSET,
                  border: '1px solid var(--shell-border-soft)',
                  borderRadius: 6,
                  color: 'var(--shell-text)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                &ldquo;{continueSource.firstPrompt || continueSource.engine}&rdquo;
              </div>}
            </div>
            <div
              className="flex justify-end"
              style={{ padding: '12px 16px', borderTop: '1px solid var(--shell-border-soft)', gap: 8 }}
            >
              <button
                onClick={() => setContinueTarget(null)}
                className="rounded cursor-pointer"
                style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--shell-border-soft)', background: SURFACE_INSET, color: 'var(--shell-muted)' }}
              >
                {t('common:action.cancel')}
              </button>
              <button
                onClick={async () => {
                  if (continuing) return
                  setContinuing(true)
                  try {
                    const result = await continueSession(continueSource.id, undefined, 'continue')
                    if (result) setContinueTarget(null)
                  } finally {
                    setContinuing(false)
                  }
                }}
                disabled={continuing}
                className={`rounded cursor-pointer ${styles.cardAction}`}
                style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)' }}
              >
                {t(buildContinueResumeArgs(continueSource)
                  ? 'terminal:agentSession.continueResumeStart'
                  : 'terminal:agentSession.continueStart')}
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

/** L1 标题：首轮提示的首个短句（HiFi v6 收缩态「」标题），无提示时回落 engine。 */
function promptTitle(prompt: string): string {
  const first = prompt.split(/[，。！？；、,!?;\n]/)[0]?.trim() ?? ''
  return first.length > 24 ? `${first.slice(0, 24)}…` : first
}

/**
 * Traffic-light title bar shared by the session modals. Matches the
 * StandaloneFileEditor / StandaloneBrowser spec: 38px bar on
 * rgba(6,6,6,0.96), three 12px lights on the left, mono centered title.
 * Only the red light acts (close); yellow/green hold the layout so the
 * title stays centered like a real window.
 */
function TrafficBar({ heading, onClose }: { heading: ReactNode; onClose: () => void }) {
  const { t } = useI18n('common')
  // planche 纸面主题：标题栏走 shell 语义令牌，不再是写死的近黑色
  const planche = useThemeStore((s) => s.theme) === 'planche'
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
        background: planche ? 'var(--shell-pane-chrome)' : 'rgba(6, 6, 6, 0.96)',
        borderBottom: planche ? '1px solid var(--shell-border)' : '1px solid var(--shell-border-soft)',
      }}
    >
      <div className="flex" style={{ gap: 8, flexShrink: 0 }}>
        <ThemedTooltip label={t('common:trafficLight.close')}>
        <button
          type="button"
          aria-label={t('common:trafficLight.close')}
          onClick={onClose}
          className="cursor-pointer"
          style={light('#ff5f57')}
        />
        </ThemedTooltip>
        <ThemedTooltip label={t('common:trafficLight.minimize')}>
        <button
          type="button"
          aria-label={t('common:trafficLight.minimize')}
          disabled
          style={{ ...light('#ffbd2e'), opacity: 0.5, cursor: 'default' }}
        />
        </ThemedTooltip>
        <ThemedTooltip label={t('common:trafficLight.maximize')}>
        <button
          type="button"
          aria-label={t('common:trafficLight.maximize')}
          disabled
          style={{ ...light('#28c840'), opacity: 0.5, cursor: 'default' }}
        />
        </ThemedTooltip>
      </div>
      <div
        className="flex-1 min-w-0 overflow-hidden overflow-ellipsis whitespace-nowrap"
        style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, color: 'var(--shell-muted)', textAlign: 'center' }}
      >
        {heading}
      </div>
      <div style={{ width: 52, flexShrink: 0 }} />
    </div>
  )
}

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
  const [resending, setResending] = useState(false)
  // L2 first-prompt display cap (AC-10): clamped until the reader asks for full text.
  const [promptFull, setPromptFull] = useState(false)
  const runContinue = useSessionStore((s) => s.continueSession)
  // Stale-while-revalidate marker: the card instance is keyed by session.id,
  // so one flag covers first-load vs background refresh.
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!expanded) return
    let alive = true
    // L2 previews reload on every debounced session:event so the first prompt
    // and recent turns arrive mid-conversation.
    // Refreshes keep the previous preview visible; only the first load shows
    // the loading line, otherwise every background event flashes the card.
    if (!loadedRef.current) setDetailLoading(true)
    window.electron.session
      .get(session.id)
      .catch(() => null)
      .then((fetched) => {
        if (!alive) return
        if (fetched) {
          loadedRef.current = true
          setDetail(fetched)
        }
        setDetailLoading(false)
      })
    return () => {
      alive = false
    }
  }, [expanded, session.id, timelineTick])

  const recentTurns = useMemo(() => (detail?.turns ?? []).slice(-2), [detail])
  const resumeCommand = useMemo(() => buildResumeCommand(session), [session])
  const iconPreset = sessionEnginePreset(session.engine)

  // Note: expand motion keeps the body mounted and animates grid rows; the
  // closed body is inert — see .agents/notes/workbench/session-card-expand-motion.md
  // Note: L1 summary rows (header / prompt preview / meta) follow the v6 HiFi
  // collapsed design — see .agents/notes/workbench/session-card-l1-summary.md

  return (
    <div
      className={styles.cardSurface}
      data-session-id={session.id}
      style={{
        padding: 10,
        opacity: session.archived ? 0.62 : 1,
      }}
    >
      <div
        className={`flex items-center ${styles.cardHeader}`}
        style={{ gap: 7, cursor: 'pointer' }}
        onClick={onToggle}
      >
        <TerminalPresetIcon preset={iconPreset} alt={session.engine} style={{ width: 14, height: 14 }} />
        <span style={{ fontSize: 11, color: 'var(--shell-muted)', flexShrink: 0, textTransform: 'capitalize' }}>
          {session.engine}
        </span>
        {session.external === true && (
          <span
            style={{
              fontSize: 9.5,
              color: 'var(--shell-accent)',
              border: '1px solid var(--shell-accent-border)',
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
          style={{ fontSize: 12, color: 'var(--shell-text)', fontWeight: 500 }}
        >
          {session.firstPrompt ? `「${promptTitle(session.firstPrompt)}」` : session.engine}
        </span>
        <span
          style={{
            fontFamily: "'SF Mono', monospace",
            fontSize: 10,
            color: 'var(--shell-dim)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {session.archived ? t('terminal:agentSession.archived') : statusLabel(session.status, t)}
        </span>
        <ThemedTooltip label={expanded ? t('terminal:agentSession.collapse') : t('terminal:agentSession.expand')}>
        <button
          type="button"
          className={styles.foldBtn}
          data-open={expanded}
          aria-expanded={expanded}
          aria-label={expanded ? t('terminal:agentSession.collapse') : t('terminal:agentSession.expand')}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
        </button>
        </ThemedTooltip>
      </div>

      {session.firstPrompt && (
        <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: 'var(--shell-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.firstPrompt}
        </div>
      )}
      <div style={{ marginTop: 4, fontFamily: "'SF Mono', monospace", fontSize: 10, color: 'var(--shell-muted)', lineHeight: 1.6 }}>
        {t('terminal:agentSession.turns', { count: session.turnCount })} · {formatDate(session.updatedAt, t)}
      </div>

      <div className={styles.expand} data-open={expanded}>
        <div className={styles.expandInner} {...(!expanded ? { inert: '' } : {})}>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: CARD_BORDER_SOFT }}>
            <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: 'var(--shell-muted)', lineHeight: 1.8 }}>
              <div>…/{baseNameOf(session.cwd)}{session.branch ? ` · ${session.branch}` : ''}</div>
            </div>
            {session.firstPrompt && (
              <div className={styles.sheet} style={{ marginTop: 8, padding: '9px 10px' }}>
                <div className="flex items-center" style={{ gap: 8, fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: 'var(--shell-dim)', marginBottom: 6 }}>
                  <span>{t('terminal:agentSession.firstPrompt')}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <CopyButton text={session.firstPrompt} />
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: 'var(--shell-text)',
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                    ...(session.firstPrompt.length > PROMPT_CLAMP_CHARS && !promptFull
                      ? { display: '-webkit-box', WebkitLineClamp: PROMPT_CLAMP_LINES, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
                      : {}),
                  }}
                >
                  {session.firstPrompt}
                </div>
                {session.firstPrompt.length > PROMPT_CLAMP_CHARS && (
                  <button
                    type="button"
                    onClick={() => setPromptFull((open) => !open)}
                    className={styles.cardAction}
                    style={{
                      marginTop: 4,
                      padding: 0,
                      border: 0,
                      background: 'transparent',
                      color: 'var(--shell-accent)',
                      fontSize: 10,
                      fontFamily: "'SF Mono', monospace",
                      cursor: 'pointer',
                    }}
                  >
                    {promptFull ? t('terminal:agentSession.collapse') : t('terminal:agentSession.expand')}
                  </button>
                )}
              </div>
            )}
            <div className={styles.sheet} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', padding: '2px 10px' }}>
              <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: 'var(--shell-dim)', padding: '8px 0 0' }}>
                {t('terminal:agentSession.recentTurns')}
              </div>
              {!detail ? (
                <div style={{ fontSize: 11, color: 'var(--shell-dim)', padding: '6px 0' }}>{detailLoading ? t('terminal:agentSession.loading') : t('terminal:agentSession.empty')}</div>
              ) : recentTurns.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--shell-dim)', padding: '6px 0' }}>{t('terminal:agentSession.empty')}</div>
              ) : (
                recentTurns.map((turn) => {
                  const question = turn.prompt
                  return (
                    <div key={turn.id} style={{ padding: '8px 0', borderTop: '1px solid var(--shell-border-soft)' }}>
                      <div className="flex items-center" style={{ gap: 6, fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: 'var(--shell-dim)', marginBottom: 4 }}>
                        <span>turn · {formatDate(turn.startedAt, t)}</span>
                        <span style={{ color: turn.kind === 'done' ? 'var(--shell-muted)' : 'var(--shell-diff-del)', border: '1px solid var(--shell-border)', borderRadius: 3, padding: '0 5px' }}>
                          {turnKindLabel(turn.kind, t)}
                        </span>
                      </div>
                      {question && (
                        <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--shell-text)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {question}
                        </div>
                      )}
                      {turn.excerpt && (
                        <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.6, color: 'var(--shell-muted)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {turn.excerpt}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            <div className="flex" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
              <button
                onClick={onDetail}
                className={`flex-1 rounded cursor-pointer ${styles.cardAction}`}
                style={{ height: 24, fontSize: 10.5, border: '1px solid var(--shell-accent-border)', background: 'var(--shell-accent-soft)', color: 'var(--shell-text)', whiteSpace: 'nowrap' }}
              >
                {t('terminal:agentSession.viewDetail')}
              </button>
              {session.archived && !canOfferSessionResume(session) ? null : (
                <>
                  {canOfferSessionResume(session) && (
                    resumeCommand ? (
                      <button
                        onClick={() => {
                          if (resuming) return
                          setResuming(true)
                          void runContinue(session.id, undefined, 'resume').finally(() => setResuming(false))
                        }}
                        disabled={resuming}
                        className={`flex-1 rounded cursor-pointer ${styles.cardAction}`}
                        style={{ height: 24, fontSize: 10.5, border: '1px solid var(--shell-accent-border)', background: 'var(--shell-accent-soft)', color: 'var(--shell-text)', opacity: resuming ? 0.6 : 1, whiteSpace: 'nowrap' }}
                      >
                        {t('terminal:agentSession.resume')}
                      </button>
                    ) : (
                      <ThemedTooltip label={t('terminal:agentSession.resumeUnavailable')}>
                      <button
                        disabled
                        className="flex-1 rounded"
                        style={{ height: 24, fontSize: 10.5, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)', opacity: 0.6, whiteSpace: 'nowrap' }}
                      >
                        {t('terminal:agentSession.resume')}
                      </button>
                      </ThemedTooltip>
                    )
                  )}
                  {!session.archived && <button
                    onClick={onContinue}
                    className={`flex-1 rounded cursor-pointer ${styles.cardAction}`}
                    style={{ height: 24, fontSize: 10.5, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)', whiteSpace: 'nowrap' }}
                  >
                    {t('terminal:agentSession.continue')}
                  </button>}
                </>
              )}
            </div>
            {detail?.pendingHandoff && (
              <div
                style={{
                  marginTop: 8, padding: '7px 9px',
                  border: '1px dashed var(--shell-border)', borderRadius: 4, lineHeight: 1.6,
                }}
              >
                <div style={{ fontSize: 10.5, color: 'var(--shell-dim)' }}>
                  {detail.pendingHandoffState === 'failed'
                    ? t('terminal:agentSession.handoffFailed')
                    : t('terminal:agentSession.handoffUnconfirmed')}
                </div>
                <button
                  onClick={() => {
                    if (resending) return
                    setResending(true)
                    void window.electron.session
                      .resendHandoff(session.id)
                      .finally(() => setResending(false))
                  }}
                  disabled={resending}
                  className="rounded cursor-pointer"
                  style={{
                    marginTop: 6, height: 22, padding: '0 12px', fontSize: 10,
                    border: '1px solid var(--control-border)', background: 'transparent',
                    color: 'var(--shell-text)', opacity: resending ? 0.6 : 1,
                  }}
                >
                  {t('terminal:agentSession.handoffResend')}
                </button>
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--shell-dim)', marginTop: 7, lineHeight: 1.6 }}>
              {t('terminal:agentSession.detailHint', { count: session.turnCount })}
            </div>
            {session.archived && (
              <div
                style={{
                  fontSize: 10.5, color: 'var(--shell-dim)', marginTop: 8, padding: '7px 9px',
                  border: '1px dashed var(--shell-border)', borderRadius: 4, lineHeight: 1.6,
                }}
              >
                {t('terminal:agentSession.archivedHint')}
              </div>
            )}
            {session.external === true && !session.archived && (
              <div style={{ fontSize: 10, color: 'var(--shell-dim)', marginTop: 6, lineHeight: 1.6 }}>
                {t('terminal:agentSession.externalHint')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionDetailWindow({
  session,
  timelineTick,
  onClose,
  onResume,
  onContinue,
}: {
  session: AgentSessionSummary
  timelineTick: number
  onClose: () => void
  /** Re-enter the provider's own session in a new terminal. */
  onResume: () => void
  onContinue: () => void
}) {
  const { t } = useI18n('terminal')
  const [detail, setDetail] = useState<AgentSessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null)
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null)
  const turnRefs = useMemo(() => new Map<string, HTMLDivElement | null>(), [])
  const turnsPaneRef = useRef<HTMLDivElement | null>(null)
  const navPaneRef = useRef<HTMLDivElement | null>(null)
  const jumpToTurn = useCallback((id: string) => {
    setActiveTurnId(id)
    turnRefs.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [turnRefs])
  const resumeCommand = useMemo(() => buildResumeCommand(session), [session])
  useEffect(() => {
    let alive = true
    // Reload live questions and excerpts on debounced session events.
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
  }, [session.id, timelineTick])

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

  const displayTurns = useMemo(
    () =>
      mergeTranscriptTurns(detail?.turns ?? [], transcript?.turns ?? [], {
        createdAt: detail?.createdAt ?? session.createdAt,
        updatedAt: detail?.updatedAt ?? session.updatedAt,
      }),
    [detail, transcript, session.createdAt, session.updatedAt],
  )

  // Scroll-spy: the rail follows the turn under a reading line near the top
  // of the pane. A zero-width line sits inside exactly one turn at a time, so
  // the focus changes once per boundary crossing and never flickers between
  // neighbors the way threshold-chasing observers do.
  useEffect(() => {
    const pane = turnsPaneRef.current
    if (!pane) return
    let raf = 0
    const update = () => {
      raf = 0
      const line = pane.getBoundingClientRect().top + pane.clientHeight * 0.2
      let current: string | null = null
      for (const [key, el] of turnRefs) {
        if (!el || !el.isConnected) {
          turnRefs.delete(key)
          continue
        }
        const box = el.getBoundingClientRect()
        if (box.top <= line && box.bottom > line) {
          current = key
          break
        }
      }
      if (current) setActiveTurnId((prev) => (prev === current ? prev : current))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    pane.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      pane.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [displayTurns, turnRefs])

  // Keep the active rail entry in view without stealing the reading scroll.
  useEffect(() => {
    if (!activeTurnId) return
    navPaneRef.current
      ?.querySelector(`[data-nav="${CSS.escape(activeTurnId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeTurnId])

  const iconPreset = sessionEnginePreset(session.engine)

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
          width: 1020,
          maxWidth: 'calc(100vw - 40px)',
          height: 660,
          maxHeight: 'calc(100vh - 60px)',
          background: 'var(--shell-chrome)',
          border: '1px solid var(--shell-border)',
          borderRadius: 8,
          boxShadow: '0 24px 60px rgba(0,0,0,0.72)',
        }}
      >
        <TrafficBar
          heading={
            <>
              <TerminalPresetIcon preset={iconPreset} alt={session.engine} style={{ width: 12, height: 12, display: 'inline-block', verticalAlign: -1, marginRight: 6 }} />
              {session.firstPrompt || session.engine}
            </>
          }
          onClose={onClose}
        />
        <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--shell-border-soft)', flexShrink: 0 }}>
          <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10.5, color: 'var(--shell-muted)', lineHeight: 1.7 }}>
            …/{baseNameOf(session.cwd)}{session.branch ? ` · ${session.branch}` : ''} · {session.engine} ·{' '}
            {t('terminal:agentSession.turns', { count: session.turnCount })}
          </div>
          <div className="flex" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {session.firstPrompt && <CopyButton text={session.firstPrompt} label={t('terminal:agentSession.firstPrompt')} />}
            {(detail?.transcriptPath ?? session.transcriptPath) && (
              <CopyButton text={(detail?.transcriptPath ?? session.transcriptPath) as string} label={t('terminal:agentSession.copyLogPath')} />
            )}
            {(detail?.providerSessionId ?? session.providerSessionId) && (
              <CopyButton text={(detail?.providerSessionId ?? session.providerSessionId) as string} label={t('terminal:agentSession.copySessionId')} />
            )}
            {canOfferSessionResume(session) && resumeCommand && (
              <CopyButton text={resumeCommand} label={t('terminal:agentSession.resumeCopy')} />
            )}
          </div>
        </div>
        {session.external === true && !session.archived && (
          <div style={{ margin: '10px 16px 0', padding: '8px 11px', border: '1px dashed var(--shell-accent-border)', borderRadius: 6, fontSize: 11, color: 'var(--shell-accent)', lineHeight: 1.6, flexShrink: 0 }}>
            {t('terminal:agentSession.detailExternalBanner')}
          </div>
        )}
        {session.archived && (
          <div style={{ margin: '10px 16px 0', padding: '8px 11px', border: '1px dashed var(--shell-border)', borderRadius: 6, fontSize: 11, color: 'var(--shell-muted)', lineHeight: 1.6, flexShrink: 0 }}>
            {t('terminal:agentSession.archivedHint')}
          </div>
        )}
        <div className="flex" style={{ flex: 1, minHeight: 0 }}>
          <div ref={navPaneRef} style={{ width: 168, flexShrink: 0, borderRight: '1px solid var(--shell-border-soft)', overflowY: 'auto', padding: '10px 8px', background: SURFACE_INSET }}>
            <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: 'var(--shell-dim)', padding: '0 6px 6px' }}>
              {t('terminal:agentSession.turns', { count: displayTurns.length })}
            </div>
            {displayTurns.map((turn, index) => {
              const label = (turn.prompt ?? turn.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 20) || `turn ${index + 1}`
              const active = activeTurnId === turn.id
              return (
                <ThemedTooltip key={turn.id} label={turn.prompt ?? turn.excerpt ?? `turn ${index + 1}`}>
                <button
                  data-nav={turn.id}
                  onClick={() => jumpToTurn(turn.id)}
                  className="cursor-pointer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '5px 6px', borderRadius: 4, border: 0, cursor: 'pointer',
                    background: active ? 'var(--shell-accent-soft)' : 'transparent',
                    color: active ? 'var(--shell-text)' : 'var(--shell-muted)',
                    fontFamily: "'SF Mono', monospace", fontSize: 10, lineHeight: 1.5, textAlign: 'left',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: turn.kind === 'done' ? 'transparent' : turn.kind === 'failed' ? 'var(--shell-diff-del)' : 'var(--shell-accent)' }} />
                  <span style={{ color: 'var(--shell-dim)', flexShrink: 0 }}>{index + 1}</span>
                  <span className="flex-1 min-w-0 overflow-hidden overflow-ellipsis whitespace-nowrap">{label}</span>
                </button>
                </ThemedTooltip>
              )
            })}
          </div>
          <div ref={turnsPaneRef} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '12px 16px' }}>
            {!detail ? (
              <div style={{ fontSize: 11, color: 'var(--shell-dim)' }}>{detailLoading ? t('terminal:agentSession.loading') : t('terminal:agentSession.empty')}</div>
            ) : (
              <>
                {transcript?.truncated && (
                  <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 10, color: 'var(--shell-dim)', padding: '2px 0 8px' }}>
                    {t('terminal:agentSession.transcriptTruncated', { total: transcript.totalTurns, shown: transcript.turns.length })}
                  </div>
                )}
                {displayTurns.map((turn, index) => {
                  const question = turn.prompt
                  return (
                    <div
                      key={turn.id}
                      ref={(node) => { turnRefs.set(turn.id, node) }}
                      style={{
                        background: SURFACE_CARD,
                        border: activeTurnId === turn.id ? '1px solid var(--shell-accent-border)' : CARD_BORDER,
                        borderRadius: 8, padding: '11px 12px', marginBottom: 10,
                      }}
                    >
                      {question && (
                        <div style={{ marginBottom: 9 }}>
                          <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: 'var(--shell-dim)', marginBottom: 5 }}>
                            turn {index + 1} · {formatDate(turn.startedAt, t)}
                          </div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--shell-text)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                            {question}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center" style={{ gap: 6, fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: 'var(--shell-dim)' }}>
                        <span>{session.engine}</span>
                        <span style={{ color: turn.kind === 'done' ? 'var(--shell-muted)' : 'var(--shell-diff-del)', border: '1px solid var(--shell-border)', borderRadius: 3, padding: '0 5px' }}>
                          {turnKindLabel(turn.kind, t)}
                        </span>
                        {!question && <span>turn {index + 1} · {formatDate(turn.startedAt, t)}</span>}
                      </div>
                      {turn.excerpt && (
                        <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.65, color: 'var(--shell-text)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                          {turn.excerpt}
                        </div>
                      )}
                    </div>
                  )
                })}
                {displayTurns.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--shell-dim)', padding: '6px 0' }}>{t('terminal:agentSession.empty')}</div>
                )}
              </>
            )}
          </div>
        </div>
        <div
          className="flex items-center"
          style={{ gap: 8, padding: '10px 14px', borderTop: '1px solid var(--shell-border-soft)', flexShrink: 0, flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 11, color: 'var(--shell-muted)', flex: 1 }}>
            {t('terminal:agentSession.detailReadOnlyHint')}
          </span>
          <button
            onClick={onClose}
            className="rounded cursor-pointer"
            style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--shell-border-soft)', background: SURFACE_INSET, color: 'var(--shell-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            {t('common:action.close')}
          </button>
          {session.archived && !canOfferSessionResume(session) ? null : (
            <>
              {canOfferSessionResume(session) && (
                resumeCommand ? (
                  <button
                    onClick={onResume}
                    className="rounded cursor-pointer"
                    style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--shell-accent-border)', background: 'var(--shell-accent-soft)', color: 'var(--shell-text)', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {t('terminal:agentSession.resume')}
                  </button>
                ) : (
                  <ThemedTooltip label={t('terminal:agentSession.resumeUnavailable')}>
                  <button
                    disabled
                    className="rounded"
                    style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-muted)', opacity: 0.6, flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {t('terminal:agentSession.resume')}
                  </button>
                  </ThemedTooltip>
                )
              )}
              {!session.archived && <button
                onClick={onContinue}
                className="rounded cursor-pointer"
                style={{ height: 28, padding: '0 16px', fontSize: 11, border: '1px solid var(--control-border)', background: 'transparent', color: 'var(--shell-text)', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {t('terminal:agentSession.continue')}
              </button>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
