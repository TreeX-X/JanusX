import { useState, useCallback, useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore } from '@/stores/app'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { useJanusState } from './useJanusState'
import { projectService, type ProjectConfig } from '@/services/project'
import type { Terminal, Workspace } from '@/types'
import { JanusChat } from './JanusChat'
import type { ChatModelOption, JanusResourceController, Message } from './useJanusChat'
import type { ChatToolTraceEntry } from '../../../../shared/ipc/llm'
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
import type { OfficeFileEntry } from '../../../../shared/office'
import { formatKnowledgeMatch } from './islandKnowledgePeek'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useI18n } from '@/i18n/useI18n'

/* ════════════════════════════════════════════════════════════
   JanusIsland �?52×26px 折叠态胶�?
   状态由 useJanusState 统一管理，视觉由 data-mode 属性驱�?
   ════════════════════════════════════════════════════════════ */

/** useProjectRunning �?管理项目运行状�?*/
function useProjectRunning(activeWorkspace: Workspace | undefined) {
  const janusRunning = useAppStore((s) => s.janusRunning)
  const setJanusRunning = useAppStore((s) => s.setJanusRunning)
  const setRunningProjects = useAppStore((s) => s.setRunningProjects)
  const [workspaceConfig, setWorkspaceConfig] = useState<ProjectConfig | null>(null)
  const configRef = useRef<ProjectConfig | null>(null)
  // P6: 轮询结果无变化时跳过 setState，避免每 3s 的新引用触发无意义重渲染
  const configKeyRef = useRef<string>('')
  const runningKeyRef = useRef<string>('')

  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      setRunningProjects([])
      setJanusRunning(false)
      configRef.current = null
      configKeyRef.current = ''
      runningKeyRef.current = ''
      return
    }

    const loadData = async () => {
      try {
        const config = await projectService.readConfig(activeWorkspace.path)
        configRef.current = config
        const configKey = JSON.stringify(config)
        if (configKeyRef.current !== configKey) {
          configKeyRef.current = configKey
          setWorkspaceConfig(config)
        }
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        const runningKey = JSON.stringify(running)
        if (runningKeyRef.current !== runningKey) {
          runningKeyRef.current = runningKey
          setRunningProjects(running)
          setJanusRunning(running.length > 0)
        }
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
  messages: Message[]
  pendingContent: string
  isStreaming: boolean
  error: string | null
  modelOptions: ChatModelOption[]
  activeModel: ChatModelOption | null
  modelNotice: string | null
  onChatSelectModel: (providerId: string, modelId: string) => void
  onChatSend: (text: string) => void
  onChatRewrite: (messageId: string, text: string) => void
  onChatStop: () => void
  onChatRetry: () => void
  onChatClear: () => void
  onOpenLlmConfig: () => void
  onAddChatToWorkspace?: () => void
  resourceController: JanusResourceController
  toolTraces?: ChatToolTraceEntry[]
  knowledgeTrace?: KnowledgeRecallTrace | null
  knowledgePeekActive?: boolean
  knowledgePeekEmpty?: boolean
  officeNotice?: OfficeFileEntry | null
  officeArtifacts?: OfficeFileEntry[]
  onOpenOfficeArtifact?: (relPath: string) => void
}

type JanusExpandedView = 'monitor' | 'chat'

const SUBAGENT_STATUS_KEY: Record<SubAgentRunStatus, string> = {
  queued: 'janus:subagent.status.queued',
  running: 'janus:subagent.status.running',
  'waiting-approval': 'janus:subagent.status.waitingApproval',
  done: 'janus:subagent.status.done',
  failed: 'janus:subagent.status.failed',
  cancelled: 'janus:subagent.status.cancelled',
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string

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

function formatRunAge(value: string, t: TFunc): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return t('janus:island.age.unknown')
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 5) return t('janus:island.age.now')
  if (seconds < 60) return t('janus:island.age.seconds', { n: seconds })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('janus:island.age.minutes', { n: minutes })
  return t('janus:island.age.hours', { n: Math.floor(minutes / 60) })
}

function terminalProviderLabel(preset: Terminal['preset'], t: TFunc): string {
  switch (preset) {
    case 'claude':
      return t('janus:terminal.provider.claude')
    case 'codex':
      return t('janus:terminal.provider.codex')
    case 'opencode':
      return t('janus:terminal.provider.opencode')
    case 'shell':
      return t('janus:terminal.provider.shell')
  }
}

function terminalStatusLabel(status: Terminal['status'], t: TFunc): string {
  switch (status) {
    case 'running':
      return t('janus:terminal.status.running')
    case 'error':
      return t('janus:terminal.status.error')
    case 'wait':
      return t('janus:terminal.status.wait')
  }
}

function runEngineLabel(run: SubAgentRun, t: TFunc): string {
  return run.engine ? terminalProviderLabel(run.engine, t) : run.source
}
function runRoleLabel(role: SubAgentRunRole, t: TFunc): string {
  const id = roleIdentity(role)
  const keyMap: Record<JanusAgentIdentityId, string> = {
    main: 'janus:identity.roleTag.main',
    coder: 'janus:identity.roleTag.coder',
    evaluator: 'janus:identity.roleTag.evaluator',
    abstracter: 'janus:identity.roleTag.abstracter',
    prompter: 'janus:identity.roleTag.prompter',
    teammate: 'janus:identity.roleTag.teammate',
    subagent: 'janus:identity.roleTag.subagent',
  }
  return t(keyMap[id])
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
  messages,
  pendingContent,
  isStreaming,
  error,
  modelOptions,
  activeModel,
  modelNotice,
  onChatSelectModel,
  onChatSend,
  onChatRewrite,
  onChatStop,
  onChatRetry,
  onChatClear,
  onOpenLlmConfig,
  onAddChatToWorkspace,
  resourceController,
  toolTraces = [],
  knowledgeTrace = null,
  knowledgePeekActive = false,
  knowledgePeekEmpty = false,
  officeNotice = null,
  officeArtifacts = [],
  onOpenOfficeArtifact,
}: JanusIslandProps) {
  const { t } = useI18n('janus')
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
  const focusedTabId = useWorkspaceStore((s) => s.focusedTabId)
  const terminals = useWorkspaceStore((s) => s.terminals)
  const maintenanceTasks = useBlueprintMaintenanceStore((state) => state.tasks)
  const requestMaintenanceOpen = useBlueprintMaintenanceStore((state) => state.requestOpen)
  const cancelMaintenance = useBlueprintMaintenanceStore((state) => state.cancel)
  const loadBlueprint = useBlueprintStore((state) => state.loadBlueprint)

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
  const maintenanceTask = useMemo(() => {
    const live = maintenanceTasks.filter((task) => !['completed', 'cancelled'].includes(task.status))
    return live.find((task) => task.status === 'failed' || task.status === 'stale')
      ?? live.find((task) => task.status === 'proposal-ready')
      ?? live.find((task) => task.status === 'analyzing' || task.status === 'applying')
      ?? live[0]
      ?? null
  }, [maintenanceTasks])

  const handleOpenMaintenance = useCallback(() => {
    if (!maintenanceTask) return
    void loadBlueprint(maintenanceTask.blueprintId)
    requestMaintenanceOpen({ blueprintId: maintenanceTask.blueprintId, nodeId: maintenanceTask.nodeScope.type === 'blueprint' ? undefined : maintenanceTask.nodeScope.nodeId })
    setActiveWorkbench('blueprint')
  }, [loadBlueprint, maintenanceTask, requestMaintenanceOpen, setActiveWorkbench])

  const maintenanceNeedsAttention = maintenanceTask?.status === 'failed' || maintenanceTask?.status === 'stale' || maintenanceTask?.status === 'proposal-ready'
  const peekTitle = useMemo(() => {
    if (maintenanceNeedsAttention) return maintenanceTask?.status === 'proposal-ready' ? t('janus:island.peek.title.proposalReady') : t('janus:island.peek.title.needsAttention')
    if (officeNotice) return t('janus:island.peek.title.officeReady')
    if (knowledgePeekEmpty) return t('janus:island.peek.title.knowledge')
    if (knowledgePeekActive && knowledgeTrace) return t('janus:island.peek.title.knowledgeRecalled')
    if (maintenanceTask) return t('janus:island.peek.title.maintenance')
    return ''
  }, [knowledgePeekActive, knowledgePeekEmpty, knowledgeTrace, maintenanceNeedsAttention, maintenanceTask, officeNotice, t])

  const peekSubtitle = useMemo(() => {
    if (maintenanceNeedsAttention && maintenanceTask) return `${maintenanceTask.blueprintName} | ${maintenanceTask.phase}`
    if (officeNotice) return `${officeNotice.relPath} | ${officeNotice.ext.slice(1)}`
    if (knowledgePeekEmpty) return t('janus:island.peek.subtitle.noKnowledgeMatch')
    if (knowledgePeekActive && knowledgeTrace?.topHit) {
      const count = t('janus:island.peek.subtitle.knowledgeCount', {
        count: knowledgeTrace.recalledCount,
        match: formatKnowledgeMatch(knowledgeTrace.topHit.score, t),
        kind: knowledgeTrace.topHit.kind,
        title: knowledgeTrace.topHit.title,
      })
      return count
    }
    if (maintenanceTask) return `${maintenanceTask.blueprintName} | ${maintenanceTask.progress}% | ${maintenanceTask.phase}`
    return ''
  }, [knowledgePeekActive, knowledgePeekEmpty, knowledgeTrace, maintenanceNeedsAttention, maintenanceTask, officeNotice, t])

  const modeLabel = activeNode ? t('janus:island.modeLabel.blueprint') : mode === 'analytics' ? t('janus:island.modeLabel.analytics') : mode === 'running' ? t('janus:island.modeLabel.running') : t('janus:island.modeLabel.order')
  const statusText = maintenanceNeedsAttention && maintenanceTask
    ? maintenanceTask.status === 'proposal-ready' ? t('janus:island.status.blueprintApproval') : t('janus:island.status.blueprintAttention')
    : officeNotice
    ? t('janus:island.status.officeOpenPreview')
    : knowledgePeekEmpty
    ? t('janus:island.status.knowledgeNoMatch')
    : knowledgePeekActive && knowledgeTrace
    ? t('janus:island.status.knowledge' + (knowledgeTrace.truncated ? 'Truncated' : 'Ready'))
    : maintenanceTask
    ? t('janus:island.status.blueprintStatus', { status: maintenanceTask.status.toUpperCase() })
    : activeNode
    ? t('janus:island.status.blueprintFocused')
    : janusRunning
    ? t('janus:island.status.runningActive')
    : mode === 'analytics'
      ? t('janus:island.status.analyticsProcessing')
      : t('janus:island.status.orderIdle')
  const modeColor = activeVisual?.color ?? (mode === 'running' ? '#00ff88' : '#ff7830')
  const activeNodeTitle = activeNode?.title || t('janus:island.activeNodeFallback')
  const workspaceLabel = activeSession?.workspaceName ?? activeWorkspace?.name ?? t('janus:island.workspaceFallback')
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
    ? `${runEngineLabel(previewRun, t)} // ${t(SUBAGENT_STATUS_KEY[previewRun.status])}`
    : activeTerminal
      ? `${terminalProviderLabel(activeTerminal.preset, t)} // ${terminalStatusLabel(activeTerminal.status, t)}`
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
      const targetElement = target instanceof Element ? target : target?.parentElement
      const shell = shellRef.current
      if (!shell || !target || shell.contains(target) || targetElement?.closest('[data-select-dropdown]')) return
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
    document.body.classList.toggle('is-running', janusRunning)
    return () => { document.body.classList.remove('is-running') }
  }, [janusRunning])

  return (
    <div
      ref={shellRef}
      className={`janus-island-shell ${faceClass(mode)}`}
      data-stage={stage}
      data-view={view}
      data-mode={mode}
      data-peek-kind={officeNotice ? 'office' : 'knowledge'}
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
        aria-label={stage === 'peek' ? officeNotice ? t('janus:island.aria.openOfficePreview', { path: officeNotice.relPath }) : t('janus:island.aria.closeKnowledgePeek') : stage === 'collapsed' ? t('janus:island.aria.openIsland') : undefined}
        onKeyDown={stage !== 'expanded' ? handleIslandKeyDown : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="janus-collapsed-core">
          <div ref={(el) => { eyeContainerRef.current = el }} className="janus-face-mini">
            <JanusEye mode={mode} leftRef={eyeLeftRef} rightRef={eyeRightRef} />
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
              <span>*</span> {t('janus:island.expanded.brand')}
            </div>
            <div className="janus-expanded-view-switch" aria-label={t('janus:island.expanded.viewSwitchAria')}>
              {(['monitor', 'chat'] as JanusExpandedView[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className="janus-expanded-view-button"
                  data-view={item}
                  data-active={view === item}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                >
                  {item === 'monitor' ? t('janus:island.expanded.view.monitor') : t('janus:island.expanded.view.chat')}
                </button>
              ))}
            </div>
            <div className="janus-expanded-meta">
              <span className="janus-expanded-meta-text">{t('janus:island.expanded.dismissHint')}</span>
            </div>
          </div>

          <div className="janus-expanded-body">
            <div className="janus-feedback-panel">
              <div className="janus-monitor-grid">
                <div className="janus-monitor-left">
                  <div className="janus-monitor-panel janus-monitor-core-panel">
                    <div className="janus-monitor-section-title">
                      <span>{t('janus:island.expanded.coreVisualization')}</span>
                      <em>{previewRun ? t('janus:island.expanded.roleSelected', { role: runRoleLabel(previewRun.role, t) }) : t('janus:island.expanded.missionOverview')}</em>
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
                      <span>{t('janus:island.expanded.identityLabel')}</span>
                      <strong style={{ color: previewRun ? previewIdentitySpec.color : undefined }}>
                        {previewRun ? runRoleLabel(previewRun.role, t) : t('janus:island.expanded.mainIdentity')}
                      </strong>
                    </div>
                    <div className="janus-monitor-stat">
                      <span>{t('janus:island.expanded.workspaceLabel')}</span>
                      <strong>{workspaceLabel}</strong>
                    </div>
                    <div className="janus-monitor-stat">
                      <span>{t('janus:island.expanded.statusLabel')}</span>
                      <strong>
                        {previewRun
                          ? t(SUBAGENT_STATUS_KEY[previewRun.status]).toUpperCase()
                          : activeTerminal
                            ? terminalStatusLabel(activeTerminal.status, t).toUpperCase()
                            : modeLabel}
                      </strong>
                    </div>
                    <div className="janus-monitor-stat">
                      <span>{t('janus:island.expanded.engineLabel')}</span>
                      <strong style={{ color: previewRun ? previewIdentitySpec.color : activeTerminal ? modeColor : undefined }}>
                        {previewRun
                          ? runEngineLabel(previewRun, t).toUpperCase()
                          : activeTerminal
                            ? terminalProviderLabel(activeTerminal.preset, t).toUpperCase()
                            : monitorStatusText}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="janus-monitor-right">
                  {officeArtifacts.length > 0 && (
                    <div className="janus-monitor-panel janus-office-artifacts">
                      <div className="janus-monitor-section-title">
                        <span>{t('janus:island.expanded.officeArtifacts')}</span>
                        <em>{t('janus:island.expanded.officeAvailable', { count: officeArtifacts.length })}</em>
                      </div>
                      <div className="janus-office-artifact-list">
                        {officeArtifacts.map((entry) => (
                          <button key={entry.relPath} type="button" onClick={() => onOpenOfficeArtifact?.(entry.relPath)}>
                            <span>{entry.relPath}</span>
                            <em>{entry.ext.slice(1)}</em>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="janus-monitor-panel janus-runtime-panel">
                    <div className="janus-monitor-section-title">
                      <span>{t('janus:island.expanded.subagentRuntimes')}</span>
                      <em>{activeTerminal ? t('janus:island.expanded.focusedTerminal') : t('janus:island.expanded.noTerminalFocus')}</em>
                    </div>
                    <div className="janus-runtime-list" aria-label={t('janus:island.expanded.runtimeAria')}>
                      {visibleSubAgentRuns.length === 0 ? (
                        <div className="janus-runtime-placeholder">
                          <div className="janus-runtime-core">
                            <span className="janus-runtime-eye" />
                            <span className="janus-runtime-eye" />
                          </div>
                          <div className="janus-runtime-meta">
                            <strong>{t('janus:island.expanded.noRuns')}</strong>
                            <span>{t('janus:island.expanded.noRunsHint')}</span>
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
                                <span>{runEngineLabel(run, t)}</span>
                              </div>
                              <div className="janus-runtime-run-event">{run.lastEvent ?? t('janus:island.expanded.waitingForEvent')}</div>
                            </div>
                            <div className="janus-runtime-run-side">
                              <span className="janus-runtime-run-status">{t(SUBAGENT_STATUS_KEY[run.status])}</span>
                              <span>{formatRunAge(run.updatedAt, t)}</span>
                              {run.terminalId ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    focusRunTerminal(run)
                                  }}
                                >
                                  {t('janus:island.expanded.focus')}
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
              // Only the active Island Chat view may own global chat shortcuts.
              // Keeping the hidden Monitor/collapsed instance mounted would let
              // it intercept Tab/Ctrl+P and open a menu outside the viewport.
              visible={stage === 'expanded' && view === 'chat'}
              docked
              // A focused workspace Chat pane outranks the Island instance, so
              // both never claim the same global shortcut press.
              focused={!focusedTabId?.startsWith('janus-chat')}
              modeColor={modeColor}
              messages={messages}
              pendingContent={pendingContent}
              isStreaming={isStreaming}
              error={error}
              modelOptions={modelOptions}
              activeModel={activeModel}
              modelNotice={modelNotice}
              onSelectModel={onChatSelectModel}
              onSend={onChatSend}
              onRewrite={onChatRewrite}
              onStop={onChatStop}
              onRetry={onChatRetry}
              onClear={onChatClear}
              onOpenLlmConfig={onOpenLlmConfig}
              resourceController={resourceController}
              toolTraces={toolTraces}
              onAddToWorkspace={onAddChatToWorkspace}
            />
          </div>

          <div className="janus-expanded-bottombar">
            <div className="janus-expanded-caption">
              <span>{t('janus:island.expanded.captionJanus')}</span>
              <span className="janus-expanded-caption-divider" />
              <span>{statusText}</span>
            </div>
            <div className="janus-expanded-actions">
              {maintenanceTask ? (
                <>
                  <button type="button" className="janus-expanded-action-button" onClick={handleOpenMaintenance}>
                    {t('janus:island.expanded.openMaintenance')}
                  </button>
                  {(maintenanceTask.status === 'analyzing' || maintenanceTask.status === 'draft') ? (
                    <button type="button" className="janus-expanded-action-button" onClick={() => void cancelMaintenance(maintenanceTask.id)}>
                      {t('janus:island.expanded.cancelAnalysis')}
                    </button>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="janus-expanded-action-button" onClick={handleOpenBlueprintWorkbench}>
                {t('janus:island.expanded.openBlueprint')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
