import { useState, useCallback, useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore } from '@/stores/app'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { useJanusState } from './useJanusState'
import { projectService, type ProjectConfig } from '@/services/project'
import type { Terminal, Workspace } from '@/types'
import { JanusChat } from './JanusChat'
import type { ChatModelOption, Message } from './useJanusChat'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSubAgentRunStore } from '@/stores/subagent-run'
import { STATUS_VISUALS } from '../blueprint/blueprintStatus'
import { JanusIdentityCore } from './JanusIdentityCore'
import {
  getJanusAgentIdentity,
  type JanusAgentIdentityId,
  type JanusIdentityState,
} from './janusIdentity'
import type { SubAgentRun, SubAgentRunRole, SubAgentRunStatus } from '../../../../shared/subAgentRun'
import type { KnowledgeRecallTrace } from '../../../../shared/knowledge'
import { formatKnowledgeMatch } from './islandKnowledgePeek'
import { getDoubleActivationAction, getSingleActivationAction } from './islandInteraction'

/* ════════════════════════════════════════════════════════════
   JanusIsland �?52×26px 折叠态胶�?
   状态由 useJanusState 统一管理，视觉由 data-mode 属性驱�?
   ════════════════════════════════════════════════════════════ */

/** useProjectRunning �?管理项目运行状�?*/
function useProjectRunning(activeWorkspace: Workspace | undefined) {
  const { janusRunning, setJanusRunning, setRunningProjects } = useAppStore()
  const [workspaceConfig, setWorkspaceConfig] = useState<ProjectConfig | null>(null)
  const configRef = useRef<ProjectConfig | null>(null)

  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      setRunningProjects([])
      setJanusRunning(false)
      configRef.current = null
      return
    }

    const loadData = async () => {
      try {
        const config = await projectService.readConfig(activeWorkspace.path)
        setWorkspaceConfig(config)
        configRef.current = config
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        setRunningProjects(running)
        setJanusRunning(running.length > 0)
      } catch (err) {
        console.error('Failed to load workspace data:', err)
      }
    }

    loadData()
    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [activeWorkspace, setJanusRunning, setRunningProjects])

  useEffect(() => { configRef.current = workspaceConfig }, [workspaceConfig])

  const toggleRunning = useCallback(async () => {
    if (!activeWorkspace || !configRef.current) return
    try {
      if (janusRunning) {
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        await Promise.all(running.map((p) => projectService.stop(p.id)))
        setJanusRunning(false)
        setRunningProjects([])
      } else {
        const cfg = configRef.current
        const defaultConfig =
          cfg.configurations.find((c) => c.name === 'dev') || cfg.configurations[0]
        if (defaultConfig) {
          const success = await projectService.start(activeWorkspace.path, defaultConfig.name)
          if (success) {
            const running = await projectService.listByWorkspace(activeWorkspace.path)
            setJanusRunning(running.length > 0)
            setRunningProjects(running)
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle project:', err)
    }
  }, [activeWorkspace, janusRunning, setJanusRunning, setRunningProjects])

  return { janusRunning, toggleRunning }
}

interface JanusIslandProps {
  stage?: 'collapsed' | 'peek' | 'expanded'
  onSingleActivate: () => void
  onDoubleActivate: () => void
  onDismiss: () => void
  onRunningChange?: (isRunning: boolean) => void
  messages: Message[]
  pendingContent: string
  isStreaming: boolean
  error: string | null
  modelOptions: ChatModelOption[]
  activeModel: ChatModelOption | null
  modelNotice: string | null
  onChatCycleModel: () => void
  onChatSelectModel: (providerId: string) => void
  onChatSend: (text: string) => void
  onChatStop: () => void
  onChatRetry: () => void
  onChatClear: () => void
  onOpenLlmConfig: () => void
  knowledgeTrace?: KnowledgeRecallTrace | null
  knowledgePeekActive?: boolean
  knowledgePeekEmpty?: boolean
}

type JanusExpandedView = 'monitor' | 'chat'

const SUBAGENT_STATUS_LABELS: Record<SubAgentRunStatus, string> = {
  queued: 'queued',
  running: 'running',
  'waiting-approval': 'approval',
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
}

function roleIdentity(role: SubAgentRunRole): JanusAgentIdentityId {
  switch (role) {
    case 'main':
      return 'main'
    case 'coder':
      return 'coder'
    case 'evaluator':
      return 'evaluator'
    case 'abstracter':
      return 'abstracter'
    case 'prompter':
      return 'prompter'
    case 'subagent':
    case 'custom':
      return 'subagent'
  }
}

function runIdentityState(status: SubAgentRunStatus): JanusIdentityState {
  switch (status) {
    case 'running':
      return 'running'
    case 'waiting-approval':
      return 'scanning'
    case 'done':
      return 'done'
    case 'failed':
    case 'cancelled':
      return 'failed'
    case 'queued':
      return 'default'
  }
}

function previewIdentityState(run: SubAgentRun | null): JanusIdentityState {
  if (!run) return 'default'
  if (run.role === 'main') {
    if (run.status === 'waiting-approval') return 'scanning'
    if (run.status === 'failed' || run.status === 'cancelled') return 'failed'
    if (run.status === 'done') return 'done'
    return 'default'
  }
  return runIdentityState(run.status)
}

function formatRunAge(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}

function terminalProviderLabel(preset: Terminal['preset']): string {
  switch (preset) {
    case 'claude':
      return 'Claude'
    case 'codex':
      return 'Codex'
    case 'opencode':
      return 'OpenCode'
    case 'shell':
      return 'Shell'
  }
}

function terminalStatusLabel(status: Terminal['status']): string {
  switch (status) {
    case 'running':
      return 'running'
    case 'exited':
      return 'done'
    case 'idle':
      return 'idle'
  }
}

function runEngineLabel(run: SubAgentRun): string {
  return run.engine ? terminalProviderLabel(run.engine) : run.source
}
function runRoleLabel(role: SubAgentRunRole): string {
  return getJanusAgentIdentity(roleIdentity(role)).roleTag
}

function runtimeRoleStyle(role: SubAgentRunRole): CSSProperties {
  const identity = getJanusAgentIdentity(roleIdentity(role))
  return {
    '--janus-runtime-role-color': identity.color,
    '--janus-runtime-role-glow': identity.glow,
  } as CSSProperties
}

function faceClass(mode: 'sleep' | 'order' | 'analytics' | 'running'): string {
  if (mode === 'analytics') return 'mode-analytics'
  if (mode === 'running') return 'mode-running'
  return 'mode-order'
}

export function JanusIsland({
  stage = 'collapsed',
  onSingleActivate,
  onDoubleActivate,
  onDismiss,
  onRunningChange,
  messages,
  pendingContent,
  isStreaming,
  error,
  modelOptions,
  activeModel,
  modelNotice,
  onChatCycleModel,
  onChatSelectModel,
  onChatSend,
  onChatStop,
  onChatRetry,
  onChatClear,
  onOpenLlmConfig,
  knowledgeTrace = null,
  knowledgePeekActive = false,
  knowledgePeekEmpty = false,
}: JanusIslandProps) {
  const { mode, isSwitching, activeWorkspace, eyeContainerRef } = useJanusState()
  const { janusRunning, toggleRunning } = useProjectRunning(activeWorkspace)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const conversationStartedRef = useRef(false)
  const [view, setView] = useState<JanusExpandedView>('monitor')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [particles, setParticles] = useState<Array<{ id: number; left: number; size: number; duration: number }>>([])
  const pidRef = useRef(0)
  const subAgentRuns = useSubAgentRunStore((s) => s.runs)
  const fetchSubAgentRuns = useSubAgentRunStore((s) => s.fetchRuns)
  const subscribeToSubAgentRuns = useSubAgentRunStore((s) => s.subscribeToEvents)
  const activeTerminalId = useWorkspaceStore((s) => s.activeTerminalId)
  const terminals = useWorkspaceStore((s) => s.terminals)

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)

  const handleLongPress = useCallback(async () => {
    await toggleRunning()
  }, [toggleRunning])

  const handleDoubleTap = useCallback(() => {
    onDoubleActivate()
  }, [onDoubleActivate])
  const handleSingleTap = useCallback(() => {
    onSingleActivate()
  }, [onSingleActivate])

  const handleIslandKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.repeat) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    handleSingleTap()
  }, [handleSingleTap])

  const handleSwipeFlip = useCallback(() => {
    setBlueprintMode(!blueprintMode)
  }, [blueprintMode, setBlueprintMode])

  const handleOpenBlueprintWorkbench = useCallback(() => {
    setActiveWorkbench('blueprint')
  }, [setActiveWorkbench])

  const handleDragProgress = useCallback((_deltaY: number, progress: number) => {
    useAppStore.getState().setDragFlipProgress(progress)
  }, [])

  const {
    islandRef,
    pullHintRef,
    eyeLeftRef,
    eyeRightRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useIslandGesture({
    onLongPress: handleLongPress,
    onSwipeFlip: handleSwipeFlip,
    onDoubleTap: handleDoubleTap,
    onSingleTap: handleSingleTap,
    onDragProgress: handleDragProgress,
    isRunning: janusRunning,
    enableComplexGestures: stage !== 'expanded',
  })

  const activeSession = useBlueprintStore((s) => s.activeSession)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeNode =
    activeSession && currentBlueprint?.id === activeSession.blueprintId
      ? currentBlueprint.nodes[activeSession.nodeId] ?? activeSession.nodeSnapshot
      : activeSession?.nodeSnapshot ?? null
  const activeVisual = activeNode ? STATUS_VISUALS[activeNode.status] ?? STATUS_VISUALS['not-started'] : null

  const peekTitle = useMemo(() => knowledgePeekEmpty ? 'Knowledge' : knowledgePeekActive && knowledgeTrace ? 'Knowledge recalled' : '', [knowledgePeekActive, knowledgePeekEmpty, knowledgeTrace])

  const peekSubtitle = useMemo(() => {
    if (knowledgePeekEmpty) return 'No knowledge match'
    if (knowledgePeekActive && knowledgeTrace?.topHit) {
      const count = String(knowledgeTrace.recalledCount) + ' item' + (knowledgeTrace.recalledCount === 1 ? '' : 's')
      return count + ' | ' + formatKnowledgeMatch(knowledgeTrace.topHit.score) + ' | ' + knowledgeTrace.topHit.kind + ': ' + knowledgeTrace.topHit.title
    }
    return ''
  }, [knowledgePeekActive, knowledgePeekEmpty, knowledgeTrace])

  const modeLabel = activeNode ? 'BLUEPRINT' : mode === 'analytics' ? 'ANALYTICS' : mode === 'running' ? 'RUNNING' : 'ORDER'
  const statusText = knowledgePeekEmpty
    ? 'KNOWLEDGE // NO MATCH'
    : knowledgePeekActive && knowledgeTrace
    ? 'KNOWLEDGE // ' + (knowledgeTrace.truncated ? 'TRUNCATED' : 'READY')
    : activeNode
    ? 'BLUEPRINT // FOCUSED'
    : janusRunning
    ? 'RUNNING // ACTIVE'
    : mode === 'analytics'
      ? 'ANALYTICS // PROCESSING...'
      : 'ORDER // IDLE'
  const modeColor = activeVisual?.color ?? (mode === 'running' ? '#00ff88' : '#ff7830')
  const activeNodeTitle = activeNode?.title || 'No active blueprint node'
  const workspaceLabel = activeSession?.workspaceName ?? activeWorkspace?.name ?? 'Workspace'
  const hasConversation = messages.length > 0 || !!pendingContent || isStreaming || !!error
  const activeTerminal = useMemo(
    () => activeTerminalId ? terminals.find((terminal) => terminal.id === activeTerminalId) ?? null : null,
    [activeTerminalId, terminals]
  )
  const runsById = useMemo(() => new Map(subAgentRuns.map((run) => [run.id, run])), [subAgentRuns])
  const monitoredRun = useMemo(
    () => activeTerminalId
      ? subAgentRuns.find((run) => run.terminalId === activeTerminalId || run.rootTerminalId === activeTerminalId) ?? null
      : null,
    [activeTerminalId, subAgentRuns]
  )
  const activeMissionId = monitoredRun?.missionId ?? activeTerminalId ?? null
  const activeRootRunId = monitoredRun?.rootRunId ?? monitoredRun?.id ?? (activeTerminalId ? `terminal:${activeTerminalId}` : null)
  const missionSubAgentRuns = useMemo(() => {
    if (!activeTerminalId) return []

    const belongsToActiveMission = (run: SubAgentRun): boolean => {
      if (run.terminalId === activeTerminalId || run.rootTerminalId === activeTerminalId) return true
      if (activeMissionId && run.missionId === activeMissionId) return true
      if (activeRootRunId && run.rootRunId === activeRootRunId) return true

      const visited = new Set<string>()
      let parentId = run.parentRunId
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId)
        const parent = runsById.get(parentId)
        if (!parent) return false
        if (parent.terminalId === activeTerminalId || parent.rootTerminalId === activeTerminalId) return true
        if (activeMissionId && parent.missionId === activeMissionId) return true
        if (activeRootRunId && (parent.id === activeRootRunId || parent.rootRunId === activeRootRunId)) return true
        parentId = parent.parentRunId
      }
      return false
    }

    return subAgentRuns.filter(belongsToActiveMission)
  }, [activeMissionId, activeRootRunId, activeTerminalId, runsById, subAgentRuns])
  const visibleSubAgentRuns = useMemo(() => missionSubAgentRuns.slice(0, 6), [missionSubAgentRuns])
  const mainMissionRun = useMemo(
    () => missionSubAgentRuns.find((run) => run.role === 'main') ?? null,
    [missionSubAgentRuns]
  )
  const defaultMonitorRun = useMemo(
    () => mainMissionRun ?? monitoredRun ?? null,
    [mainMissionRun, monitoredRun]
  )
  const selectedMonitorRun = useMemo(() => {
    if (!selectedRunId) return null
    return missionSubAgentRuns.find((run) => run.id === selectedRunId) ?? null
  }, [missionSubAgentRuns, selectedRunId])
  const previewRun = selectedMonitorRun ?? defaultMonitorRun
  const previewIdentity = previewRun ? roleIdentity(previewRun.role) : 'main'
  const previewState = previewIdentityState(previewRun)
  const previewIdentitySpec = getJanusAgentIdentity(previewIdentity)
  const monitorTitle = previewRun?.title ?? activeTerminal?.name ?? activeNodeTitle
  const monitorStatusText = previewRun
    ? `${runEngineLabel(previewRun)} // ${SUBAGENT_STATUS_LABELS[previewRun.status]}`
    : activeTerminal
      ? `${terminalProviderLabel(activeTerminal.preset)} // ${terminalStatusLabel(activeTerminal.status)}`
      : statusText

  const focusRunTerminal = useCallback((run: SubAgentRun) => {
    if (!run.terminalId) return
    const workspaceState = useWorkspaceStore.getState()
    if (workspaceState.terminals.some((terminal) => terminal.id === run.terminalId)) {
      workspaceState.setActiveTerminal(run.terminalId)
    }
  }, [])

  useEffect(() => {
    void fetchSubAgentRuns()
    return subscribeToSubAgentRuns()
  }, [fetchSubAgentRuns, subscribeToSubAgentRuns])

  useEffect(() => {
    setSelectedRunId((current) => {
      if (current && visibleSubAgentRuns.some((run) => run.id === current)) return current
      return mainMissionRun?.id ?? monitoredRun?.id ?? null
    })
  }, [mainMissionRun, monitoredRun, visibleSubAgentRuns])

  useEffect(() => {
    if (stage === 'peek') setView('monitor')
  }, [stage])

  useEffect(() => {
    if (!selectedRunId) return
    if (missionSubAgentRuns.some((run) => run.id === selectedRunId)) return
    setSelectedRunId(null)
  }, [missionSubAgentRuns, selectedRunId])

  useEffect(() => {
    const hadConversation = conversationStartedRef.current
    conversationStartedRef.current = hasConversation
    if (stage === 'expanded' && hasConversation && !hadConversation) {
      setView('chat')
    }
  }, [hasConversation, stage])

  useEffect(() => {
    if (stage === 'collapsed') return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      const shell = shellRef.current
      if (!shell || !target || shell.contains(target)) return
      onDismiss()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onDismiss()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onDismiss, stage])

  useEffect(() => {
    if (stage !== 'expanded') {
      setParticles([])
      return
    }
    const active = !!activeNode || mode === 'analytics' || janusRunning
    const speed = active ? 200 : 800
    const spawn = () => {
      const id = ++pidRef.current
      const left = 20 + Math.random() * 60
      const size = active && Math.random() > 0.5 ? 6 : Math.random() > 0.8 ? 12 : 6
      const duration = active ? 1.5 + Math.random() * 2 : 3 + Math.random() * 4
      setParticles((prev) => [...prev, { id, left, size, duration }])
      window.setTimeout(() => setParticles((prev) => prev.filter((p) => p.id !== id)), duration * 1000)
    }
    const interval = window.setInterval(spawn, speed)
    return () => window.clearInterval(interval)
  }, [activeNode, janusRunning, mode, stage])

  useEffect(() => {
    onRunningChange?.(janusRunning)
    document.body.classList.toggle('is-running', janusRunning)
    return () => { document.body.classList.remove('is-running') }
  }, [janusRunning, onRunningChange])

  return (
    <div
      ref={shellRef}
      className={`janus-island-shell ${faceClass(mode)}`}
      data-stage={stage}
      data-view={view}
      data-mode={mode}
      data-peek-kind="knowledge"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {stage === 'expanded' && <div className="janus-veil" />}
      <div ref={pullHintRef} className="pull-hint" />
      <div className="burst-ripple" />
      <div
        ref={islandRef}
        data-mode={mode}
        data-stage={stage}
        className={`janus-island${isSwitching ? ' switching' : ''}`}
        role={stage !== 'expanded' ? 'button' : undefined}
        tabIndex={stage !== 'expanded' ? 0 : undefined}
        aria-label={stage === 'peek' ? 'Close knowledge peek' : stage === 'collapsed' ? 'Open Janus Island' : undefined}
        onKeyDown={stage !== 'expanded' ? handleIslandKeyDown : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="janus-collapsed-core">
          <div ref={(el) => { eyeContainerRef.current = el }} className="janus-face-mini">
            <JanusEye mode={mode} size={10} leftRef={eyeLeftRef} rightRef={eyeRightRef} />
          </div>
        </div>

        <div className="janus-peek-shell">
          <div className="janus-peek-orbit" aria-hidden="true" />
          <div className="janus-peek-core">
            <div className="janus-peek-leading">
              <div className={`janus-peek-sigil ${faceClass(mode)}`}>
                <div className="janus-peek-halo halo-outer" aria-hidden="true" />
                <div className="janus-peek-halo halo-inner" aria-hidden="true" />
                <div className="janus-peek-eyes" aria-hidden="true">
                  <div className="janus-peek-eye left" />
                  <div className="janus-peek-eye right" />
                </div>
              </div>
              <div className="janus-peek-copy">
                <div className="janus-peek-title">{peekTitle}</div>
                <div className="janus-peek-subtitle">{peekSubtitle}</div>
              </div>
            </div>
            <div className="janus-peek-trailing">
              <div className="janus-peek-statusline">{statusText}</div>
              <div className="janus-peek-pulse" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>

        <div className="janus-expanded-shell">
          <div className="janus-expanded-topbar">
            <div className="janus-expanded-brand island-title">
              <span>*</span> JANUS
            </div>
            <div className="janus-expanded-view-switch" aria-label="Janus expanded view">
              {(['monitor', 'chat'] as JanusExpandedView[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className="janus-expanded-view-button"
                  data-active={view === item}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                >
                  {item === 'monitor' ? 'Monitor' : 'Chat'}
                </button>
              ))}
            </div>
            <div className="janus-expanded-meta">
              <span className="janus-expanded-meta-text">Esc / 双击收起</span>
              <span className="janus-expanded-mode-pill">{modeLabel}</span>
            </div>
          </div>

          <div className="janus-expanded-body">
            <div className="janus-feedback-panel">
              <div className="janus-monitor-grid">
                <div className="janus-monitor-left">
                  <div className="janus-monitor-panel janus-monitor-core-panel">
                    <div className="janus-monitor-section-title">
                      <span>Core visualization</span>
                      <em>{previewRun ? `${runRoleLabel(previewRun.role)} selected` : 'mission overview'}</em>
                    </div>
                    <div className="janus-monitor-crt">
                      <div className="warp-grid" />
                      <div className="scanline" />
                      <div className="pixel-overlay" />
                      {particles.map(({ id, left, size, duration }) => (
                        <div
                          key={id}
                          className="particle"
                          style={{ left: `${left}%`, width: size, height: size, animation: `float-up ${duration}s ease-in forwards` }}
                        />
                      ))}
                      <div className="levitation-wrapper">
                        <JanusIdentityCore
                          identity={previewIdentity}
                          state={previewState}
                          size="lg"
                          className="janus-monitor-identity"
                          aria-label={`${monitorTitle} monitor identity`}
                        />
                      </div>
                      <div className="janus-status-text">{monitorTitle}</div>
                    </div>
                  </div>

                  <div className="janus-monitor-stats">
                    <div className="janus-monitor-stat">
                      <span>IDENTITY</span>
                      <strong style={{ color: previewRun ? previewIdentitySpec.color : undefined }}>
                        {previewRun ? runRoleLabel(previewRun.role) : 'MAIN'}
                      </strong>
                    </div>
                    <div className="janus-monitor-stat">
                      <span>WORKSPACE</span>
                      <strong>{workspaceLabel}</strong>
                    </div>
                    <div className="janus-monitor-stat">
                      <span>STATUS</span>
                      <strong>
                        {previewRun
                          ? SUBAGENT_STATUS_LABELS[previewRun.status].toUpperCase()
                          : activeTerminal
                            ? terminalStatusLabel(activeTerminal.status).toUpperCase()
                            : modeLabel}
                      </strong>
                    </div>
                    <div className="janus-monitor-stat">
                      <span>ENGINE</span>
                      <strong style={{ color: previewRun ? previewIdentitySpec.color : activeTerminal ? modeColor : undefined }}>
                        {previewRun
                          ? runEngineLabel(previewRun).toUpperCase()
                          : activeTerminal
                            ? terminalProviderLabel(activeTerminal.preset).toUpperCase()
                            : monitorStatusText}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="janus-monitor-right">
                  <div className="janus-monitor-panel janus-runtime-panel">
                    <div className="janus-monitor-section-title">
                      <span>Subagent runtimes</span>
                      <em>{activeTerminal ? 'focused terminal' : 'no terminal focus'}</em>
                    </div>
                    <div className="janus-runtime-list" aria-label="Subagent runtime framework">
                      {visibleSubAgentRuns.length === 0 ? (
                        <div className="janus-runtime-placeholder">
                          <div className="janus-runtime-core">
                            <span className="janus-runtime-eye" />
                            <span className="janus-runtime-eye" />
                          </div>
                          <div className="janus-runtime-meta">
                            <strong>No SubAgent runs</strong>
                            <span>Focused terminal SubAgent runs will appear here</span>
                          </div>
                        </div>
                      ) : (
                        visibleSubAgentRuns.map((run) => (
                          <button
                            key={run.id}
                            type="button"
                            className="janus-runtime-run"
                            data-status={run.status}
                            data-selected={previewRun?.id === run.id}
                            aria-pressed={previewRun?.id === run.id}
                            style={runtimeRoleStyle(run.role)}
                            onClick={() => setSelectedRunId(run.id)}
                          >
                            <JanusIdentityCore
                              identity={roleIdentity(run.role)}
                              state={previewIdentityState(run)}
                              size="pod"
                              aria-label={`${run.title} ${run.status}`}
                            />
                            <div className="janus-runtime-run-main">
                              <div className="janus-runtime-run-title">
                                <strong>{run.title}</strong>
                                <span>{runEngineLabel(run)}</span>
                              </div>
                              <div className="janus-runtime-run-event">{run.lastEvent ?? 'Waiting for runtime event'}</div>
                            </div>
                            <div className="janus-runtime-run-side">
                              <span className="janus-runtime-run-status">{SUBAGENT_STATUS_LABELS[run.status]}</span>
                              <span>{formatRunAge(run.updatedAt)}</span>
                              {run.terminalId ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    focusRunTerminal(run)
                                  }}
                                >
                                  Focus
                                </button>
                              ) : null}
                            </div>
                          </button>
                        ))
                      )}

                    </div>
                  </div>
                </div>
              </div>
            </div>

            <JanusChat
              visible
              docked
              modeColor={modeColor}
              messages={messages}
              pendingContent={pendingContent}
              isStreaming={isStreaming}
              error={error}
              modelOptions={modelOptions}
              activeModel={activeModel}
              modelNotice={modelNotice}
              onCycleModel={onChatCycleModel}
              onSelectModel={onChatSelectModel}
              onSend={onChatSend}
              onStop={onChatStop}
              onRetry={onChatRetry}
              onClear={onChatClear}
              onOpenLlmConfig={onOpenLlmConfig}
            />
          </div>

          <div className="janus-expanded-bottombar">
            <div className="janus-expanded-caption">
              <span>Janus</span>
              <span className="janus-expanded-caption-divider" />
              <span>{statusText}</span>
            </div>
            <div className="janus-expanded-actions">
              <button type="button" className="janus-expanded-action-button" onClick={handleOpenBlueprintWorkbench}>
                Open Blueprint
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
