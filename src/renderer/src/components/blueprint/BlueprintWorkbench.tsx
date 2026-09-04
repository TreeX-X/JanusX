import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { JanusIdentityCore } from '@/components/janus/JanusIdentityCore'
import { BlueprintView } from './BlueprintView'
import { BlueprintSelectPortalContext } from './blueprintSelectPortal'
import { BlueprintDetailPortalContext } from './blueprintDetailPortal'
import { BlueprintMaintenancePanel } from './BlueprintMaintenancePanel'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useI18n } from '@/i18n/useI18n'
import { useWorkbenchPhase } from '@/components/shared/CardFrame'
import './blueprint.css'

interface BlueprintWorkbenchProps {
  isOpen: boolean
  onClose: () => void
}

const WORKBENCH_CARD_ENTER_STAGGER_MS = 180
const WORKBENCH_CARD_ENTER_DURATION_MS = 260
const WORKBENCH_CARD_EXIT_STAGGER_MS = 60
const WORKBENCH_CARD_EXIT_DURATION_MS = 260
const WORKBENCH_EXIT_BUFFER_MS = 60

const cardStyle = (index: number): CSSProperties => ({
  '--card-index': index
} as CSSProperties)

interface WorkbenchCardPlan {
  detailOpen: boolean
  janusOpen: boolean
}

export function BlueprintWorkbench({ isOpen, onClose }: BlueprintWorkbenchProps) {
  const { t } = useI18n('blueprint')
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const maintenanceTasks = useBlueprintMaintenanceStore((s) => s.tasks)
  const maintenanceInitialized = useBlueprintMaintenanceStore((s) => s.initialized)
  const openRequest = useBlueprintMaintenanceStore((s) => s.openRequest)
  const initializeMaintenance = useBlueprintMaintenanceStore((s) => s.initialize)
  const requestOpen = useBlueprintMaintenanceStore((s) => s.requestOpen)
  const [maintenanceOpen, setMaintenanceOpen] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  // 工作台专属下拉承载层：z-index 12001，恰好高于遮罩 12000；
  // 零尺寸 + overflow visible，不拦截点击、不裁切子节点。
  // Select 通过 getPortalContainer 把浮层挂进这里，进入比遮罩更高的层叠上下文。
  const [selectPortalNode, setSelectPortalNode] = useState<HTMLDivElement | null>(null)
  const [detailPortalNode, setDetailPortalNode] = useState<HTMLDivElement | null>(null)
  const activeCardPlanRef = useRef<WorkbenchCardPlan>({ detailOpen, janusOpen: maintenanceOpen })
  activeCardPlanRef.current = { detailOpen, janusOpen: maintenanceOpen }
  const [revealReady, setRevealReady] = useState(false)
  const [closingPlan, setClosingPlan] = useState<WorkbenchCardPlan>({ detailOpen: false, janusOpen: true })
  // Shared card-frame lifecycle (§9): phase machine + stuck-animation safety
  // net; the closing card plan snapshot stays blueprint business logic.
  const {
    phase,
    isClosing,
    requestClose: phaseRequestClose,
    handleExitFinished,
  } = useWorkbenchPhase(isOpen, { awaitAnimation: true, exitMs: 600, onClose })
  const requestClose = useCallback(() => {
    setClosingPlan({ detailOpen, janusOpen: maintenanceOpen })
    phaseRequestClose()
  }, [detailOpen, maintenanceOpen, phaseRequestClose])

  useEffect(() => {
    if (!isOpen) {
      setClosingPlan(activeCardPlanRef.current)
      return
    }
    setRevealReady(false)
    const frame = requestAnimationFrame(() => setRevealReady(true))
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (maintenanceOpen) setMaintenanceOpen(false)
      else requestClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, maintenanceOpen, requestClose])

  useEffect(() => {
    if (isOpen && openRequest) setMaintenanceOpen(true)
  }, [isOpen, openRequest])

  useEffect(() => {
    if (isOpen && !maintenanceInitialized) void initializeMaintenance()
  }, [initializeMaintenance, isOpen, maintenanceInitialized])

  const maintenanceTask = useMemo(
    () => maintenanceTasks.find((task) => task.blueprintId === currentBlueprint?.id && !['completed', 'cancelled'].includes(task.status)) ?? null,
    [currentBlueprint?.id, maintenanceTasks],
  )

  const maintenanceState = useMemo(() => {
    if (!currentBlueprint) return { tone: 'disabled', label: t('blueprint:workbench.stateDisconnected') }
    if (!maintenanceTask) return { tone: 'idle', label: t('blueprint:workbench.stateStandby') }
    if (maintenanceTask.status === 'analyzing' || maintenanceTask.status === 'applying') {
      return { tone: 'working', label: maintenanceTask.status === 'applying' ? t('blueprint:workbench.stateApplying') : t('blueprint:workbench.stateAnalyzing') }
    }
    if (maintenanceTask.status === 'proposal-ready') return { tone: 'attention', label: t('blueprint:workbench.statePendingReview') }
    if (maintenanceTask.status === 'failed' || maintenanceTask.status === 'stale') return { tone: 'error', label: t('blueprint:workbench.stateNeedAttention') }
    return { tone: 'active', label: t('blueprint:workbench.stateInConversation') }
  }, [currentBlueprint, maintenanceTask, t])
  const maintenanceIdentityState = maintenanceState.tone === 'working'
    ? 'scanning'
    : maintenanceState.tone === 'error'
      ? 'failed'
      : maintenanceState.tone === 'active'
        ? 'running'
        : 'default'

  if (phase === 'hidden') return null
  const cardPlan = isClosing ? closingPlan : { detailOpen, janusOpen: maintenanceOpen }
  const cardCount = 2 + Number(cardPlan.janusOpen) + Number(cardPlan.detailOpen)
  const exitDuration = WORKBENCH_CARD_EXIT_DURATION_MS
    + Math.max(0, cardCount - 1) * WORKBENCH_CARD_EXIT_STAGGER_MS
    + WORKBENCH_EXIT_BUFFER_MS
  const canvasCardIndex = cardPlan.detailOpen ? 2 : 1
  const janusCardIndex = cardPlan.detailOpen ? 3 : 2

  return createPortal(
    <BlueprintSelectPortalContext.Provider value={selectPortalNode}>
      <BlueprintDetailPortalContext.Provider value={detailPortalNode}>
      <div
        className="blueprint-workbench-backdrop"
        data-closing={isClosing ? "true" : undefined}
        onAnimationEnd={(event) => {
          if (!isClosing || event.target !== event.currentTarget) return
          handleExitFinished()
        }}
        style={{ '--workbench-exit-duration': `${exitDuration}ms` } as CSSProperties}
      >
        <section
          className="blueprint-workbench-shell"
          data-closing={isClosing ? "true" : undefined}
          data-reveal-ready={revealReady ? "true" : undefined}
          data-card-count={cardCount}
          style={{
            '--card-count': cardCount,
            '--card-enter-stagger': `${WORKBENCH_CARD_ENTER_STAGGER_MS}ms`,
            '--card-enter-duration': `${WORKBENCH_CARD_ENTER_DURATION_MS}ms`,
            '--card-exit-stagger': `${WORKBENCH_CARD_EXIT_STAGGER_MS}ms`,
          } as CSSProperties}
          aria-label={t('blueprint:workbench.ariaLabel')}
        >
        <header className="blueprint-workbench-topbar" style={cardStyle(0)}>
          <div className="blueprint-workbench-tab" title={currentBlueprint?.name ?? t('blueprint:workbench.breadcrumb')}>
            {currentBlueprint?.name ?? t('blueprint:workbench.breadcrumb')}
          </div>
          <div className="blueprint-workbench-actions">
            <button
              type="button"
              className="blueprint-janus-capsule"
              data-state={maintenanceState.tone}
              disabled={!currentBlueprint}
              aria-label={t('blueprint:workbench.copilotOpenAria', { state: maintenanceState.label })}
              aria-expanded={maintenanceOpen}
              onClick={() => {
                if (!currentBlueprint) return
                if (maintenanceOpen) {
                  setMaintenanceOpen(false)
                  return
                }
                requestOpen({ blueprintId: currentBlueprint.id })
                setMaintenanceOpen(true)
              }}
            >
              <JanusIdentityCore
                identity="main"
                state={maintenanceIdentityState}
                size="pod"
                showHalo={false}
                showScanline={false}
                className="blueprint-janus-capsule__identity"
                aria-label={t('blueprint:workbench.copilotIdentityAria', { state: maintenanceState.label })}
              />
              <span className="blueprint-janus-capsule__name">{t('blueprint:workbench.copilotName')}</span>
              <span className="blueprint-janus-capsule__status">
                {maintenanceState.tone === 'working'
                  ? t('blueprint:workbench.statusRunning')
                  : maintenanceState.tone === 'attention'
                    ? t('blueprint:workbench.statusActionRequired')
                    : maintenanceState.tone === 'error'
                      ? t('blueprint:workbench.statusError')
                      : maintenanceState.tone === 'disabled'
                        ? t('blueprint:workbench.statusOffline')
                        : t('blueprint:workbench.statusIdle')}
              </span>
              <ChevronRight className="blueprint-janus-capsule__chevron" size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="blueprint-workbench-close"
              onClick={requestClose}
              aria-label={t('blueprint:workbench.closeAria')}
              title={t('blueprint:workbench.closeTitle')}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className="blueprint-workbench-body"
          data-janus-open={cardPlan.janusOpen ? 'true' : 'false'}
          data-detail-open={cardPlan.detailOpen ? 'true' : 'false'}
        >
          <div
            ref={setDetailPortalNode}
            className="blueprint-workbench-detail-slot"
            data-open={cardPlan.detailOpen ? 'true' : 'false'}
            style={cardStyle(1)}
          />
          <div className="blueprint-workbench-card blueprint-workbench-card--canvas" style={cardStyle(canvasCardIndex)}>
            <BlueprintView density="workbench" onDetailOpenChange={setDetailOpen} />
          </div>
          {cardPlan.janusOpen ? (
            <aside className="blueprint-workbench-card blueprint-workbench-card--janus" style={cardStyle(janusCardIndex)}>
              <BlueprintMaintenancePanel onClose={() => setMaintenanceOpen(false)} />
            </aside>
          ) : null}
        </div>
      </section>
    </div>
      {createPortal(
        <div
          ref={setSelectPortalNode}
          className="blueprint-select-portal-layer"
        />,
        document.body
      )}
      </BlueprintDetailPortalContext.Provider>
    </BlueprintSelectPortalContext.Provider>,
    document.body,
  )
}
