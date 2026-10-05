import { useState, useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Download } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useI18n } from '@/i18n/useI18n'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { useJanusState } from './useJanusState'
import { getBlueprintStatusVisual } from '../blueprint/blueprintStatus'
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
import { clampIslandDragOffset, shouldSuppressIslandDismiss } from './islandInteraction'

const ISLAND_PINNED_STORAGE_KEY = 'janus:island-chat-pinned'
const DRAG_OFFSET_STORAGE_KEY = 'janus:island-drag-offset'

function loadIslandPinned(): boolean {
  try {
    return window.localStorage.getItem(ISLAND_PINNED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function loadDragOffset(): { x: number; y: number } {
  try {
    const raw = window.localStorage.getItem(DRAG_OFFSET_STORAGE_KEY)
    if (!raw) return { x: 0, y: 0 }
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      return clampIslandDragOffset({ x: parsed.x, y: parsed.y }, { width: window.innerWidth, height: window.innerHeight })
    }
  } catch {
    /* corrupted offset falls back to centered */
  }
  return { x: 0, y: 0 }
}
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
  onIslandPinnedChange,
}: JanusIslandProps) {
  const { t } = useI18n('janus')
  const { mode, isSwitching, activeWorkspace, eyeContainerRef, hasRunning } = useJanusState()
  const { janusRunning, startActiveOnce } = useProjectRunning(activeWorkspace)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<JanusExpandedView>('monitor')

  /* Island window persistence + drag (expanded stage, all views).
   * Pin survives implicit dismiss (outside click / Esc / terminal switch);
   * explicit double-activate still collapses back to the capsule. The drag
   * offset applies to the expanded panel only — the capsule always stays
   * centered, and streaming never blocks the collapse. */
  const [islandPinned, setIslandPinned] = useState<boolean>(() => loadIslandPinned())
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>(() => loadDragOffset())
  const [isDraggingIsland, setIsDraggingIsland] = useState(false)
  const dragStartRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; panelW: number; panelH: number } | null>(null)
  const pendingOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const chatLoading = isStreaming || pendingContent.length > 0

  const updateIslandPinned = useCallback((next: boolean) => {
    setIslandPinned(next)
    try {
      window.localStorage.setItem(ISLAND_PINNED_STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* persistence is best-effort */
    }
    onIslandPinnedChange?.(next)
  }, [onIslandPinnedChange])

  const toggleIslandPinned = useCallback(() => {
    updateIslandPinned(!islandPinned)
  }, [islandPinned, updateIslandPinned])

  const applyDragTransform = useCallback((offset: { x: number; y: number }) => {
    const shell = shellRef.current
    if (!shell) return
    shell.style.transform = offset.x === 0 && offset.y === 0
      ? ''
      : `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`
  }, [])

  const handleIslandTopbarPointerDown = useCallback((event: ReactPointerEvent) => {
    if (stage !== 'expanded' || event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, input, textarea, select, a, [contenteditable="true"]')) return
    // Keep the island gesture layer out: a topbar drag is a window move,
    // never a tap/double-tap on the island body.
    event.preventDefault()
    event.stopPropagation()
    // Measure once per gesture: reading offsetWidth mid-drag would thrash
    // layout against the direct transform writes below.
    const shell = shellRef.current
    dragStartRef.current = {
      startX: event.clientX, startY: event.clientY, baseX: dragOffset.x, baseY: dragOffset.y,
      panelW: shell?.offsetWidth ?? 0, panelH: shell?.offsetHeight ?? 0,
    }
    pendingOffsetRef.current = null
    setIsDraggingIsland(true)
  }, [stage, dragOffset])

  useEffect(() => {
    if (!isDraggingIsland) return
    const handleMove = (event: PointerEvent) => {
      const start = dragStartRef.current
      if (!start) return
      const next = clampIslandDragOffset(
        { x: start.baseX + (event.clientX - start.startX), y: start.baseY + (event.clientY - start.startY) },
        { width: window.innerWidth, height: window.innerHeight },
        { width: start.panelW, height: start.panelH },
      )
      pendingOffsetRef.current = next
      // Direct DOM write: dragging must not re-render the chat subtree.
      const shell = shellRef.current
      if (shell) {
        shell.style.transform = next.x === 0 && next.y === 0
          ? ''
          : `translate(calc(-50% + ${next.x}px), ${next.y}px)`
      }
    }
    const handleUp = () => {
      const next = pendingOffsetRef.current
      pendingOffsetRef.current = null
      dragStartRef.current = null
      setIsDraggingIsland(false)
      if (next) {
        setDragOffset(next)
        try {
          window.localStorage.setItem(DRAG_OFFSET_STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* persistence is best-effort */
        }
      }
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [isDraggingIsland])

  // Re-apply the persisted offset whenever the expanded panel (re)mounts;
  // collapsing always clears the transform so the capsule stays centered.
  useEffect(() => {
    if (stage !== 'expanded') {
      if (shellRef.current) shellRef.current.style.transform = ''
      return
    }
    applyDragTransform(dragOffset)
  }, [stage, dragOffset, applyDragTransform])
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
    // Explicit collapse always wins: a pinned island window still returns to
    // the capsule in one gesture and drops the pin on the way.
    if (islandPinned) updateIslandPinned(false)
    onDoubleActivate()
  }, [islandPinned, onDoubleActivate, updateIslandPinned])
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
  const activeVisual = activeNode ? getBlueprintStatusVisual(activeNode.status)  : null
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
  const messageCount = messages.length
  const prevMessageCountRef = useRef(messageCount)

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

  // A newly arrived user turn follows into the chat view from the monitor
  // overview. Streaming/thinking ticks (isStreaming, pendingContent) never
  // steal the view, so loading never yanks the island around — and the
  // roundtable keeps its own discussion while the main chat streams.
  useEffect(() => {
    const grew = messageCount > prevMessageCountRef.current
    prevMessageCountRef.current = messageCount
    if (!grew) return
    if (stage === 'expanded' && view === 'monitor') {
      setView('chat')
    }
  }, [messageCount, stage, view])

  // Implicit dismiss is suppressed while the island window is pinned; the
  // stream lifecycle lives in useJanusChat, so collapsing mid-stream is
  // always safe and the capsule keeps a loading dot until it settles.
  const islandDismissSuppressed = shouldSuppressIslandDismiss({ stage, islandPinned })

  useEffect(() => {
    if (stage === 'collapsed') return
    const handlePointerDown = (event: PointerEvent) => {
      if (islandDismissSuppressed) return
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
      if (islandDismissSuppressed) return
      onDismiss()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [islandDismissSuppressed, onDismiss, stage, trayOpen])

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

  // The veil is a viewport backdrop (position:fixed inset:0). It must live at
  // body level: any transformed ancestor (shell translateX, cluster centering,
  // drag offset) would trap it into a shell-sized square with sharp corners
  // painting above the panel instead of a full-viewport dim below it.
  const veil = stage === 'expanded' && typeof document !== 'undefined'
    ? createPortal(
      <div className="janus-veil" aria-hidden="true" style={{ zIndex: 1999 }} />,
      document.body,
    )
    : null

  return (
    <>
      {veil}
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
      data-pinned={islandPinned ? 'true' : 'false'}
      data-loading={chatLoading ? 'true' : 'false'}
      data-dragging={isDraggingIsland ? 'true' : 'false'}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
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
          islandPinned={islandPinned}
          onToggleIslandPin={toggleIslandPinned}
          onTopbarPointerDown={handleIslandTopbarPointerDown}
          isDraggingIsland={isDraggingIsland}
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
    </>
  )
}
