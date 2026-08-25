import { useState, useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useI18n } from '@/i18n/useI18n'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { useJanusState } from './useJanusState'
import { STATUS_VISUALS } from '../blueprint/blueprintStatus'
import { formatKnowledgeMatch } from './islandKnowledgePeek'
import { JanusIslandExpandedShell } from './JanusIslandExpandedShell'
import { faceClass } from './janusIslandRuntime'
import type { JanusExpandedView, JanusIslandProps } from './janusIslandTypes'
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

  useEffect(() => {
    if (stage === 'peek') setView('monitor')
  }, [stage])

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

        <JanusIslandExpandedShell
          stage={stage}
          view={view}
          setView={setView}
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
          officeArtifacts={officeArtifacts}
          onOpenOfficeArtifact={onOpenOfficeArtifact}
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
          onAddChatToWorkspace={onAddChatToWorkspace}
          resourceController={resourceController}
          toolTraces={toolTraces}
        />
      </div>
    </div>
  )
}
