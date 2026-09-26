import { useState, useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Download } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useI18n } from '@/i18n/useI18n'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { useJanusState } from './useJanusState'
import { STATUS_VISUALS } from '../blueprint/blueprintStatus'
import { formatKnowledgeMatch } from './islandKnowledgePeek'
import {
  assembleNotifications,
  capsuleTier,
  EMPTY_CAPSULE_NOTIFICATION_ID,
  isEmptyCapsuleRequested,
  knowledgeNotification,
  maintenanceNotification,
  mayAutoBanner,
  memoryNotification,
  notificationKickerKey,
  productNotification,
  topNotification,
  type IslandNotificationActionId,
} from './islandNotifications'
import { JanusIslandExpandedShell } from './JanusIslandExpandedShell'
import {
  JanusAuxiliaryIsland,
  type JanusAuxiliaryModuleDescriptor,
  type JanusAuxiliaryModuleType,
} from './JanusAuxiliaryIsland'
import { JanusRoundtableParchment } from './JanusRoundtableParchment'
import { JanusRoundtableQuestions } from './JanusRoundtableQuestions'
import { buildRoundtableFilename, copyTextToClipboard, fetchRoundtableMarkdown, saveMarkdownViaDialog, withDraftWatermark } from './roundtableExport'
import type { AgentWorkState } from '../../../../shared/roundtable/events'

/** i18n keys for the six card states shown in the agent-result eyebrow. */
const ROUNDTABLE_CARD_STATUS_KEYS: Record<AgentWorkState, string> = {
  queued: 'janus:roundtable.cardDetail.status.queued',
  working: 'janus:roundtable.cardDetail.status.working',
  completed: 'janus:roundtable.cardDetail.status.completed',
  failed: 'janus:roundtable.cardDetail.status.failed',
  'awaiting-input': 'janus:roundtable.cardDetail.status.awaitingInput',
  cancelled: 'janus:roundtable.cardDetail.status.cancelled',
}
import { faceClass } from './janusIslandRuntime'
import { nudgeRunOrb } from '@/stores/running'
import { useRightToolStore } from '@/stores/right-tools'
import { useExperimentalStore } from '@/stores/experimental'
import { getUserMemoryOverview } from '@/services/knowledge'
import type { JanusExpandedView, JanusIslandProps } from './janusIslandTypes'
import type { RoundtableState } from '../../../../shared/roundtable/events'
import type { RoundtableToolCall } from './agentWorkProjection'
import { projectParchment } from '../../../../shared/roundtable/parchment'
import { useProjectRunning } from './useProjectRunning'

/* ════════════════════════════════════════════════════════════
   JanusIsland �?52×26px 折叠态胶�?
   状态由 useJanusState 统一管理，视觉由 data-mode 属性驱�?
   ════════════════════════════════════════════════════════════ */

/** useProjectRunning �?管理项目运行状�?*/


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
  conversationController = null,
  resourceController,
  toolTraces = [],
  knowledgeTrace = null,
  knowledgePeekActive = false,
  knowledgePeekEmpty = false,
  productNotice = null,
  productFiles = [],
  onOpenProductFile,
}: JanusIslandProps) {
  const { t } = useI18n('janus')
  const { mode, isSwitching, activeWorkspace, eyeContainerRef, hasRunning } = useJanusState()
  const { janusRunning, startActiveOnce } = useProjectRunning(activeWorkspace)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const conversationStartedRef = useRef(false)
  const [view, setView] = useState<JanusExpandedView>('monitor')
  const [parchmentOpen, setParchmentOpen] = useState(false)
  const [auxiliaryModule, setAuxiliaryModule] = useState<JanusAuxiliaryModuleType | null>(null)
  const [activeAgentCard, setActiveAgentCard] = useState<import('../../../../shared/roundtable/events').AgentResultCard | null>(null)
  const [roundtableState, setRoundtableState] = useState<RoundtableState | null>(null)
  const [roundtableToolCalls, setRoundtableToolCalls] = useState<RoundtableToolCall[]>([])
  const [auxiliaryClosing, setAuxiliaryClosing] = useState(false)
  // Parchment detail export (mid-meeting DRAFT or ended FINAL). Read-only
  // snapshot: never advances the round or ends the meeting.
  const [parchmentExportBusy, setParchmentExportBusy] = useState(false)
  const [parchmentExportNotice, setParchmentExportNotice] = useState<string | null>(null)

  const handleParchmentExport = useCallback(async () => {
    const state = roundtableState
    if (!state?.sessionId || state.phase === 'idle' || state.phase === 'running' || parchmentExportBusy) return
    setParchmentExportBusy(true)
    setParchmentExportNotice(null)
    try {
      const raw = await fetchRoundtableMarkdown(state.sessionId)
      const markdown = state.phase === 'ended' ? raw : withDraftWatermark(raw, state.roundNumber)
      const outcome = await saveMarkdownViaDialog(buildRoundtableFilename(state), markdown)
      setParchmentExportNotice(outcome === 'saved' ? 'saved' : 'canceled')
    } catch {
      setParchmentExportNotice('error')
    } finally {
      setParchmentExportBusy(false)
    }
  }, [roundtableState, parchmentExportBusy])

  const handleParchmentCopy = useCallback(async () => {
    const state = roundtableState
    if (!state?.sessionId || parchmentExportBusy) return
    setParchmentExportBusy(true)
    setParchmentExportNotice(null)
    try {
      const raw = await fetchRoundtableMarkdown(state.sessionId)
      await copyTextToClipboard(state.phase === 'ended' ? raw : withDraftWatermark(raw, state.roundNumber))
      setParchmentExportNotice('copied')
    } catch {
      setParchmentExportNotice('error')
    } finally {
      setParchmentExportBusy(false)
    }
  }, [roundtableState, parchmentExportBusy])

  // Ending a meeting clears the dialog (pane reports null): drop the detail
  // island and its card/parchment state so no stale session stays visible.
  useEffect(() => {
    if (roundtableState) return
    setActiveAgentCard(null)
    setAuxiliaryModule((module) => (module === 'agent-result' || module === 'roundtable-parchment' || module === 'roundtable-questions' ? null : module))
    setParchmentOpen(false)
  }, [roundtableState])
  const maintenanceTasks = useBlueprintMaintenanceStore((state) => state.tasks)
  const requestMaintenanceOpen = useBlueprintMaintenanceStore((state) => state.requestOpen)
  const cancelMaintenance = useBlueprintMaintenanceStore((state) => state.cancel)
  const loadBlueprint = useBlueprintStore((state) => state.loadBlueprint)

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)
  const roundtableEnabled = useExperimentalStore((s) => s.roundtable)
  const personaEnabled = useExperimentalStore((s) => s.persona)
  const loadExperimental = useExperimentalStore((s) => s.load)

  useEffect(() => {
    void loadExperimental()
  }, [loadExperimental])

  // 创新开关关闭圆桌时，若正停在圆桌视图则退回聊天，避免悬空态。
  useEffect(() => {
    if (!roundtableEnabled) setView((current) => (current === 'roundtable' ? 'chat' : current))
  }, [roundtableEnabled])

  // User memory M4: quiet badge for habit candidates awaiting review. Mount
  // plus recall-turn refresh; failures stay silent (no badge, no banner).
  const knowledgeTraceRequestId = knowledgeTrace?.requestId
  const [memoryPending, setMemoryPending] = useState(0)
  useEffect(() => {
    if (!personaEnabled) {
      setMemoryPending(0)
      return
    }
    let alive = true
    void getUserMemoryOverview().then((overview) => {
      if (alive) setMemoryPending(overview?.pendingHabitCount ?? 0)
    }).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [knowledgeTraceRequestId, personaEnabled])

  /** 长按仅启动（幂等）：已运行只脉冲对应运行球，永不停止 */
  const flashHint = useCallback((text: string) => {
    const hint = shellRef.current?.querySelector('.pull-hint') as HTMLElement | null
    if (!hint) return
    hint.textContent = text
    hint.style.opacity = '1'
    hint.style.transform = 'translateX(-50%)'
    window.setTimeout(() => {
      hint.style.opacity = '0'
    }, 1600)
  }, [])

  const handleLongPress = useCallback(async () => {
    const outcome = await startActiveOnce()
    const workspaceId = activeWorkspace?.id
    if (!workspaceId) return
    if (outcome === 'already-running') {
      nudgeRunOrb(workspaceId)
      flashHint(t('janus:island.runOrb.alreadyRunning'))
    } else if (outcome === 'no-config' || outcome === 'no-workspace') {
      flashHint(t('janus:island.runOrb.noConfig'))
    }
  }, [startActiveOnce, activeWorkspace?.id, flashHint, t])

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

  /** Executes a notification action then gets the island out of the way; the
   * product path owns its own dismiss/consume flow in Titlebar. */
  const runNotificationAction = useCallback((notificationId: string, actionId: IslandNotificationActionId) => {
    if (actionId === 'open-knowledge') {
      if (useExperimentalStore.getState().knowledge) setActiveWorkbench('knowledge')
      onDismiss()
    } else if (actionId === 'open-memory') {
      if (useExperimentalStore.getState().persona) useRightToolStore.getState().openTool('persona')
      onDismiss()
    } else if (actionId === 'open-blueprint') {
      handleOpenBlueprintWorkbench()
      onDismiss()
    } else if (actionId === 'open-maintenance') {
      handleOpenMaintenance()
      onDismiss()
    } else if (actionId === 'open-product' && productNotice) {
      onOpenProductFile?.(productNotice.relPath)
    }
    setClearedIds((ids) => (ids.includes(notificationId) ? ids : [...ids, notificationId]))
    setBannerId(null)
  }, [handleOpenBlueprintWorkbench, handleOpenMaintenance, onDismiss, onOpenProductFile, productNotice, setActiveWorkbench])

  // Minimal stage-B tool trace for the agent-result detail: the pane owns the
  // full work projection, the Island only mirrors tool calls so the detail can
  // show reads/failures next to evidence without re-plumbing props.
  useEffect(() => window.electron.roundtable?.onEvent((event) => {
    if (event.type === 'workspace:tool-started') {
      setRoundtableToolCalls((items) => items.some((item) => item.toolCallId === event.toolCallId)
        ? items
        : [...items.slice(-19), { toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'started' as const }])
    } else if (event.type === 'workspace:tool-completed') {
      setRoundtableToolCalls((items) => {
        const record: RoundtableToolCall = { toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'completed' }
        const index = items.findIndex((item) => item.toolCallId === event.toolCallId)
        if (index < 0) return [...items.slice(-19), record]
        const next = [...items]; next[index] = record; return next
      })
    } else if (event.type === 'workspace:tool-failed') {
      setRoundtableToolCalls((items) => {
        const record: RoundtableToolCall = { toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'failed', errorCode: event.errorCode, error: event.error }
        const index = items.findIndex((item) => item.toolCallId === event.toolCallId)
        if (index < 0) return [...items.slice(-19), record]
        const next = [...items]; next[index] = record; return next
      })
    } else if (event.type === 'workspace:tool-cancelled') {
      setRoundtableToolCalls((items) => {
        const record: RoundtableToolCall = { toolCallId: event.toolCallId, toolName: event.toolName, workspaceId: event.workspaceId, agentId: event.agentId, roundId: event.roundId, status: 'cancelled' }
        const index = items.findIndex((item) => item.toolCallId === event.toolCallId)
        if (index < 0) return [...items.slice(-19), record]
        const next = [...items]; next[index] = record; return next
      })
    }
  }) ?? (() => undefined), [])

  const maintenanceNeedsAttention = maintenanceTask?.status === 'failed' || maintenanceTask?.status === 'stale' || maintenanceTask?.status === 'proposal-ready'

  // Notification projection (Note: 2026-09-13-island-notification-capsule.md):
  // peek/expanded surfaces render from IslandNotification only; the former
  // per-kind title/subtitle/status chains live in islandNotifications.ts.
  const notifications = useMemo(() => assembleNotifications([
    productNotification(productNotice),
    knowledgeNotification({
      active: knowledgePeekActive,
      empty: knowledgePeekEmpty,
      trace: knowledgeTrace,
      matchLabel: knowledgeTrace?.topHit ? formatKnowledgeMatch(knowledgeTrace.topHit.score, t) : undefined,
    }),
    personaEnabled ? memoryNotification({ pendingHabitCount: memoryPending }) : null,
    maintenanceNotification(maintenanceTask, maintenanceNeedsAttention),
  ]), [knowledgePeekActive, knowledgePeekEmpty, knowledgeTrace, memoryPending, maintenanceNeedsAttention, maintenanceTask, productNotice, personaEnabled, t])
  const [clearedIds, setClearedIds] = useState<string[]>([])
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => !clearedIds.includes(notification.id)),
    [notifications, clearedIds],
  )
  const topNotificationItem = topNotification(visibleNotifications)
  // The knowledge surface (recall result or empty capsule) owns the peek
  // capsule while it presents; a sticky product notice yields to it and stays
  // reachable through the click intent instead (islandInteraction).
  const capsuleNotifications = useMemo(
    () => knowledgePeekActive
      ? visibleNotifications.filter((notification) => notification.kind !== 'product')
      : visibleNotifications,
    [knowledgePeekActive, visibleNotifications],
  )
  const capsuleTopNotification = topNotification(capsuleNotifications)
  const emptyCapsule = isEmptyCapsuleRequested(knowledgePeekEmpty, capsuleNotifications)
  const capsuleTierValue = capsuleTier(capsuleTopNotification, emptyCapsule)
  // Split compact (hifi DI pattern): when the knowledge surface is NOT
  // presenting and 2+ notifications are alive, the capsule splits into one
  // clickable cell per notification; the knowledge surface keeps capsule
  // ownership when it presents (product yields, tray keeps everything).
  const splitCapsule = !knowledgePeekActive && capsuleNotifications.length >= 2

  const modeStatusFallback = activeNode
    ? t('janus:island.status.blueprintFocused')
    : janusRunning
    ? t('janus:island.status.runningActive')
    : mode === 'analytics'
      ? t('janus:island.status.analyticsProcessing')
      : t('janus:island.status.orderIdle')
  const statusText = topNotificationItem?.copy.metaKey
    ? t(topNotificationItem.copy.metaKey, topNotificationItem.copy.metaValues)
    : modeStatusFallback

  // Expanded-stage notification surface state (tray / banner / badge pulse).
  const [trayOpen, setTrayOpen] = useState(false)
  const [bannerId, setBannerId] = useState<string | null>(null)
  const [notifyPulse, setNotifyPulse] = useState(false)
  const prevStageRef = useRef(stage)
  const prevNotifyCountRef = useRef(0)

  // T1 carry-over: expanding from peek pins the visible notification as banner.
  useEffect(() => {
    if (stage === 'expanded' && prevStageRef.current === 'peek' && topNotificationItem) setBannerId(topNotificationItem.id)
    prevStageRef.current = stage
  }, [stage, topNotificationItem])

  // T2 arrival: attention/failed raise the banner; info only pulses the badge.
  useEffect(() => {
    if (stage !== 'expanded' || !topNotificationItem) return
    if (mayAutoBanner(topNotificationItem.severity)) setBannerId(topNotificationItem.id)
  }, [stage, topNotificationItem])

  useEffect(() => {
    if (stage !== 'expanded') {
      setTrayOpen(false)
      prevNotifyCountRef.current = visibleNotifications.length
      return
    }
    if (visibleNotifications.length > prevNotifyCountRef.current) {
      setNotifyPulse(true)
      prevNotifyCountRef.current = visibleNotifications.length
      const timer = window.setTimeout(() => setNotifyPulse(false), 900)
      return () => window.clearTimeout(timer)
    }
    prevNotifyCountRef.current = visibleNotifications.length
  }, [stage, visibleNotifications])

  const bannerNotification = bannerId && topNotificationItem?.id === bannerId ? topNotificationItem : null
  const modeLabel = activeNode ? t('janus:island.modeLabel.blueprint') : mode === 'analytics' ? t('janus:island.modeLabel.analytics') : mode === 'running' ? t('janus:island.modeLabel.running') : t('janus:island.modeLabel.order')
  const modeColor = activeVisual?.color ?? (mode === 'running' ? '#00ff88' : '#ff7830')
  const activeNodeTitle = activeNode?.title || t('janus:island.activeNodeFallback')
  const workspaceLabel = activeSession?.workspaceName ?? activeWorkspace?.name ?? t('janus:island.workspaceFallback')
  const hasConversation = messages.length > 0 || !!pendingContent || isStreaming || !!error

  useEffect(() => {
    if (stage === 'peek') setView('monitor')
  }, [stage])

  useEffect(() => {
    if (stage === 'expanded' && view === 'roundtable') return
    setAuxiliaryModule(null)
    if (stage === 'collapsed') setParchmentOpen(false)
  }, [stage, view])

  const requestCloseAuxiliary = useCallback(() => {
    if (!auxiliaryModule || auxiliaryClosing) return
    setAuxiliaryClosing(true)
    window.setTimeout(() => {
      setAuxiliaryModule(null)
      setAuxiliaryClosing(false)
      setParchmentOpen(false)
    }, 260)
  }, [auxiliaryModule, auxiliaryClosing])

  useEffect(() => {
    if (!auxiliaryModule) return
    const handleAuxiliaryEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      requestCloseAuxiliary()
    }
    document.addEventListener('keydown', handleAuxiliaryEscape, true)
    return () => document.removeEventListener('keydown', handleAuxiliaryEscape, true)
  }, [auxiliaryModule, auxiliaryClosing, requestCloseAuxiliary])

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
      if (stage === 'expanded' && trayOpen) {
        setTrayOpen(false)
        return
      }
      onDismiss()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onDismiss, stage, trayOpen])

  const auxiliaryDescriptor: JanusAuxiliaryModuleDescriptor | null = auxiliaryModule === 'roundtable-parchment'
    ? {
        id: 'janus-roundtable-parchment-detail',
        type: 'roundtable-parchment',
        title: t('janus:roundtable.auxiliary.parchmentTitle'),
        ariaLabel: t('janus:roundtable.auxiliary.parchmentAria'),
      }
    : auxiliaryModule === 'agent-result' ? { id: 'janus-agent-result-detail', type: 'agent-result', title: t('janus:roundtable.auxiliary.agentResultTitle'), ariaLabel: t('janus:roundtable.auxiliary.agentResultAria') }
    : auxiliaryModule === 'roundtable-questions' ? { id: 'janus-roundtable-questions-detail', type: 'roundtable-questions', title: t('janus:roundtable.auxiliary.questionsTitle'), ariaLabel: t('janus:roundtable.auxiliary.questionsAria') } : null

  // §37.10: question pool projection shared by the questions detail island.
  const roundtableOpenQuestions = (roundtableState?.facts ?? [])
    .filter((fact) => fact.kind === 'question' && fact.status !== 'resolved' && fact.status !== 'rejected')
    .map((fact) => ({ id: fact.id, text: fact.content, updatedAt: fact.updatedAt }))
  const roundtableAnsweredQuestions = (roundtableState?.facts ?? [])
    .filter((fact) => fact.kind === 'question' && fact.status === 'resolved')
    .slice(-10)
    .map((fact) => ({ id: fact.id, text: fact.content, updatedAt: fact.updatedAt }))

  useEffect(() => {
    document.body.classList.toggle('is-running', janusRunning)
    document.body.classList.toggle('has-running', hasRunning)
    return () => {
      document.body.classList.remove('is-running')
      document.body.classList.remove('has-running')
    }
  }, [janusRunning, hasRunning])

  return (
    <div
      ref={shellRef}
      className={`janus-island-shell ${faceClass(mode)}`}
      data-stage={stage}
      data-view={view}
      data-mode={mode}
      data-auxiliary-open={auxiliaryDescriptor ? 'true' : 'false'}
      data-auxiliary-module={auxiliaryDescriptor?.type ?? 'none'}
      data-peek-kind={splitCapsule ? 'split' : capsuleTopNotification?.kind ?? 'empty'}
      data-peek-layout={splitCapsule ? 'split' : 'single'}
      data-capsule-tier={capsuleTierValue}
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
        role={stage !== 'expanded' && !splitCapsule ? 'button' : undefined}
        tabIndex={stage !== 'expanded' && !splitCapsule ? 0 : undefined}
        aria-label={stage !== 'expanded' && !splitCapsule
          ? capsuleTopNotification?.kind === 'product' && productNotice
            ? t('janus:island.aria.openProductPreview', { path: productNotice.relPath })
            : stage === 'peek' ? t('janus:island.aria.closeKnowledgePeek') : t('janus:island.aria.openIsland')
          : undefined}
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
          <div className="janus-peek-core">
            {emptyCapsule ? (
              <div className="janus-capsule" key={EMPTY_CAPSULE_NOTIFICATION_ID}>
                <div className="janus-capsule-row">
                  <span className="janus-capsule-led sev-info" aria-hidden="true" />
                  <div className="janus-capsule-copy">
                    <span className="janus-capsule-kicker">{t('janus:island.capsule.kicker.janus')}</span>
                    <span className="janus-capsule-title">{t('janus:island.capsule.empty.title')}</span>
                    <span className="janus-capsule-subtitle">{t('janus:island.capsule.empty.subtitle')}</span>
                  </div>
                </div>
              </div>
            ) : splitCapsule ? (
              <div className="janus-capsule janus-capsule-split" key={`split:${capsuleNotifications.map((notification) => notification.id).join('|')}`}>
                {capsuleNotifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className="janus-capsule-cell"
                    title={t(notification.copy.titleKey)}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (notification.actions[0]) runNotificationAction(notification.id, notification.actions[0].id)
                    }}
                  >
                    <span className={`janus-capsule-led sev-${notification.severity}`} aria-hidden="true" />
                    <span className="janus-capsule-cell-copy">
                      <span className="janus-capsule-kicker">{t(notificationKickerKey(notification.kind))}</span>
                      <span className="janus-capsule-cell-title">{t(notification.copy.titleKey)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : capsuleTopNotification ? (
              <div className="janus-capsule" key={capsuleTopNotification.id}>
                <div className="janus-capsule-row">
                  <span className={`janus-capsule-led sev-${capsuleTopNotification.severity}`} aria-hidden="true" />
                  <div className="janus-capsule-copy">
                    <span className="janus-capsule-kicker">{t(notificationKickerKey(capsuleTopNotification.kind))}</span>
                    <span className="janus-capsule-title">{t(capsuleTopNotification.copy.titleKey)}</span>
                    {capsuleTopNotification.copy.subtitleKey ? (
                      <span className="janus-capsule-subtitle">{t(capsuleTopNotification.copy.subtitleKey, capsuleTopNotification.copy.subtitleValues)}</span>
                    ) : capsuleTopNotification.copy.subtitleText ? (
                      <span className="janus-capsule-subtitle">{capsuleTopNotification.copy.subtitleText}</span>
                    ) : null}
                  </div>
                  {capsuleTopNotification.copy.metaKey ? (
                    <span className="janus-capsule-meta">{t(capsuleTopNotification.copy.metaKey, capsuleTopNotification.copy.metaValues)}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <JanusIslandExpandedShell
          stage={stage}
          view={view}
          setView={setView}
          parchmentOpen={parchmentOpen}
          parchmentDetailOpen={auxiliaryModule === 'roundtable-parchment'}
          onToggleParchment={() => {
            if (auxiliaryModule === 'roundtable-parchment') {
              requestCloseAuxiliary()
              return
            }
            setParchmentOpen(true)
            setAuxiliaryClosing(false)
            setAuxiliaryModule('roundtable-parchment')
          }}
          onOpenParchmentDetail={() => {
            setParchmentOpen(true)
            setAuxiliaryClosing(false)
            setAuxiliaryModule('roundtable-parchment')
          }}
          onOpenAgentResult={(card) => { setActiveAgentCard(card); setAuxiliaryModule('agent-result'); setAuxiliaryClosing(false) }}
          onOpenQuestionsDetail={() => { setAuxiliaryClosing(false); setAuxiliaryModule('roundtable-questions') }}
          onRequestAuxiliaryClose={requestCloseAuxiliary}
          onRoundtableStateChange={setRoundtableState}
          mode={mode}
          janusRunning={janusRunning}
          activeNode={!!activeNode}
          activeNodeTitle={activeNodeTitle}
          workspaceLabel={workspaceLabel}
          modeLabel={modeLabel}
          modeColor={modeColor}
          statusText={statusText}
          maintenanceTask={maintenanceTask}
          onOpenMaintenance={handleOpenMaintenance}
          onCancelMaintenance={(taskId) => void cancelMaintenance(taskId)}
          onOpenBlueprintWorkbench={handleOpenBlueprintWorkbench}
          notifications={visibleNotifications}
          bannerNotification={bannerNotification}
          trayOpen={trayOpen}
          notifyPulse={notifyPulse}
          onToggleTray={() => setTrayOpen((open) => !open)}
          onNotificationAction={runNotificationAction}
          onBannerDismiss={() => setBannerId(null)}
          onTrayClear={() => { setClearedIds((ids) => [...ids, ...visibleNotifications.filter((n) => !ids.includes(n.id)).map((n) => n.id)]); setBannerId(null) }}
          productFiles={productFiles}
          onOpenProductFile={onOpenProductFile}
          messages={messages}
          pendingContent={pendingContent}
          isStreaming={isStreaming}
          error={error}
          modelOptions={modelOptions}
          activeModel={activeModel}
          modelNotice={modelNotice}
          onChatSelectModel={onChatSelectModel}
          onChatSend={onChatSend}
          onChatRewrite={onChatRewrite}
          onChatStop={onChatStop}
          onChatRetry={onChatRetry}
          onChatClear={onChatClear}
          conversationController={conversationController}
          resourceController={resourceController}
          toolTraces={toolTraces}
        />
      </div>
      {stage === 'expanded' && auxiliaryDescriptor ? (
        <JanusAuxiliaryIsland
          module={auxiliaryDescriptor}
          closing={auxiliaryClosing}
          onClose={requestCloseAuxiliary}
          actions={auxiliaryModule === 'roundtable-parchment' && roundtableState?.sessionId && roundtableState.phase !== 'idle' ? (
            <>
              {parchmentExportNotice ? (
                <span className="janus-auxiliary-export-notice" role="status">{
                  parchmentExportNotice === 'saved' ? t('janus:roundtable.export.saved') : parchmentExportNotice === 'copied' ? t('janus:roundtable.export.copied') : parchmentExportNotice === 'canceled' ? t('janus:roundtable.export.canceled') : t('janus:roundtable.export.failed')
                }</span>
              ) : null}
              {parchmentExportNotice === 'error' ? (
                <button type="button" className="janus-auxiliary-export" disabled={parchmentExportBusy} onClick={() => void handleParchmentCopy()}>
                  {t('janus:roundtable.export.copy')}
                </button>
              ) : null}
              <button
                type="button"
                className="janus-auxiliary-export"
                aria-label={t('janus:roundtable.export.actionAria')}
                title={roundtableState.phase === 'running' ? t('janus:roundtable.export.lockedTitle') : t('janus:roundtable.export.actionTitle')}
                disabled={parchmentExportBusy || roundtableState.phase === 'running'}
                onClick={() => void handleParchmentExport()}
              >
                <Download size={15} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </>
          ) : undefined}
        >
          {auxiliaryModule === 'roundtable-parchment' ? <JanusRoundtableParchment detailed document={roundtableState ? projectParchment(roundtableState) : undefined} /> : auxiliaryModule === 'roundtable-questions' ? <JanusRoundtableQuestions roundNumber={roundtableState?.roundNumber ?? 0} open={roundtableOpenQuestions} answered={roundtableAnsweredQuestions} /> : <div key={activeAgentCard?.id ?? 'agent-result-empty'} className="janus-agent-result-detail" data-detailed="true">
            <div className="janus-agent-result-detail__eyebrow">{t('janus:roundtable.cardDetail.eyebrow')} // {activeAgentCard?.status ? t(ROUNDTABLE_CARD_STATUS_KEYS[activeAgentCard.status]) : t('janus:roundtable.cardDetail.waiting')}</div>
            <h2>{activeAgentCard?.title ?? t('janus:roundtable.cardDetail.titleFallback')}</h2>
            <p className="janus-agent-result-detail__summary">{activeAgentCard?.summary ?? t('janus:roundtable.cardDetail.summaryFallback')}</p>
            {activeAgentCard?.sections?.map((section) => <section key={section.id}><h3>{section.title}</h3><p>{section.markdown}</p></section>)}
            {!!activeAgentCard?.evidenceRefs?.length && <div className="janus-agent-result-detail__evidence"><strong>{t('janus:roundtable.cardDetail.evidence')}</strong><span>{activeAgentCard.evidenceRefs.map((ref) => ref.kind === 'workspace-file' ? `${ref.workspaceId}/${ref.relativePath}${typeof ref.lineStart === 'number' ? `#L${ref.lineStart}${typeof ref.lineEnd === 'number' && ref.lineEnd !== ref.lineStart ? `-${ref.lineEnd}` : ''}` : ''}${ref.sha256 ? ` · ${ref.sha256.slice(0, 8)}` : ''}` : ref.kind === 'agent-card' ? ref.cardId : ref.eventId).join(' · ')}</span></div>}
            {(() => {
              const tools = roundtableToolCalls.filter((item) => item.agentId === activeAgentCard?.agentId)
              if (!tools.length) return null
              return <div className="janus-agent-result-detail__evidence"><strong>{t('janus:roundtable.cardDetail.workspaceReads')}</strong><span>{tools.map((item) => `${item.toolName}:${item.status}${item.errorCode ? `(${item.errorCode})` : ''}`).join(' · ')}</span></div>
            })()}
            {activeAgentCard && <div className="janus-agent-result-detail__evidence"><strong>{t('janus:roundtable.cardDetail.sourceIndex')}</strong><span>{activeAgentCard.sourceEventIds.join(', ') || t('janus:roundtable.cardDetail.noSources')}</span></div>}
            {activeAgentCard && <small>{t('janus:roundtable.cardDetail.updated', { time: new Date(activeAgentCard.updatedAt || activeAgentCard.createdAt).toLocaleString() })}</small>}
          </div>}
        </JanusAuxiliaryIsland>
      ) : null}
    </div>
  )
}
